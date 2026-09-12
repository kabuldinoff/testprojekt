import { NextResponse, type NextRequest } from 'next/server'

import { assembleSource } from '@/lib/sources/reassemble'
import { createClient } from '@/lib/supabase/server'

/**
 * Der Text einer Quelle, seitenweise, zum Nachlesen im Betrachter.
 *
 * ── Warum nicht aus der Originaldatei in Storage ──────────────────────────
 *
 * Steht in `reassemble.ts`: Eine URL-Quelle legt nichts ab, und die Abschnitte
 * sind ohnehin das, worauf die Antworten beruhen. Hier kommen sie aus der
 * Tabelle und werden vom Server zusammengesetzt.
 *
 * ── Warum der Server zusammensetzt und nicht der Browser ──────────────────
 *
 * Weil die Überlappung sonst mit über die Leitung ginge: Die Abschnitte
 * überdecken einander zu etwa einem Sechstel, und das wären bei einem langen
 * Dokument einige zehn Kilobyte für Text, den der Browser sofort wieder
 * wegrechnen müsste.
 *
 * ── Warum das 4,5-MB-Limit hier nicht greift ──────────────────────────────
 *
 * Eingefügter Text ist auf 500.000 Zeichen begrenzt, eine hochgeladene Datei
 * auf 10 MB — und aus 10 MB PDF wird nach dem Auslesen der Textebene ein
 * Bruchteil davon. Die Antwort bleibt damit deutlich unter der Grenze für
 * Vercel-Response-Bodies. Eine Seitenaufteilung wäre Vorratshaltung für einen
 * Fall, den die Eingabegrenzen bereits ausschließen.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext<'/api/sources/[sourceId]/text'>
) {
  const { sourceId } = await params

  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  // Über den RLS-Client. Eine fremde Quelle findet die Policy nicht, und das
  // ergibt 404 statt 403 — ein 403 bestätigte, dass es sie gibt.
  const { data: source, error: quellFehler } = await supabase
    .from('sources')
    .select('title, kind, status')
    .eq('id', sourceId)
    .maybeSingle()

  if (quellFehler) {
    return NextResponse.json({ error: 'Die Quelle konnte nicht geladen werden.' }, { status: 500 })
  }
  if (!source) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 })

  // `order` ausdrücklich: PostgREST garantiert ohne Sortierung keine
  // Reihenfolge. `assembleSource` sortiert zwar selbst — aber sich auf die
  // Sortierung im Anschluss zu verlassen hieße, die Reihenfolge zweimal zu
  // regeln und einmal davon stillschweigend.
  const { data: chunks, error: abschnittFehler } = await supabase
    .from('source_chunks')
    .select('chunk_index, page_number, content, char_start, char_end')
    .eq('source_id', sourceId)
    .order('chunk_index', { ascending: true })

  if (abschnittFehler) {
    return NextResponse.json({ error: 'Der Text konnte nicht geladen werden.' }, { status: 500 })
  }

  const pages = assembleSource(
    chunks.map((c) => ({
      chunkIndex: c.chunk_index,
      pageNumber: c.page_number,
      content: c.content,
      charStart: c.char_start,
      charEnd: c.char_end
    }))
  )

  // `status` kommt mit, damit der Betrachter den leeren Fall erklären kann:
  // Eine Quelle ohne Abschnitte ist entweder noch in Arbeit oder gescheitert,
  // und das sind zwei verschiedene Auskünfte.
  return NextResponse.json({ title: source.title, kind: source.kind, status: source.status, pages })
}
