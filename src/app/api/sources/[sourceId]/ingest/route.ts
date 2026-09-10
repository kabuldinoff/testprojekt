import { after } from 'next/server'
import { NextResponse, type NextRequest } from 'next/server'

import { ingestSource } from '@/lib/sources/ingest'
import { createClient } from '@/lib/supabase/server'

/**
 * Stößt die Verarbeitung einer Quelle an.
 *
 * Antwortet sofort mit 202 und arbeitet in `after()` weiter. Der Client fragt
 * den Zustand über die Quelle selbst ab — es gibt keinen zweiten Kanal, den
 * man synchron halten müsste.
 *
 * `maxDuration` ist die Obergrenze auf Vercel Hobby mit Fluid Compute. Die
 * Arbeit in `after()` zählt gegen dasselbe Budget wie die Antwort, nicht
 * dagegen zusätzlich.
 */
export const maxDuration = 300

export async function POST(
  _request: NextRequest,
  { params }: RouteContext<'/api/sources/[sourceId]/ingest'>
) {
  const { sourceId } = await params

  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  // Die Besitzprüfung, bevor der Secret-Key-Client ins Spiel kommt. Über den
  // RLS-Client: eine fremde Quelle findet die Policy nicht.
  const { data: source } = await supabase
    .from('sources')
    .select('id')
    .eq('id', sourceId)
    .maybeSingle()

  if (!source) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 })

  after(async () => {
    // Fehler hier dürfen die Antwort nicht mehr erreichen — sie ist längst
    // raus. ingestSource schreibt jeden Ausgang in die Zeile; was hier noch
    // durchkommt, ist ein Fehler im Fehlerpfad selbst.
    try {
      await ingestSource(sourceId)
    } catch (error) {
      console.error('[ingest] unerwarteter Fehler', sourceId, error)
    }
  })

  return NextResponse.json({ status: 'angenommen' }, { status: 202 })
}
