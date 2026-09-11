/**
 * Der Chat: Frage rein, belegte Antwort raus.
 *
 * Der Ablauf in einem Satz: Besitz prüfen → Frage einbetten → hybride Suche →
 * Ausschnitte nummeriert vorlegen → Antwort strömen → Belege prüfen und
 * zusammen mit der Antwort speichern.
 *
 * ── Zwei Entscheidungen, die hier sichtbar sind ───────────────────────────
 *
 * **Kein Secret-Key-Client.** Alles läuft über den RLS-Client mit der Sitzung
 * des Nutzers, `match_chunks` eingeschlossen — die Funktion ist
 * `security invoker`, die Policy greift also in ihrem Rumpf. Diese Route ist
 * damit gar nicht in der Lage, fremde Quellen zu lesen, selbst wenn die
 * Prüfung oben fehlte. Auch das Verbrauchsprotokoll läuft darüber — siehe
 * Migration 0008, warum dafür keine erhöhten Rechte nötig sind.
 *
 * **Die Ausschnitte gehen vor der Antwort an den Client.** Sie werden als
 * eigener Teil in denselben Strom geschrieben. Dadurch kann die Oberfläche
 * `[1]` schon während des Strömens als anklickbaren Beleg darstellen, statt
 * am Ende nachzuladen. Es sind die eigenen Quellen des Nutzers — es wird ihm
 * nichts gezeigt, was er nicht ohnehin sehen darf.
 */
import { createUIMessageStream, createUIMessageStreamResponse, streamText } from 'ai'
import { after } from 'next/server'
import { z } from 'zod'

import { parseCitations, type RetrievedChunk } from '@/lib/chat/citations'
import { SYSTEM_PROMPT, buildContext, buildUserMessage } from '@/lib/chat/prompt'
import { retrieveChunks } from '@/lib/chat/retrieve'
import { chatModel } from '@/lib/llm/chat'
import { providerOrDefault } from '@/lib/llm/registry'
import { logLlmCall } from '@/lib/llm/usage'
import { createClient } from '@/lib/supabase/server'

/**
 * Eine Antwort mit Suche und Modellaufruf braucht länger als die
 * Voreinstellung von Vercel. 300 s ist die Obergrenze auf dem kostenlosen
 * Tarif; erreicht wird sie nie, aber ein Abbruch mitten im Satz wäre der
 * schlechteste sichtbare Fehler dieses Produkts.
 */
export const maxDuration = 300

/**
 * Eine Frage ist länger als ein Suchbegriff und kürzer als ein Dokument. Wer
 * mehr schickt, will nicht fragen, sondern Kontext unterschieben.
 */
const MAX_QUESTION_CHARS = 2000

const AnfrageSchema = z.object({
  notebookId: z.uuid(),
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  /**
   * `null` heißt „alle Quellen". Ein leeres Array heißt „keine" — hat der
   * Nutzer alles abgewählt, soll die Antwort das sagen und nicht heimlich
   * doch auf allen Quellen beruhen.
   */
  sourceIds: z.array(z.uuid()).nullable()
})

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()

  // `getUser()` und nicht `getSession()`: getSession liest das Cookie und
  // glaubt ihm, getUser prüft die Signatur beim Auth-Server.
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ message: 'Nicht angemeldet.' }, { status: 401 })

  const eingabe = AnfrageSchema.safeParse(await request.json().catch(() => null))
  if (!eingabe.success) {
    return Response.json({ message: 'Die Anfrage ist unvollständig.' }, { status: 400 })
  }
  const { notebookId, question, sourceIds } = eingabe.data

  // Der Besitz wird über den RLS-Client geprüft: gehört das Notebook einem
  // anderen, findet die Policy es nicht. 404 und nicht 403 — ein 403
  // bestätigte, dass es dieses Notebook gibt.
  const { data: notebook } = await supabase
    .from('notebooks')
    .select('id, chat_provider')
    .eq('id', notebookId)
    .maybeSingle<{ id: string; chat_provider: string }>()

  if (!notebook) return Response.json({ message: 'Nicht gefunden.' }, { status: 404 })

  const provider = providerOrDefault(notebook.chat_provider)

  // Die Frage wird gespeichert, bevor geantwortet wird. Bricht der Lauf
  // danach ab, steht sie trotzdem im Verlauf — ein Gespräch, aus dem die
  // eigene Frage verschwindet, wirkt kaputter als eine fehlende Antwort.
  const { error: frageError } = await supabase
    .from('messages')
    .insert({ notebook_id: notebookId, role: 'user', content: question })

  if (frageError) {
    return Response.json({ message: 'Die Frage konnte nicht gespeichert werden.' }, { status: 500 })
  }

  let gefunden: RetrievedChunk[]
  let embedTokens: number
  try {
    const treffer = await retrieveChunks(supabase, notebookId, question, sourceIds)
    gefunden = treffer.chunks
    embedTokens = treffer.embedTokens
  } catch (error) {
    // Eine ausgefallene Suche darf nicht als „dazu steht nichts in Ihren
    // Quellen" erscheinen. Das wäre eine inhaltliche Aussage über die
    // Dokumente, die niemand geprüft hat.
    console.error('[chat] Suche fehlgeschlagen', error)
    return Response.json(
      { message: 'Die Suche in Ihren Quellen ist fehlgeschlagen. Bitte erneut versuchen.' },
      { status: 502 }
    )
  }

  // `used` und nicht `gefunden`: der Kontext kann an der Zeichengrenze
  // gekürzt worden sein, und die Nummern im Text beziehen sich auf das, was
  // das Modell tatsächlich gesehen hat.
  const { context, used } = buildContext(gefunden)
  const { model, modelId } = chatModel(provider.id)
  const begonnen = Date.now()

  const stream = createUIMessageStream({
    execute({ writer }) {
      // Zuerst die Ausschnitte, dann der Text. Die Oberfläche kann damit
      // jeden Beleg sofort auflösen, während die Antwort noch läuft.
      writer.write({
        type: 'data-sources',
        data: used.map((c, i) => ({
          n: i + 1,
          sourceId: c.sourceId,
          sourceTitle: c.sourceTitle,
          pageNumber: c.pageNumber,
          charStart: c.charStart,
          charEnd: c.charEnd,
          excerpt: c.content
        }))
      })

      const antwort = streamText({
        model,
        system: SYSTEM_PROMPT,
        prompt: buildUserMessage(context, question),
        onFinish({ text, usage }) {
          // Erst hier steht der ganze Text fest — Belege lassen sich nicht
          // prüfen, solange noch Zeichen nachkommen können.
          const { text: bereinigt, citations, dropped } = parseCitations(text, used)

          if (dropped > 0) {
            // Kein Nutzerproblem, sondern eines des System-Prompts. Steigt
            // diese Zahl, stimmt an der Anweisung etwas nicht — und ohne
            // Protokollierung merkt das niemand.
            console.warn(`[chat] ${dropped} erfundene Belege entfernt (${modelId})`)
          }

          // Nach der Antwort, nicht davor: der Nutzer soll nicht auf das
          // Speichern warten.
          after(async () => {
            const { error } = await supabase.from('messages').insert({
              notebook_id: notebookId,
              role: 'assistant',
              content: bereinigt,
              citations,
              provider: provider.id,
              model: modelId
            })
            if (error) console.error('[chat] Antwort nicht gespeichert', error)

            // Auch das Protokoll läuft über den RLS-Client. Die Policy auf
            // `llm_calls` bindet die Zeile per `with check` an den Aufrufer,
            // eine fremde user_id ist also gar nicht eintragbar. Der
            // Secret-Key-Client bleibt damit dem Verarbeitungslauf
            // vorbehalten — für eine Statistikzeile ist er der falsche Preis.
            await logLlmCall(supabase, {
              userId: user.id,
              notebookId,
              kind: 'chat',
              provider: provider.id,
              model: modelId,
              // Das Einbetten der Frage gehört zum selben Vorgang: es ist
              // Aufwand, den diese Frage verursacht hat.
              inputTokens: (usage.inputTokens ?? 0) + embedTokens,
              outputTokens: usage.outputTokens ?? 0,
              durationMs: Date.now() - begonnen
            })
          })
        }
      })

      writer.merge(antwort.toUIMessageStream({ sendStart: false }))
    },
    onError(error) {
      console.error('[chat] Antwort fehlgeschlagen', error)
      return 'Die Antwort konnte nicht erzeugt werden. Bitte erneut versuchen.'
    }
  })

  return createUIMessageStreamResponse({ stream })
}
