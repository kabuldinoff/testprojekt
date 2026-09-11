import { z } from 'zod'

/**
 * Was eine gültige Notiz ausmacht — ohne Datenbank, ohne Request.
 *
 * Dieselbe Arbeitsteilung wie bei den Notebooks: Zod liefert dem Nutzer eine
 * Meldung, der CHECK in der Migration verhindert Unsinn auch dann, wenn jemand
 * an der Oberfläche vorbei schreibt. Die Zahlen sind benannt, damit Migration
 * und Anwendung nicht unbemerkt auseinanderlaufen.
 */

/** Muss zu dem CHECK auf notes.title passen. */
export const NOTE_TITLE_MAX = 200

/**
 * Muss zu dem CHECK auf notes.content passen.
 *
 * 20.000 Zeichen sind großzügig für eine Notiz und knapp genug, dass ein
 * versehentlich eingefügtes Dokument hier abgewiesen wird statt in der
 * Notizliste zu landen. Wer ein Dokument einpflegen will, legt eine Quelle an
 * — dann wird es zerlegt und durchsuchbar, statt als Textblock zu liegen.
 */
export const NOTE_CONTENT_MAX = 20_000

/**
 * Ab welcher Länge das Kürzen an einer Wortgrenze noch lohnt.
 *
 * Liegt die letzte Wortgrenze weit vorn — etwa weil die Antwort mit einem sehr
 * langen Ausdruck beginnt, einer URL oder einem Dateipfad —, bliebe vom Titel
 * ein Fragment übrig. Dann ist mitten im Wort abzuschneiden das kleinere Übel:
 * „Die Zusammenfassung des Quartalsber…" sagt mehr als „Die".
 *
 * 40 Zeichen sind rund ein Fünftel der erlaubten Titellänge und in der Praxis
 * die Grenze, ab der eine Überschrift noch etwas aussagt.
 */
const MIN_TITLE_AFTER_CUT = 40

export const noteInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Die Notiz braucht einen Titel.')
    .max(NOTE_TITLE_MAX, `Höchstens ${NOTE_TITLE_MAX} Zeichen.`),
  content: z
    .string()
    .trim()
    .min(1, 'Die Notiz ist leer.')
    .max(NOTE_CONTENT_MAX, `Höchstens ${NOTE_CONTENT_MAX} Zeichen.`)
})

export type NoteInput = z.infer<typeof noteInput>

/**
 * Zieht die Felder aus dem Formular und prüft sie in einem Schritt.
 *
 * An einer Stelle, weil die Feldnamen sonst an drei Orten stünden: im
 * Formular, im Anlegen und im Ändern. Ein Tippfehler in einem davon äußerte
 * sich als „Die Notiz braucht einen Titel", obwohl einer dasteht.
 */
export function parseNoteForm(formData: FormData) {
  return noteInput.safeParse({
    title: formData.get('title'),
    content: formData.get('content')
  })
}

/**
 * Schlägt einen Titel aus einer Chat-Antwort vor.
 *
 * Wird eine Antwort als Notiz übernommen, hat sie keinen Titel — und den
 * Nutzer danach zu fragen, bevor er etwas gespeichert hat, ist eine Hürde an
 * der falschen Stelle. Genommen wird der erste Satz, gekürzt auf eine Zeile.
 *
 * Bewusst ohne Modellaufruf: ein guter Titel ist das nicht wert, und ein
 * Aufruf, der bei erschöpftem Kontingent fehlschlägt, verhinderte das
 * Speichern.
 */
export function titleFromAnswer(answer: string): string {
  // Belege raus: „[1]" in einer Überschrift ist Lärm.
  const ohneBelege = answer.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, '').trim()

  // Erster Satz oder erste Zeile, je nachdem, was früher kommt.
  const satzende = ohneBelege.search(/[.!?](\s|$)/)
  const zeilenende = ohneBelege.indexOf('\n')
  const enden = [satzende, zeilenende].filter((i) => i > 0)
  const ende = enden.length > 0 ? Math.min(...enden) : ohneBelege.length

  const roh = ohneBelege.slice(0, ende).replace(/\s+/g, ' ').trim()

  if (roh.length === 0) return 'Notiz aus dem Chat'
  if (roh.length <= NOTE_TITLE_MAX) return roh

  // An einer Wortgrenze kürzen, nicht mitten im Wort — ein abgeschnittenes
  // Wort in einer Überschrift sieht nach einem Fehler aus.
  const gekuerzt = roh.slice(0, NOTE_TITLE_MAX - 1)
  const letzteLuecke = gekuerzt.lastIndexOf(' ')
  return (letzteLuecke > MIN_TITLE_AFTER_CUT ? gekuerzt.slice(0, letzteLuecke) : gekuerzt) + '…'
}
