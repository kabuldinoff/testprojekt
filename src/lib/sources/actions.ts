'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

/**
 * Eine Quelle wieder entfernen.
 *
 * Wie bei Notizen und Notebooks filtert nichts hier nach dem Besitzer: Der
 * Zugriff läuft über den RLS-Client, und die Policy
 * `sources: löschen im eigenen Notebook` setzt den Filter. Ein Treffer von
 * null Zeilen heißt deshalb „gehört nicht dir" und wird als „gibt es nicht"
 * gemeldet — ein „kein Zugriff" bestätigte die Existenz.
 *
 * Die Abschnitte gehen von selbst mit: `source_chunks.source_id` trägt
 * `on delete cascade`. Was **nicht** von selbst mitgeht, ist die Datei im
 * Storage — siehe unten.
 */

export interface SourceState {
  error?: string
  ok?: true
}

export async function deleteSource(
  notebookId: string,
  sourceId: string,
  _previous: SourceState,
  _formData: FormData
): Promise<SourceState> {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) redirect('/anmelden')

  // Erst nachsehen, ob es die Quelle gibt und wo ihre Datei liegt. Die Abfrage
  // läuft über den RLS-Client; eine fremde Quelle findet die Policy nicht.
  const { data: quelle, error: leseFehler } = await supabase
    .from('sources')
    .select('storage_path')
    .eq('id', sourceId)
    .eq('notebook_id', notebookId)
    .maybeSingle()

  if (leseFehler) return { error: 'Die Quelle konnte nicht gelesen werden.' }
  if (!quelle) return { error: 'Diese Quelle gibt es nicht.' }

  // ── Reihenfolge: erst die Datei, dann die Zeile ──────────────────────────
  //
  // Andersherum wäre naheliegender, ist aber die schlechtere Hälfte des
  // Tauschs. Beide Reihenfolgen können in der Mitte scheitern:
  //
  //   Zeile zuerst  → Datei bleibt liegen, ohne Zeile, die auf sie zeigt.
  //                   Niemand kommt mehr an sie heran, sie zählt weiter
  //                   gegen das Speicherkontingent, und nichts weist darauf
  //                   hin. Nur ein Aufräumlauf fände sie.
  //   Datei zuerst  → Die Quelle steht noch da, ihre Datei fehlt. Sichtbar,
  //                   und ein zweiter Klick auf „Löschen" bereinigt es: Das
  //                   Entfernen einer nicht mehr vorhandenen Datei ist kein
  //                   Fehler.
  //
  // Ein Zustand, aus dem der Nutzer selbst herausfindet, schlägt einen, der
  // nur unsichtbar Platz verbraucht.
  //
  // Eine URL-Quelle hat keine Datei: Ihr Inhalt wird beim Verarbeiten geholt
  // und nie abgelegt.
  if (quelle.storage_path) {
    const { error: storageFehler } = await supabase.storage
      .from('sources')
      .remove([quelle.storage_path])

    if (storageFehler) {
      return { error: 'Die Datei der Quelle konnte nicht entfernt werden.' }
    }
  }

  // `select`, damit ein Treffer von null Zeilen unterscheidbar ist: Ein
  // Löschen, das nichts traf, meldete sonst Erfolg, und die Quelle stünde
  // weiterhin da.
  const { data, error } = await supabase
    .from('sources')
    .delete()
    .eq('id', sourceId)
    .eq('notebook_id', notebookId)
    .select('id')

  if (error) return { error: 'Die Quelle konnte nicht gelöscht werden.' }
  if (data.length === 0) return { error: 'Diese Quelle gibt es nicht.' }

  revalidatePath(`/app/${notebookId}`)
  return { ok: true }
}
