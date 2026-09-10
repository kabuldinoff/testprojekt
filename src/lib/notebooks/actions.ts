'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { firstIssue, parseNotebookForm } from './schema'

/**
 * Anlegen, Ändern und Löschen von Notebooks.
 *
 * Keine dieser Funktionen filtert nach `owner_id`. Das ist kein Versehen: der
 * Zugriff läuft über den RLS-Client, und die Policy setzt den Filter. Ein
 * fremdes Notebook kann hier nicht auftauchen, selbst wenn eine dieser Zeilen
 * falsch wäre — `e2e/a2-rls-isolation.spec.ts` beweist das gegen PostgREST
 * direkt, an dieser Schicht vorbei.
 *
 * Beim Anlegen ist `owner_id` trotzdem explizit gesetzt: die Spalte hat keinen
 * Default, und die INSERT-Policy prüft mit `with check`, dass sie zum
 * angemeldeten Nutzer passt.
 */

export interface FormState {
  error?: string
}

/** Die angemeldete Nutzer-ID, oder Weiterleitung zur Anmeldung. */
async function requireUserId() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  // getUser() und nicht getSession(): getSession liest das Cookie und vertraut
  // ihm, getUser prüft die Signatur beim Auth-Server.
  if (!user) redirect('/anmelden')

  return { supabase, userId: user.id }
}

export async function createNotebook(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseNotebookForm(formData)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, userId } = await requireUserId()

  const { data, error } = await supabase
    .from('notebooks')
    .insert({ ...parsed.data, owner_id: userId })
    .select('id')
    .single()

  if (error || !data) {
    return { error: 'Das Notebook konnte nicht angelegt werden. Bitte erneut versuchen.' }
  }

  revalidatePath('/app')
  // redirect() wirft intern — deshalb steht es hinter der Fehlerbehandlung und
  // nicht in einem try-Block, der es abfangen würde.
  redirect(`/app/${data.id}`)
}

export async function updateNotebook(
  notebookId: string,
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = parseNotebookForm(formData)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase } = await requireUserId()

  const { data, error } = await supabase
    .from('notebooks')
    .update(parsed.data)
    .eq('id', notebookId)
    .select('id')

  if (error) return { error: 'Die Änderung konnte nicht gespeichert werden.' }

  // Leeres Ergebnis heißt: die Policy hat die Zeile herausgefiltert. Für den
  // Nutzer ist das nicht von "gibt es nicht" zu unterscheiden — und genau so
  // soll es aussehen. Ein "kein Zugriff" würde bestätigen, dass es sie gibt.
  if (data.length === 0) return { error: 'Dieses Notebook gibt es nicht.' }

  revalidatePath('/app')
  revalidatePath(`/app/${notebookId}`)
  return {}
}

export async function deleteNotebook(
  notebookId: string,
  _previous: FormState,
  _formData: FormData
): Promise<FormState> {
  const { supabase } = await requireUserId()

  const { error } = await supabase.from('notebooks').delete().eq('id', notebookId)

  // Zwei Ausgänge, die man leicht verwechselt. Ein **fremdes** Notebook trifft
  // die Policy nicht: kein Fehler, keine gelöschte Zeile, und die Umleitung
  // zur Übersicht ist genau richtig — es soll sich anfühlen wie „gibt es
  // nicht". Ein **Fehler** dagegen heißt, das Notebook steht noch da. Ohne
  // diese Unterscheidung landete der Nutzer in der Übersicht, sähe sein
  // Notebook weiterhin und bekäme keinen Hinweis, warum.
  if (error) {
    return { error: 'Das Notebook konnte nicht gelöscht werden. Bitte erneut versuchen.' }
  }

  revalidatePath('/app')
  redirect('/app')
}
