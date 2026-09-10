import { z } from 'zod'

/**
 * Eingaberegeln für neue Quellen — rein, ohne Datenbank.
 *
 * Die Grenzen spiegeln CHECK-Constraints und Bucket-Einstellungen aus
 * Migration 0004. Laufen sie auseinander, äußert sich das nicht als
 * Validierungsfehler, sondern als abgelehnte Zeile aus Postgres oder als
 * Upload, den Storage kommentarlos verweigert.
 */

/** Muss zum file_size_limit des Buckets passen. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024

/** Muss zu allowed_mime_types des Buckets passen. */
export const ALLOWED_MIME = {
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'text/markdown': 'markdown'
} as const

export type FileKind = (typeof ALLOWED_MIME)[keyof typeof ALLOWED_MIME]

/** Muss zum CHECK auf sources.title passen. */
export const TITLE_MAX = 300

/**
 * Obergrenze für eingefügten Text.
 *
 * Deutlich unter dem 4,5-MB-Limit für Request-Bodies auf Vercel: dieser Text
 * läuft als einziger Inhalt durch die Function und nicht per Signed URL an ihr
 * vorbei.
 */
export const MAX_PASTE_CHARS = 500_000

const title = z.string().trim().min(1, 'Bitte einen Titel angeben.').max(TITLE_MAX)

export const fileSourceInput = z.object({
  notebookId: z.uuid('Ungültiges Notebook.'),
  kind: z.literal(['pdf', 'text', 'markdown']),
  title,
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES, 'Die Datei ist größer als 10 MB.')
})

export const urlSourceInput = z.object({
  notebookId: z.uuid('Ungültiges Notebook.'),
  kind: z.literal('url'),
  // Die eigentliche Prüfung macht checkExternalUrl — hier geht es nur darum,
  // offensichtlichen Unsinn früh abzuweisen.
  url: z.url('Das ist keine gültige Adresse.')
})

export const pasteSourceInput = z.object({
  notebookId: z.uuid('Ungültiges Notebook.'),
  kind: z.literal('paste'),
  title,
  content: z
    .string()
    .trim()
    .min(1, 'Bitte Text einfügen.')
    .max(MAX_PASTE_CHARS, 'Der Text ist zu lang.')
})

export const createSourceInput = z.discriminatedUnion('kind', [
  fileSourceInput,
  urlSourceInput,
  pasteSourceInput
])

export type CreateSourceInput = z.infer<typeof createSourceInput>

/**
 * Ableitung der Quellenart aus dem MIME-Typ.
 *
 * Bewusst nicht aus der Dateiendung: die kann jeder umbenennen, und der
 * Bucket prüft ohnehin gegen den MIME-Typ. Eine Endung, die nicht zum Inhalt
 * passt, würde sonst zu einem Parser führen, der das Falsche versucht.
 */
export function kindFromMime(mime: string): FileKind | null {
  const clean = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  return ALLOWED_MIME[clean as keyof typeof ALLOWED_MIME] ?? null
}
