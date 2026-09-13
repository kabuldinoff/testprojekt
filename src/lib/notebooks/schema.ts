import { z } from 'zod'

/**
 * Was ein gültiges Notebook ausmacht — ohne Datenbank, ohne Request.
 *
 * Diese Datei ist die einzige Stelle, an der die Regeln stehen. Die Server
 * Action prüft damit, und die Migration setzt dieselben Grenzen als
 * CHECK-Constraint noch einmal. Doppelt, weil beide etwas anderes leisten: die
 * Zod-Prüfung liefert dem Nutzer eine Meldung, die Datenbank verhindert
 * Unsinn auch dann, wenn jemand an der Oberfläche vorbei schreibt.
 *
 * Die Zahlen sind benannt und nicht eingestreut, damit die Migration und diese
 * Datei nicht auseinanderlaufen können, ohne dass es auffällt.
 */

/** Muss zu dem CHECK auf notebooks.title passen. */
export const TITLE_MAX = 200
/** Muss zu dem CHECK auf notebooks.description passen. */
export const DESCRIPTION_MAX = 2000
/**
 * Muss zu dem CHECK auf notebooks.emoji passen.
 *
 * Gezählt wird in **Code Points**, nicht in UTF-16-Einheiten. Postgres'
 * `length()` zählt Code Points, JavaScripts `.length` zählt UTF-16-Einheiten,
 * und bei Emoji gehen die auseinander: die schottische Flagge 🏴󠁧󠁢󠁳󠁣󠁴󠁿 hat 7 Code
 * Points, aber `.length === 14`. Mit `.max(8)` auf `.length` wäre die Prüfung
 * hier strenger als die Spalte — und zwar genau für den Eingabetyp, für den
 * das Feld gedacht ist.
 */
export const EMOJI_MAX = 8

/** Länge in Code Points — dieselbe Zählweise wie Postgres' length(). */
function codePoints(value: string): number {
  return [...value].length
}

export const notebookInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Bitte einen Titel angeben.')
    .max(TITLE_MAX, `Höchstens ${TITLE_MAX} Zeichen.`),

  // ── Leer wird `null`, nicht `undefined` ──────────────────────────────────
  //
  // Eine leere Zeichenkette käme nicht in Frage: In der Datenbank sähe `''`
  // wie eine gesetzte Beschreibung aus und erzeugte im UI eine leere Zeile,
  // statt den Platz gar nicht einzunehmen.
  //
  // `undefined` stand hier zuerst und war beim **Anlegen** richtig und beim
  // **Ändern** ein stiller Fehler: `JSON.stringify({ emoji: undefined })`
  // ergibt `{}`. Die Spalte steht dann gar nicht im Rumpf, PostgREST lässt sie
  // unverändert — und wer sein Symbol wieder loswerden wollte, bekam den alten
  // Wert zurück, ohne Fehlermeldung. Dasselbe galt für die Beschreibung.
  //
  // `null` bedeutet für beide Wege dasselbe: „dieses Feld ist leer". Beim
  // Einfügen wie beim Ändern.
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `Höchstens ${DESCRIPTION_MAX} Zeichen.`)
    .transform((v) => (v.length > 0 ? v : null)),

  emoji: z
    .string()
    .trim()
    .refine((v) => codePoints(v) <= EMOJI_MAX, 'Bitte ein einzelnes Zeichen.')
    .transform((v) => (v.length > 0 ? v : null))
})

export type NotebookInput = z.infer<typeof notebookInput>

/**
 * Liest die Felder aus einem Formular.
 *
 * Als eigene Funktion, weil Anlegen und Umbenennen dasselbe Formular
 * benutzen — und weil sich `FormData` so ohne Request testen lässt.
 */
export function parseNotebookForm(formData: FormData) {
  return notebookInput.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    emoji: formData.get('emoji') ?? ''
  })
}

/** Die erste Fehlermeldung, oder ein Ersatz. Für die Anzeige im Formular. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Eingabe unvollständig.'
}
