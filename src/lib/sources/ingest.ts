import { createAdminClientAfterOwnershipCheck } from '@/lib/supabase/admin'

import { chunkDocument, hasUsableText, type Page } from './chunk'
import { fetchArticle, parsePdf, parsePlainText } from './parse'

/**
 * Der Verarbeitungslauf einer Quelle: lesen, zerlegen, ablegen.
 *
 * Hier — und nur hier — wird der Secret-Key-Client benutzt. Der Grund steht in
 * `admin.ts`: die Arbeit läuft nach der Antwort weiter, außerhalb des
 * Request-Kontexts, wo es kein Session-Cookie und damit keine Identität mehr
 * gibt, an der RLS ansetzen könnte. Die aufrufende Route hat den Besitz vorher
 * über den RLS-Client geprüft; ein Unit-Test hält fest, dass diese Datei aus
 * `src/app/**` nicht erreichbar ist.
 *
 * ── Warum ein Zustandsautomat und kein einfacher Aufruf ────────────────────
 *
 * `after()` ist fire-and-forget. Stirbt die Instanz mitten in der
 * Verarbeitung, bliebe die Quelle für immer auf `processing` stehen — sichtbar
 * als Ladebalken, der nie fertig wird, und niemand erführe warum.
 *
 * Deshalb trägt jede Quelle eine **Lease** und einen **Versuchszähler**. Wer
 * die Arbeit übernimmt, setzt `lease_expires_at` in die Zukunft. Ein
 * pg_cron-Lauf sucht abgelaufene Leases und stößt sie erneut an. Nach
 * `MAX_ATTEMPTS` endet es in `failed` mit einem Grund, statt endlos zu
 * kreisen.
 *
 * Das ersetzt einen Warteschlangendienst durch zwei Spalten und einen
 * Datenbank-Job — ohne zweiten Anbieter, ohne zusätzliche Geheimnisse.
 */

/** Wie lange ein laufender Versuch als lebendig gilt. */
export const LEASE_MINUTES = 5

/**
 * Nach so vielen Versuchen wird aufgegeben.
 *
 * Drei, weil die häufigsten Ursachen entweder sofort verschwinden (ein
 * einzelner Netzfehler) oder gar nicht (ein kaputtes PDF). Mehr Versuche
 * würden nur den zweiten Fall langsamer scheitern lassen.
 */
export const MAX_ATTEMPTS = 3

type Admin = ReturnType<typeof createAdminClientAfterOwnershipCheck>

interface SourceRow {
  id: string
  notebook_id: string
  kind: string
  title: string
  storage_path: string | null
  source_url: string | null
  status: string
  attempts: number
}

/**
 * Versucht, die Quelle für diesen Lauf zu übernehmen.
 *
 * Die Bedingung steht im `UPDATE` selbst und nicht in einem vorherigen
 * `SELECT`: nur so ist die Übernahme atomar. Prüfte man erst und schriebe
 * dann, könnten der Reaper und ein neuer Aufruf dieselbe Quelle gleichzeitig
 * übernehmen und die Abschnitte doppelt anlegen.
 *
 * Übernommen wird, was `pending` ist oder dessen Lease abgelaufen ist.
 */
async function claim(admin: Admin, sourceId: string): Promise<SourceRow | null> {
  // Ein Aufruf, ein Statement. Die erste Fassung setzte erst die Lease und
  // erhöhte danach `attempts` — stirbt der Prozess dazwischen, verbraucht der
  // Lauf keinen Versuch, der Reaper gibt die Quelle wieder frei, und sie
  // erreicht MAX_ATTEMPTS nie. Sie kreist endlos, ohne je zu scheitern.
  const { data, error } = await admin
    .rpc('claim_source', {
      p_source_id: sourceId,
      p_lease_minutes: LEASE_MINUTES,
      p_max_attempts: MAX_ATTEMPTS
    })
    .maybeSingle()

  if (error) {
    console.error('[ingest] Übernahme fehlgeschlagen', sourceId, error)
    return null
  }
  return (data as SourceRow | null) ?? null
}

/**
 * Hält das Scheitern fest.
 *
 * `permanent` entscheidet, ob es überhaupt einen weiteren Versuch gibt. Ohne
 * das würde ein kaputtes PDF dreimal gelesen, und der Nutzer wartete
 * anderthalb Minuten auf eine Antwort, die beim ersten Versuch feststand.
 */
async function fail(
  admin: Admin,
  sourceId: string,
  message: string,
  attempts: number,
  permanent: boolean
) {
  const endgueltig = permanent || attempts >= MAX_ATTEMPTS

  const { error } = await admin
    .from('sources')
    .update({
      // Vor dem letzten Versuch zurück auf `pending`: dann holt der Reaper sie
      // sich noch einmal. Danach bleibt es bei `failed`, mit Grund.
      status: endgueltig ? 'failed' : 'pending',
      error_message: message,
      lease_expires_at: null
    })
    .eq('id', sourceId)

  // Schlägt der Zustandswechsel selbst fehl, bleibt die Quelle auf
  // 'processing' stehen, bis die Lease abläuft. Das ist verkraftbar — der
  // Reaper holt sie — aber es darf nicht unbemerkt bleiben, sonst sucht
  // niemand nach der Ursache.
  if (error) console.error('[ingest] Zustandswechsel auf failed misslungen', sourceId, error)
}

/** Holt den Rohtext, je nach Art der Quelle. */
async function readSource(admin: Admin, source: SourceRow) {
  if (source.kind === 'url') {
    return fetchArticle(source.source_url ?? '')
  }

  if (!source.storage_path) {
    return { ok: false as const, message: 'Zu dieser Quelle fehlt die Datei.', permanent: true }
  }

  const { data, error } = await admin.storage.from('sources').download(source.storage_path)
  if (error || !data) {
    // Vorübergehend: Storage kann kurz nicht erreichbar sein. Ein erneuter
    // Versuch ist hier sinnvoll.
    return {
      ok: false as const,
      message: 'Die Datei konnte nicht gelesen werden.',
      permanent: false
    }
  }

  if (source.kind === 'pdf') {
    return parsePdf(await data.arrayBuffer())
  }
  return parsePlainText(await data.text())
}

export interface IngestOutcome {
  status: 'ready' | 'failed' | 'skipped'
  chunks?: number
  message?: string
}

/**
 * Verarbeitet eine Quelle vollständig.
 *
 * Idempotent: ein zweiter Lauf löscht die vorhandenen Abschnitte und legt sie
 * neu an, statt Dubletten zu erzeugen. Das ist die Voraussetzung dafür, dass
 * der Reaper überhaupt gefahrlos erneut anstoßen darf.
 */
export async function ingestSource(sourceId: string): Promise<IngestOutcome> {
  const admin = createAdminClientAfterOwnershipCheck()

  const source = await claim(admin, sourceId)
  if (!source) {
    // Entweder schon fertig, oder ein anderer Lauf ist gerade dran, oder die
    // Versuche sind aufgebraucht. In allen drei Fällen ist Nichtstun richtig.
    return { status: 'skipped' }
  }

  const parsed = await readSource(admin, source)
  if (!parsed.ok) {
    await fail(admin, sourceId, parsed.message, source.attempts, parsed.permanent)
    return { status: 'failed', message: parsed.message }
  }

  const pages: Page[] = parsed.pages

  if (!hasUsableText(pages)) {
    // Fast immer ein gescanntes PDF. Dauerhaft: ein weiterer Versuch fände
    // dieselbe fehlende Textebene.
    const message =
      source.kind === 'pdf'
        ? 'Dieses PDF enthält keine Textebene — vermutlich ein Scan. Texterkennung wird nicht unterstützt.'
        : 'Diese Quelle enthält zu wenig Text.'
    await fail(admin, sourceId, message, source.attempts, true)
    return { status: 'failed', message }
  }

  const chunks = chunkDocument(pages)

  // Erst löschen, dann schreiben. Ohne das liefe ein zweiter Versuch in die
  // Eindeutigkeitsbedingung auf (source_id, chunk_index).
  const { error: deleteError } = await admin
    .from('source_chunks')
    .delete()
    .eq('source_id', sourceId)

  if (deleteError) {
    // Bliebe der Fehler unbeachtet, liefe das folgende Einfügen in die
    // Eindeutigkeitsbedingung — und der Versuch würde als „Abschnitte konnten
    // nicht gespeichert werden" gezählt, obwohl die Quelle in Ordnung ist.
    // Nach drei solchen Runden wäre sie endgültig fehlgeschlagen.
    const message = 'Die alten Abschnitte konnten nicht entfernt werden.'
    await fail(admin, sourceId, message, source.attempts, false)
    return { status: 'failed', message }
  }

  const { error: insertError } = await admin.from('source_chunks').insert(
    chunks.map((c) => ({
      source_id: sourceId,
      notebook_id: source.notebook_id,
      chunk_index: c.index,
      content: c.content,
      page_number: c.pageNumber,
      char_start: c.charStart,
      char_end: c.charEnd
    }))
  )

  if (insertError) {
    // Vorübergehend: ein Schreibfehler in der Datenbank kann vorbeigehen.
    const message = 'Die Abschnitte konnten nicht gespeichert werden.'
    await fail(admin, sourceId, message, source.attempts, false)
    return { status: 'failed', message }
  }

  const charCount = pages.reduce((sum, p) => sum + p.text.length, 0)
  const pageCount = pages.filter((p) => p.number !== null).length

  const { error: finishError } = await admin
    .from('sources')
    .update({
      status: 'ready',
      error_message: null,
      lease_expires_at: null,
      char_count: charCount,
      page_count: pageCount > 0 ? pageCount : null,
      // Der Titel einer Webseite steht erst nach dem Abruf fest.
      ...(parsed.title && source.kind === 'url' ? { title: parsed.title.slice(0, 300) } : {})
    })
    .eq('id', sourceId)

  if (finishError) {
    // Ohne diese Prüfung meldete die Funktion `ready`, während die Zeile auf
    // 'processing' stehen bliebe: der Client fragt endlos weiter ab, und der
    // Reaper übernimmt dieselbe Quelle später noch einmal.
    const message = 'Der Abschluss der Verarbeitung konnte nicht gespeichert werden.'
    await fail(admin, sourceId, message, source.attempts, false)
    return { status: 'failed', message }
  }

  return { status: 'ready', chunks: chunks.length }
}
