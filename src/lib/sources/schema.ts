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

/**
 * Muss zum CHECK auf sources.title passen.
 *
 * Ein Wert, drei Stellen: Validierung, Kürzen im Client, `maxLength` am Feld.
 * Stünde die 300 dreimal da, wäre nach der ersten Änderung eine davon falsch —
 * und zwar die, die niemand anschaut.
 */
export const MAX_SOURCE_TITLE_CHARS = 300

/**
 * Obergrenze für eingefügten Text.
 *
 * Deutlich unter dem 4,5-MB-Limit für Request-Bodies auf Vercel: dieser Text
 * läuft als einziger Inhalt durch die Function und nicht per Signed URL an ihr
 * vorbei.
 */
export const MAX_PASTE_CHARS = 500_000

const title = z.string().trim().min(1, 'Bitte einen Titel angeben.').max(MAX_SOURCE_TITLE_CHARS)

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

/**
 * Dateiendungen als Rückfallebene — und **nur** als solche.
 *
 * Browser liefern für `.md` und je nach Betriebssystem auch für `.txt` einen
 * leeren `File.type`. Verlässt man sich allein auf den MIME-Typ, lehnt der
 * Upload genau die Textdateien ab, für die er gedacht ist.
 *
 * Die Endung entscheidet trotzdem nicht über den Parser, sondern nur darüber,
 * *welchen kanonischen MIME-Typ* wir beim Hochladen mitgeben. Der Bucket
 * prüft dagegen, und der Parser richtet sich nach `kind` in der Datenbank.
 * Eine umbenannte Datei führt also zu einem Parser, der scheitert — nicht zu
 * einer Umgehung.
 */
const EXTENSION_FALLBACK: Record<string, { kind: FileKind; mime: string }> = {
  txt: { kind: 'text', mime: 'text/plain' },
  md: { kind: 'markdown', mime: 'text/markdown' },
  markdown: { kind: 'markdown', mime: 'text/markdown' },
  pdf: { kind: 'pdf', mime: 'application/pdf' }
}

export interface FileClassification {
  kind: FileKind
  /** Kanonischer MIME-Typ für den Upload — muss der Bucket akzeptieren. */
  mime: string
}

/**
 * Bestimmt Art und MIME-Typ einer Datei.
 *
 * Erst der vom Browser gemeldete Typ, dann die Endung. `null`, wenn beides
 * nichts hergibt.
 */
export function classifyFile(fileName: string, browserMime: string): FileClassification | null {
  const fromMime = kindFromMime(browserMime)
  if (fromMime) {
    const clean = browserMime.split(';')[0]!.trim().toLowerCase()
    return { kind: fromMime, mime: clean }
  }

  const extension = fileName.toLowerCase().split('.').pop() ?? ''
  return EXTENSION_FALLBACK[extension] ?? null
}

/**
 * Übersetzt den Datenbankfehler der Mengenbegrenzung in einen Satz.
 *
 * Die Grenze steht als Trigger in der Migration, damit sie auch für Zugriffe
 * an der Anwendung vorbei gilt. Der Preis: sie kommt als Postgres-Fehler an
 * und muss übersetzt werden. Das ist reine Zuordnung ohne I/O und gehört
 * deshalb hierher und nicht in den Route Handler.
 */
export function sourceInsertMessage(error: { message?: string } | null): string {
  if (error?.message?.includes('höchstens 20 Quellen')) {
    return 'Dieses Notebook fasst höchstens 20 Quellen.'
  }
  return 'Die Quelle konnte nicht angelegt werden.'
}
