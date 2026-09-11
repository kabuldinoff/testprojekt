'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { Citation } from '@/lib/chat/citations'
import { createClient } from '@/lib/supabase/server'

import { parseNoteForm, titleFromAnswer } from './schema'

/**
 * Anlegen, Ändern und Löschen von Notizen.
 *
 * Wie bei den Notebooks filtert keine dieser Funktionen nach dem Besitzer: der
 * Zugriff läuft über den RLS-Client, und die Policy setzt den Filter. Ein
 * leeres Ergebnis nach einem Update heißt deshalb „gehört nicht dir" und wird
 * als „gibt es nicht" gemeldet — ein „kein Zugriff" bestätigte die Existenz.
 */

export interface NoteState {
  error?: string
  /**
   * Gesetzt, wenn der Vorgang durchgelaufen ist.
   *
   * Ein leeres Objekt taugt dafür nicht: `useActionState` startet mit einem
   * leeren Anfangszustand, und „noch nichts getan" wäre von „erfolgreich
   * fertig" nicht zu unterscheiden. Das Formular schlösse sich dann sofort
   * beim ersten Rendern.
   */
  ok?: true
  /**
   * Was der Nutzer eingegeben hatte, wenn die Prüfung fehlschlug.
   *
   * React setzt ein Formular nach einer Action zurück. Bei `defaultValue`
   * heißt das: die Eingabe ist weg, sobald die Action einmal geantwortet hat
   * — und ausgerechnet im Fehlerfall, wo der Nutzer sie noch braucht. Die
   * Werte kommen deshalb zurück und füllen die Felder erneut.
   *
   * Aufgefallen im End-to-End-Test, der genau das versprochen hatte.
   */
  values?: { title: string; content: string }
}

/** Die Rohwerte aus dem Formular, um sie bei einem Fehler zurückzugeben. */
function rohwerte(formData: FormData) {
  return {
    title: String(formData.get('title') ?? ''),
    content: String(formData.get('content') ?? '')
  }
}

async function requireSupabase() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) redirect('/anmelden')
  return supabase
}

export async function createNote(
  notebookId: string,
  _previous: NoteState,
  formData: FormData
): Promise<NoteState> {
  const parsed = parseNoteForm(formData)
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig.',
      values: rohwerte(formData)
    }
  }

  const supabase = await requireSupabase()

  // `notebook_id` kommt aus dem gebundenen Argument, nicht aus dem Formular.
  // Ein verstecktes Feld könnte der Client ändern — die INSERT-Policy finge
  // das zwar ab, aber ein Weg, der gar nicht erst existiert, muss nicht
  // abgefangen werden.
  const { error } = await supabase
    .from('notes')
    .insert({ notebook_id: notebookId, origin: 'user', ...parsed.data })

  if (error) {
    return { error: 'Die Notiz konnte nicht gespeichert werden.', values: rohwerte(formData) }
  }

  revalidatePath(`/app/${notebookId}`)
  return { ok: true }
}

/**
 * Übernimmt eine Chat-Antwort als Notiz — mitsamt ihren Belegen.
 *
 * Die Belege reisen mit, weil eine übernommene Antwort ohne sie eine
 * Behauptung ohne Herkunft wäre. Genau das soll dieses Produkt nicht
 * produzieren.
 */
export async function saveAnswerAsNote(
  notebookId: string,
  content: string,
  citations: Citation[]
): Promise<NoteState> {
  const supabase = await requireSupabase()

  const { error } = await supabase.from('notes').insert({
    notebook_id: notebookId,
    title: titleFromAnswer(content),
    content,
    origin: 'chat',
    citations
  })

  if (error) return { error: 'Die Notiz konnte nicht gespeichert werden.' }

  revalidatePath(`/app/${notebookId}`)
  return { ok: true }
}

export async function updateNote(
  notebookId: string,
  noteId: string,
  _previous: NoteState,
  formData: FormData
): Promise<NoteState> {
  const parsed = parseNoteForm(formData)
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig.',
      values: rohwerte(formData)
    }
  }

  const supabase = await requireSupabase()

  const { data, error } = await supabase
    .from('notes')
    .update(parsed.data)
    .eq('id', noteId)
    .select('id')

  if (error) {
    return { error: 'Die Änderung konnte nicht gespeichert werden.', values: rohwerte(formData) }
  }
  if (data.length === 0) return { error: 'Diese Notiz gibt es nicht.' }

  revalidatePath(`/app/${notebookId}`)
  return { ok: true }
}

export async function deleteNote(
  notebookId: string,
  noteId: string,
  _previous: NoteState,
  _formData: FormData
): Promise<NoteState> {
  const supabase = await requireSupabase()

  const { error } = await supabase.from('notes').delete().eq('id', noteId)

  if (error) return { error: 'Die Notiz konnte nicht gelöscht werden.' }

  revalidatePath(`/app/${notebookId}`)
  return { ok: true }
}
