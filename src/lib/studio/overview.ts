/**
 * Der Erzeugungslauf für den Audio-Überblick: Skript schreiben, prüfen,
 * vertonen, ablegen.
 *
 * Aufgebaut wie `src/lib/sources/ingest.ts` und aus demselben Grund: `after()`
 * ist fire-and-forget, also tragen Lease und Versuchszähler die Verlässlichkeit
 * und nicht der Prozess. Die Begründung im Detail steht dort.
 *
 * Ein Zustand mehr als bei den Quellen: **`script_only`**. Die Sprachausgabe
 * ist der teuerste und unzuverlässigste Schritt — ein erschöpftes
 * Tageskontingent äußert sich als 429, und das passiert erfahrungsgemäß
 * während einer Vorführung. Das Skript ist dann trotzdem geschrieben und wird
 * als lesbares Transkript angezeigt. Ein Ladebalken, der nie fertig wird, wäre
 * die schlechteste aller Antworten.
 */
import { generateText } from 'ai'

import { chatModel } from '@/lib/llm/chat'
import { logLlmCall } from '@/lib/llm/usage'
import { durationSeconds, speak } from '@/lib/llm/tts'
import { createAdminClientAfterOwnershipCheck } from '@/lib/supabase/admin'

import {
  SCRIPT_PROBLEM_MESSAGES,
  buildSourceDigest,
  checkScript,
  scriptPrompt,
  type ScriptSource
} from './script'

/** Wie lange ein laufender Versuch als lebendig gilt. */
export const LEASE_MINUTES = 10

/**
 * Zehn statt fünf wie beim Ingest: Skripterzeugung und Vertonung zusammen
 * dauern bei drei Minuten Audio rund anderthalb Minuten, und der Reaper darf
 * einen langsamen, aber laufenden Versuch nicht abräumen.
 */

/** Nach so vielen Versuchen wird aufgegeben. Dieselbe Überlegung wie beim Ingest. */
export const MAX_ATTEMPTS = 3

type Admin = ReturnType<typeof createAdminClientAfterOwnershipCheck>

export type OverviewOutcome =
  | { status: 'ready'; seconds: number }
  | { status: 'script_only'; message: string }
  | { status: 'failed'; message: string }
  | { status: 'skipped' }

interface Claimed {
  id: string
  notebook_id: string
  attempts: number
}

async function claim(admin: Admin, notebookId: string): Promise<Claimed | null> {
  const { data, error } = await admin
    .rpc('claim_audio_overview', {
      p_notebook_id: notebookId,
      p_lease_minutes: LEASE_MINUTES,
      p_max_attempts: MAX_ATTEMPTS
    })
    .maybeSingle()

  if (error) {
    console.error('[audio] Übernahme fehlgeschlagen', notebookId, error)
    return null
  }
  return (data as Claimed | null) ?? null
}

/**
 * Schreibt in die Zeile — aber nur, wenn sie noch diesem Lauf gehört.
 *
 * Jeder Schreibzugriff prüft `status = 'processing'` **und** den beim
 * Übernehmen gesehenen Versuchszähler. Ohne diese zweite Bedingung gilt:
 * Läuft die Lease ab, weil ein Lauf hängt, übernimmt der nächste die Zeile —
 * und der erste kann, wenn er doch noch aufwacht, dem zweiten
 * hinterherschreiben. Das Ergebnis wäre ein `ready` mit dem Pfad des ersten
 * Laufs, während der zweite gerade eine andere Datei ablegt.
 *
 * Der Rückgabewert sagt, ob die Zeile noch diesem Lauf gehörte. Trifft der
 * Schreibzugriff nichts, ist das kein Fehler, sondern ein überholter Lauf —
 * er hört dann auf, statt zu stören.
 */
async function writeIfStillOurs(
  admin: Admin,
  job: Claimed,
  patch: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await admin
    .from('audio_overviews')
    .update(patch)
    .eq('id', job.id)
    .eq('status', 'processing')
    .eq('attempts', job.attempts)
    .select('id')

  if (error) {
    console.error('[audio] Schreibzugriff fehlgeschlagen', job.id, error)
    return false
  }
  if (data.length === 0) {
    console.warn('[audio] Lauf überholt, Zeile gehört einem neueren Versuch', job.id)
    return false
  }
  return true
}

/**
 * Hält das Scheitern fest.
 *
 * `permanent` entscheidet, ob es einen weiteren Versuch gibt — genau wie beim
 * Ingest. „Dieses Notebook hat keine verarbeitete Quelle" ändert sich nicht
 * dadurch, dass man es dreimal versucht.
 */
async function fail(
  admin: Admin,
  job: Claimed,
  message: string,
  permanent: boolean
): Promise<void> {
  const endgueltig = permanent || job.attempts >= MAX_ATTEMPTS
  await writeIfStillOurs(admin, job, {
    status: endgueltig ? 'failed' : 'pending',
    error_message: message,
    lease_expires_at: null,
    ...(permanent ? { attempts: MAX_ATTEMPTS } : {})
  })
}

/** Sammelt die Quellen eines Notebooks samt ihren Abschnitten. */
async function loadSources(admin: Admin, notebookId: string): Promise<ScriptSource[] | null> {
  const { data: sources, error: sourcesError } = await admin
    .from('sources')
    .select('id, title')
    .eq('notebook_id', notebookId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })

  if (sourcesError) {
    console.error('[audio] Quellen nicht lesbar', notebookId, sourcesError)
    return null
  }
  if (!sources || sources.length === 0) return []

  const { data: chunks, error: chunksError } = await admin
    .from('source_chunks')
    .select('source_id, content, chunk_index')
    .eq('notebook_id', notebookId)
    .order('chunk_index', { ascending: true })

  if (chunksError) {
    console.error('[audio] Abschnitte nicht lesbar', notebookId, chunksError)
    return null
  }

  return sources.map((s) => ({
    title: s.title as string,
    excerpts: (chunks ?? []).filter((c) => c.source_id === s.id).map((c) => c.content as string)
  }))
}

/**
 * Erzeugt den Audio-Überblick eines Notebooks.
 *
 * Erwartet, dass die aufrufende Route den Besitz über den RLS-Client geprüft
 * hat — hier wird mit erhöhten Rechten gearbeitet. Siehe `admin.ts`.
 */
export async function generateOverview(notebookId: string): Promise<OverviewOutcome> {
  const admin = createAdminClientAfterOwnershipCheck()

  const job = await claim(admin, notebookId)
  if (!job) return { status: 'skipped' }

  // Der Besitzer ist Pflicht, nicht Beiwerk: Der Ablagepfad beginnt mit
  // seiner Nutzer-ID, und daran hängt die Lese-Policy des Buckets. Ohne ihn
  // landete die Datei unter einem Platzhalterpfad, den niemand mehr signieren
  // kann — der Überblick stünde auf `ready` und wäre nicht abspielbar.
  const { data: notebook, error: notebookError } = await admin
    .from('notebooks')
    .select('owner_id')
    .eq('id', notebookId)
    .maybeSingle<{ owner_id: string }>()

  if (notebookError || !notebook) {
    console.error('[audio] Notebook nicht lesbar', notebookId, notebookError)
    const message = 'Das Notebook konnte nicht gelesen werden.'
    await fail(admin, job, message, false)
    return { status: 'failed', message }
  }

  const quellen = await loadSources(admin, notebookId)
  if (quellen === null) {
    const message = 'Die Quellen konnten nicht gelesen werden.'
    await fail(admin, job, message, false)
    return { status: 'failed', message }
  }
  if (quellen.length === 0) {
    // Dauerhaft: Dass keine verarbeitete Quelle da ist, ändert sich nicht
    // durch einen weiteren Versuch.
    const message = 'Für einen Überblick braucht es mindestens eine verarbeitete Quelle.'
    await fail(admin, job, message, true)
    return { status: 'failed', message }
  }

  // ── Skript ───────────────────────────────────────────────────────────────
  // Immer über Gemini, unabhängig vom eingestellten Chat-Anbieter: Vertont
  // werden kann ohnehin nur dort, und ein Skript von Mistral an Googles
  // Sprachausgabe zu schicken hieße, die Daten beider Anbieter zu berühren,
  // ohne dass der Nutzer etwas davon hätte.
  const { model, modelId } = chatModel('gemini')
  const begonnen = Date.now()

  let roh: string
  try {
    const ergebnis = await generateText({
      model,
      prompt: scriptPrompt(buildSourceDigest(quellen))
    })
    roh = ergebnis.text

    await logLlmCall(admin, {
      userId: notebook.owner_id,
      notebookId,
      kind: 'chat',
      provider: 'gemini',
      model: modelId,
      inputTokens: ergebnis.usage.inputTokens ?? 0,
      outputTokens: ergebnis.usage.outputTokens ?? 0,
      durationMs: Date.now() - begonnen
    })
  } catch (error) {
    console.error('[audio] Skript fehlgeschlagen', notebookId, error)
    const message = 'Das Skript konnte nicht erzeugt werden.'
    await fail(admin, job, message, false)
    return { status: 'failed', message }
  }

  const geprueft = checkScript(roh)
  if (!geprueft.ok) {
    // Vorübergehend: Ein Modell, das die Form einmal verfehlt, trifft sie beim
    // nächsten Mal oft. Nach MAX_ATTEMPTS endet es mit einer Meldung, die
    // sagt, was nicht stimmte.
    const message = SCRIPT_PROBLEM_MESSAGES[geprueft.problem!]
    await fail(admin, job, message, false)
    return { status: 'failed', message }
  }
  const script = geprueft.script!

  // Das Skript wird **vor** der Vertonung gespeichert. Genau das macht
  // `script_only` möglich: Schlägt die Sprachausgabe fehl, ist der Text schon
  // da und nicht erst zu retten.
  if (!(await writeIfStillOurs(admin, job, { script }))) {
    const message = 'Das Skript konnte nicht gespeichert werden.'
    await fail(admin, job, message, false)
    return { status: 'failed', message }
  }

  // ── Vertonung ────────────────────────────────────────────────────────────
  const ttsBegonnen = Date.now()
  let audio
  try {
    audio = await speak(script)
  } catch (error) {
    // Der Ausgang, für den `script_only` existiert. Kein weiterer Versuch:
    // Ein erschöpftes Tageskontingent ist in fünf Minuten nicht behoben, und
    // der Nutzer hat etwas Lesbares.
    console.error('[audio] Vertonung fehlgeschlagen', notebookId, error)
    const message =
      'Der Text steht, die Sprachausgabe war nicht verfügbar. Sie können ihn unten mitlesen.'

    // Der Endzustand muss ankommen, sonst ist er keiner. Bleibt die Zeile auf
    // `processing` stehen, holt der Reaper sie zurück auf `pending`, der
    // Client stößt erneut an — und die Vertonung wird genau so oft wiederholt,
    // wie `script_only` es verhindern soll.
    //
    // `storage_path` wird geleert: Nach einem Neuerzeugen stünde dort sonst
    // die Datei des **vorigen** Laufs, und die Oberfläche zeigte ein Audio,
    // das nicht zum angezeigten Skript gehört.
    const gespeichert = await writeIfStillOurs(admin, job, {
      status: 'script_only',
      error_message: message,
      storage_path: null,
      duration_seconds: null,
      lease_expires_at: null
    })

    if (!gespeichert) {
      const fehlermeldung = 'Der Zustand konnte nicht gespeichert werden.'
      await fail(admin, job, fehlermeldung, false)
      return { status: 'failed', message: fehlermeldung }
    }
    return { status: 'script_only', message }
  }

  await logLlmCall(admin, {
    userId: notebook.owner_id,
    notebookId,
    kind: 'tts',
    provider: 'gemini',
    model: 'tts',
    inputTokens: script.length,
    outputTokens: audio.bytes.length,
    durationMs: Date.now() - ttsBegonnen
  })

  // ── Ablegen ──────────────────────────────────────────────────────────────
  // Pfad wie beim Quellen-Bucket: {user_id}/{notebook_id}.wav. Der erste
  // Abschnitt ist die Nutzer-ID, an der die Lese-Policy hängt.
  const pfad = `${notebook.owner_id}/${notebookId}.wav`
  const { error: uploadError } = await admin.storage
    .from('audio')
    .upload(pfad, audio.bytes, { contentType: 'audio/wav', upsert: true })

  if (uploadError) {
    // Vorübergehend — aber die erzeugte Datei ist verloren, der nächste
    // Versuch vertont neu. Deshalb steht die Meldung so da: der Nutzer soll
    // wissen, dass es erneut versucht wird.
    console.error('[audio] Ablegen fehlgeschlagen', notebookId, uploadError)
    const message = 'Die Audiodatei konnte nicht abgelegt werden. Es wird erneut versucht.'
    await fail(admin, job, message, false)
    return { status: 'failed', message }
  }

  const seconds = durationSeconds(audio.bytes.length)
  const abgeschlossen = await writeIfStillOurs(admin, job, {
    status: 'ready',
    storage_path: pfad,
    duration_seconds: seconds,
    error_message: null,
    lease_expires_at: null
  })

  if (!abgeschlossen) {
    // Ohne diese Prüfung meldete die Funktion `ready`, während die Zeile auf
    // `processing` stehen bliebe — der Client fragt endlos weiter ab.
    const message = 'Der Abschluss konnte nicht gespeichert werden.'
    await fail(admin, job, message, false)
    return { status: 'failed', message }
  }

  return { status: 'ready', seconds }
}
