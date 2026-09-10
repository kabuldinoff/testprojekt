import { NextResponse, type NextRequest } from 'next/server'

import {
  MAX_SOURCE_TITLE_CHARS,
  createSourceInput,
  sourceInsertMessage
} from '@/lib/sources/schema'
import { createClient } from '@/lib/supabase/server'

/**
 * Legt eine Quelle an und liefert, was der Client zum Hochladen braucht.
 *
 * Warum der Browser direkt zu Supabase Storage hochlädt und nicht hierher:
 * Vercel begrenzt Request-Bodies auf 4,5 MB. Ein PDF durch diese Route zu
 * schicken scheitert bei größeren Dateien mit FUNCTION_PAYLOAD_TOO_LARGE —
 * und zwar erst beim Nutzer, nicht beim Entwickeln. Die Route erzeugt deshalb
 * nur eine Signed URL; die Datei geht an ihr vorbei.
 *
 * Diese Route kommt **ohne den Secret-Key-Client aus**, und das ist kein
 * Zufall, sondern nachgemessen: die Storage-Policy erlaubt jedem Nutzer den
 * Pfad, der mit seiner eigenen ID beginnt, also kann der RLS-Client die Signed
 * URL selbst erzeugen und den eingefügten Text selbst ablegen. Ein fremder
 * Pfad scheitert dabei an der Policy — geprüft, nicht angenommen.
 *
 * Aufgefallen ist das, weil der Import-Graph-Test angeschlagen hat. Die erste
 * Fassung benutzte hier den Admin-Client, und die Frage „brauche ich ihn
 * wirklich?" hat sich erst dadurch gestellt.
 */

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const parsed = createSourceInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.' },
      { status: 400 }
    )
  }
  const input = parsed.data

  // Die Besitzprüfung. Über den RLS-Client: findet die Policy das Notebook
  // nicht, kommt hier nichts an — ohne dass diese Route einen owner_id-Filter
  // schreiben müsste.
  const { data: notebook } = await supabase
    .from('notebooks')
    .select('id')
    .eq('id', input.notebookId)
    .maybeSingle()

  // 404 und nicht 403: ein 403 würde bestätigen, dass es dieses Notebook gibt.
  if (!notebook) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 })

  if (input.kind === 'url') {
    // Kein Storage, kein Upload: der Inhalt wird beim Verarbeiten abgerufen.
    // Der Titel ist vorläufig die Adresse und wird durch den Seitentitel
    // ersetzt, sobald er bekannt ist.
    const { data, error } = await supabase
      .from('sources')
      .insert({
        notebook_id: input.notebookId,
        kind: 'url',
        title: input.url.slice(0, MAX_SOURCE_TITLE_CHARS),
        source_url: input.url
      })
      .select('id')
      .single()

    if (error || !data)
      return NextResponse.json({ error: sourceInsertMessage(error) }, { status: 400 })
    return NextResponse.json({ sourceId: data.id })
  }

  const sourceId = crypto.randomUUID()
  // Der erste Pfadabschnitt ist die Nutzer-ID — daran hängt die
  // Storage-Policy. Sie kommt aus dem geprüften Token, nicht aus dem Request.
  const storagePath = `${user.id}/${input.notebookId}/${sourceId}`

  // Reihenfolge: **erst die Zeile, dann die Datei.** Die Storage-Policy
  // verlangt, dass zum Pfad bereits eine Quelle existiert — sonst könnte
  // jeder beliebig viele Dateien unter seinem Präfix ablegen und die
  // Mengenbegrenzung von 20 Quellen zählte nur Zeilen, nicht Bytes.
  //
  // Für Datei-Uploads galt das ohnehin: die Zeile entsteht, bevor der Client
  // die Signed URL bekommt. Beim eingefügten Text war es zunächst andersherum,
  // und der Upload scheiterte an genau dieser Policy.
  const { data, error } = await supabase
    .from('sources')
    .insert({
      id: sourceId,
      notebook_id: input.notebookId,
      kind: input.kind,
      title: input.title,
      storage_path: storagePath
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: sourceInsertMessage(error) }, { status: 400 })
  }

  if (input.kind === 'paste') {
    // Eingefügter Text läuft als einziger Inhalt durch die Function. Er ist
    // auf 500.000 Zeichen begrenzt und bleibt damit weit unter dem
    // 4,5-MB-Limit. Der Server legt ihn ab, damit die Verarbeitung nur einen
    // Weg kennt: lies aus Storage.
    const { error: uploadError } = await supabase.storage
      .from('sources')
      .upload(storagePath, new Blob([input.content], { type: 'text/plain' }), {
        contentType: 'text/plain'
      })

    if (uploadError) {
      // Ohne Aufräumen bliebe eine Quelle ohne Inhalt stehen, die gegen die
      // Mengenbegrenzung zählt und nie verarbeitet werden kann.
      await supabase.from('sources').delete().eq('id', data.id)
      return NextResponse.json({ error: 'Der Text konnte nicht abgelegt werden.' }, { status: 500 })
    }

    return NextResponse.json({ sourceId: data.id })
  }

  // Signed Upload URL: gültig für genau diesen Pfad, ohne dass der Client je
  // einen Schlüssel sieht.
  const { data: signed, error: signError } = await supabase.storage
    .from('sources')
    .createSignedUploadUrl(storagePath)

  if (signError || !signed) {
    await supabase.from('sources').delete().eq('id', data.id)
    return NextResponse.json(
      { error: 'Der Upload konnte nicht vorbereitet werden.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ sourceId: data.id, path: storagePath, token: signed.token })
}
