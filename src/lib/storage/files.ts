import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Dateien aus einem Bucket entfernen, bevor die Zeile fällt, die auf sie zeigt.
 *
 * ── Warum es das gibt ────────────────────────────────────────────────────
 *
 * Weil Supabase Storage **nicht am Schema hängt**. Ein Fremdschlüssel mit
 * `on delete cascade` räumt die Datenbank auf; die Dateien bleiben liegen, und
 * mit der Zeile verschwindet die einzige Spur, die auf sie zeigte.
 *
 * Nachgemessen beim Aufräumen des lokalen Stacks: 1493 Testkonten gelöscht,
 * damit 1070 Notebooks und 827 Quellen — und 837 Dateien blieben liegen, nicht
 * eine ging mit.
 *
 * ── Warum die Datei vor der Zeile ────────────────────────────────────────
 *
 * Beide Reihenfolgen können in der Mitte scheitern, und die Frage ist nur,
 * welcher Rest sich besser anfühlt:
 *
 *   Zeile zuerst  → Datei ohne Zeile im Bucket. Niemand kommt mehr an sie
 *                   heran, sie zählt weiter gegen das Kontingent, und nichts
 *                   weist darauf hin. Nur ein Aufräumlauf fände sie.
 *   Datei zuerst  → Die Zeile steht noch da, ihre Datei fehlt. Sichtbar, und
 *                   ein zweiter Versuch bereinigt es: Das Entfernen einer
 *                   nicht mehr vorhandenen Datei ist kein Fehler.
 *
 * Ein Zustand, aus dem der Nutzer selbst herausfindet, schlägt einen, der nur
 * unsichtbar Platz verbraucht.
 */

/**
 * Entfernt Dateien und meldet, ob es geklappt hat.
 *
 * `null` heißt: alles weg, oder es gab nichts zu tun. Eine Zeichenkette ist
 * die Meldung für den Nutzer.
 *
 * **Der RLS-Client, nicht der Secret-Key-Client.** Löschen ist eine Handlung
 * des Nutzers, und die Storage-Policy soll sie tragen — sie prüft, dass der
 * erste Pfadabschnitt seine eigene Kennung ist. Mit erhöhten Rechten wäre ein
 * falsch zusammengebauter Pfad eine fremde Datei.
 */
export async function removeFiles(
  supabase: SupabaseClient,
  bucket: string,
  paths: Array<string | null | undefined>
): Promise<string | null> {
  // Leere Pfade kommen vor und sind kein Sonderfall: Eine URL-Quelle legt
  // nichts ab, ein Überblick ohne fertige Vertonung hat noch keinen Pfad.
  const echte = paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
  if (echte.length === 0) return null

  const { error } = await supabase.storage.from(bucket).remove(echte)
  if (!error) return null

  // Mit Pfad im Protokoll, nicht nur mit der Meldung: Ohne ihn lässt sich eine
  // liegengebliebene Datei später nicht mehr zuordnen.
  console.error('[storage] Entfernen fehlgeschlagen', bucket, echte, error)
  return 'Die abgelegten Dateien konnten nicht entfernt werden. Bitte erneut versuchen.'
}
