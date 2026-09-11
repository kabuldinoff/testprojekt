/**
 * Erzeugt den Audio-Überblick eines Notebooks.
 *
 * Derselbe Aufbau wie die Ingest-Route: Besitz über den RLS-Client prüfen,
 * sofort antworten, die Arbeit in `after()` erledigen. Die Begründung für
 * diesen Zuschnitt — und dafür, dass nur hier und im Ingest der Secret-Key-
 * Client erreichbar ist — steht in `src/lib/supabase/admin.ts`.
 */
import { after } from 'next/server'
import { z } from 'zod'

import { PROVIDERS, providerOrDefault } from '@/lib/llm/registry'
import { generateOverview } from '@/lib/studio/overview'
import { createClient } from '@/lib/supabase/server'

/**
 * Skript und Vertonung zusammen dauern bei drei Minuten Audio rund
 * anderthalb Minuten. 300 s ist die Obergrenze auf dem kostenlosen Tarif und
 * lässt reichlich Luft.
 */
export const maxDuration = 300

const AnfrageSchema = z.object({ notebookId: z.uuid() })

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
  const { notebookId } = eingabe.data

  // Besitz über den RLS-Client. Ein fremdes Notebook findet die Policy nicht;
  // 404 und nicht 403, weil ein 403 dessen Existenz bestätigte.
  const { data: notebook } = await supabase
    .from('notebooks')
    .select('id, chat_provider')
    .eq('id', notebookId)
    .maybeSingle<{ id: string; chat_provider: string }>()

  if (!notebook) return Response.json({ message: 'Nicht gefunden.' }, { status: 404 })

  // Die Fähigkeitsprüfung gehört hierher und nicht nur in die Oberfläche.
  //
  // Der Überblick geht immer über Gemini — vertonen kann nur dieser Anbieter.
  // Steht das Notebook auf Mistral, hat der Nutzer die Zusage „Vollständig in
  // der EU" vor sich. Ein direkter Aufruf an diese Route würde die Quellen
  // trotzdem an Google schicken und diese Zusage brechen, ohne dass jemand es
  // merkte. Eine ausgegraute Schaltfläche ist dagegen keine Grenze.
  const provider = providerOrDefault(notebook.chat_provider)
  if (!provider.capabilities.tts) {
    return Response.json(
      {
        message:
          `Der Audio-Überblick ist mit ${provider.label} nicht verfügbar. ` +
          `Stellen Sie das Notebook auf ${PROVIDERS.gemini.label} um.`
      },
      { status: 409 }
    )
  }

  // Anfordern heißt: die Zeile auf `pending` bringen — in genau drei Fällen,
  // und die Datenbank entscheidet welcher.
  //
  //   1. Es gibt einen abgeschlossenen Überblick → zurück auf `pending`.
  //   2. Es gibt keinen → anlegen.
  //   3. Es läuft bereits einer → nichts tun, 409.
  //
  // Fall 3 trägt die Policy, nicht dieser Code: Ihr `using` lässt ein Update
  // nur aus `ready`, `script_only` oder `failed` heraus zu. Ein zweiter Klick
  // oder ein zweiter Browser-Tab kann einen laufenden Job damit gar nicht
  // zurücksetzen. Täte er es, liefen zwei Vertonungen gegen dieselbe Zeile —
  // beim teuersten Schritt des Projekts der schlechteste Doppellauf.
  //
  // Über den RLS-Client, nicht über den Worker: Das ist die Handlung des
  // Nutzers, und die Policy soll sie tragen. Geschrieben wird nur `status`;
  // mehr ist `authenticated` gar nicht gewährt (Migration 0011).
  const { data: aktualisiert, error: updateError } = await supabase
    .from('audio_overviews')
    .update({ status: 'pending' })
    .eq('notebook_id', notebookId)
    .select('id')

  if (updateError) {
    console.error('[audio] Anforderung nicht gespeichert', notebookId, updateError)
    return Response.json(
      { message: 'Der Überblick konnte nicht angefordert werden.' },
      { status: 500 }
    )
  }

  if (aktualisiert.length === 0) {
    // Entweder gibt es noch keine Zeile, oder sie läuft gerade. Das Einfügen
    // unterscheidet die beiden: Bei einer laufenden Zeile schlägt es an der
    // Eindeutigkeitsbedingung fehl.
    const { error: insertError } = await supabase
      .from('audio_overviews')
      .insert({ notebook_id: notebookId })

    if (insertError) {
      if (insertError.code === '23505') {
        return Response.json(
          { message: 'Es wird bereits ein Überblick erzeugt. Einen Moment bitte.' },
          { status: 409 }
        )
      }
      console.error('[audio] Anforderung nicht angelegt', notebookId, insertError)
      return Response.json(
        { message: 'Der Überblick konnte nicht angefordert werden.' },
        { status: 500 }
      )
    }
  }

  after(async () => {
    // Fehler hier erreichen die Antwort nicht mehr — sie ist längst raus.
    // `generateOverview` schreibt jeden Ausgang in die Zeile; was hier noch
    // durchkommt, ist ein Fehler im Fehlerpfad selbst.
    try {
      await generateOverview(notebookId)
    } catch (error) {
      console.error('[audio] unerwarteter Fehler', notebookId, error)
    }
  })

  return Response.json({ status: 'pending' }, { status: 202 })
}
