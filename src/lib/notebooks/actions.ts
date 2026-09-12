'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { isProviderId } from '@/lib/llm/registry'

import { firstIssue, parseNotebookForm } from './schema'
import { removeFiles } from '@/lib/storage/files'

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

  // ── Erst die Dateien, dann die Zeile ────────────────────────────────────
  //
  // Der Cascade räumt `sources`, `source_chunks` und `audio_overviews` ab —
  // aber **nicht** den Storage; der hängt nicht am Schema. Ohne diese Zeilen
  // bleiben die Dateien des Notebooks für immer liegen, unauffindbar, und
  // zählen weiter gegen das Gigabyte im kostenlosen Tarif.
  //
  // Beide Abfragen laufen über den RLS-Client: Ein fremdes Notebook liefert
  // nichts, und damit wird auch nichts entfernt.
  const [{ data: quellen }, { data: ueberblick }] = await Promise.all([
    supabase.from('sources').select('storage_path').eq('notebook_id', notebookId),
    supabase
      .from('audio_overviews')
      .select('storage_path')
      .eq('notebook_id', notebookId)
      .maybeSingle<{ storage_path: string | null }>()
  ])

  const quellenFehler = await removeFiles(
    supabase,
    'sources',
    (quellen ?? []).map((q: { storage_path: string | null }) => q.storage_path)
  )
  if (quellenFehler) return { error: quellenFehler }

  const audioFehler = await removeFiles(supabase, 'audio', [ueberblick?.storage_path])
  if (audioFehler) return { error: audioFehler }

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

/**
 * Wechselt den Chat-Anbieter eines Notebooks.
 *
 * Eine eigene Action und nicht Teil von `updateNotebook`: der Wechsel ist eine
 * einzelne Umschaltung neben dem Gespräch, kein Formular mit Speichern-Knopf.
 * Über `updateNotebook` müsste die Oberfläche Titel, Emoji und Beschreibung
 * mitschicken, nur um ein Feld zu ändern — und ein unbeteiligtes Feld, das bei
 * jedem Anbieterwechsel mitgeschrieben wird, ist eine Gelegenheit, etwas zu
 * überschreiben.
 *
 * Der Wert wird gegen die Registry geprüft, bevor er die Datenbank sieht. Die
 * Spalte hat denselben CHECK — doppelt, weil beide etwas anderes leisten: hier
 * entsteht eine Meldung, dort eine Garantie.
 */
export async function setChatProvider(notebookId: string, provider: string): Promise<FormState> {
  if (!isProviderId(provider)) return { error: 'Diesen Anbieter gibt es nicht.' }

  const { supabase } = await requireUserId()

  const { data, error } = await supabase
    .from('notebooks')
    .update({ chat_provider: provider })
    .eq('id', notebookId)
    .select('id')

  if (error) return { error: 'Der Anbieter konnte nicht gewechselt werden.' }

  // Leeres Ergebnis heißt: die Policy hat die Zeile herausgefiltert — für den
  // Nutzer nicht von „gibt es nicht" zu unterscheiden, und genau so gewollt.
  if (data.length === 0) return { error: 'Dieses Notebook gibt es nicht.' }

  revalidatePath(`/app/${notebookId}`)
  return {}
}
