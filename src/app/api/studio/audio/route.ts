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
    .select('id')
    .eq('id', notebookId)
    .maybeSingle<{ id: string }>()

  if (!notebook) return Response.json({ message: 'Nicht gefunden.' }, { status: 404 })

  // Anfordern heißt: die Zeile auf `pending` setzen. Als Upsert, weil ein
  // Notebook höchstens einen Überblick hat — ein zweiter Klick erzeugt keinen
  // zweiten, sondern ersetzt den alten.
  //
  // Über den RLS-Client, nicht über den Worker: Das ist die Handlung des
  // Nutzers, und die Policy soll sie tragen.
  const { error: upsertError } = await supabase.from('audio_overviews').upsert(
    {
      notebook_id: notebookId,
      status: 'pending',
      attempts: 0,
      script: null,
      storage_path: null,
      duration_seconds: null,
      error_message: null,
      lease_expires_at: null
    },
    { onConflict: 'notebook_id' }
  )

  if (upsertError) {
    console.error('[audio] Anforderung nicht gespeichert', notebookId, upsertError)
    return Response.json(
      { message: 'Der Überblick konnte nicht angefordert werden.' },
      { status: 500 }
    )
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
