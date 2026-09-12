'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import {
  MAX_FILE_BYTES,
  MAX_PASTE_CHARS,
  MAX_SOURCE_TITLE_CHARS,
  classifyFile
} from '@/lib/sources/schema'
import { createClient } from '@/lib/supabase/client'

/**
 * Quellen hinzufügen: Datei, Adresse oder eingefügter Text.
 *
 * ── Warum der Browser direkt zu Storage lädt ──────────────────────────────
 *
 * Vercel begrenzt Request-Bodies auf 4,5 MB. Eine Datei durch eine Route zu
 * schicken scheitert oberhalb davon — und zwar erst beim Nutzer. Der Server
 * erzeugt deshalb nur eine Signed URL, und die Datei geht an ihm vorbei
 * direkt zu Supabase Storage.
 *
 * Das ist der einzige Teil der Anwendung, der ohne JavaScript nicht
 * funktioniert. Ein Datei-Upload mit Vorab-Signatur lässt sich nicht als
 * einfaches Formular bauen; Anmeldung, Notebooks und alles Weitere kommen
 * dagegen ohne aus.
 */

type Mode = 'datei' | 'adresse' | 'text'

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'datei', label: 'Datei' },
  { id: 'adresse', label: 'Adresse' },
  { id: 'text', label: 'Text' }
]

/**
 * Der Bereich trägt einen zugänglichen Namen (`aria-labelledby`): Screenreader
 * können ihn anspringen, und die Beschriftungen darin — „Titel" — kollidieren
 * nicht mehr mit denen des Einstellungsformulars weiter unten auf derselben
 * Seite. Genau daran war der erste Testlauf gescheitert.
 */
export function AddSource({ notebookId }: { notebookId: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('datei')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  /** Legt die Quelle an und stößt die Verarbeitung an. */
  async function submit(body: Record<string, unknown>, file?: File) {
    setBusy(true)
    setError(null)
    try {
      const created = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notebookId, ...body })
      })
      const result = (await created.json()) as {
        sourceId?: string
        path?: string
        token?: string
        error?: string
      }
      if (!created.ok || !result.sourceId) {
        setError(result.error ?? 'Die Quelle konnte nicht angelegt werden.')
        return
      }

      if (file && result.path && result.token) {
        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from('sources')
          .uploadToSignedUrl(result.path, result.token, file)

        if (uploadError) {
          // Die Zeile steht schon, die Datei fehlt. Ohne Aufräumen bliebe eine
          // unbrauchbare Quelle auf `pending` in der Liste stehen, und jeder
          // erneute Versuch legte eine weitere daneben — bis die Grenze von 20
          // erreicht ist, ohne dass je eine funktioniert hätte.
          //
          // Gelöscht wird über den RLS-Client: die Policy erlaubt nur eigene
          // Quellen, ein fremder Datensatz wäre auch von hier aus unerreichbar.
          await supabase.from('sources').delete().eq('id', result.sourceId)
          setError('Die Datei konnte nicht hochgeladen werden.')
          router.refresh()
          return
        }
      }

      await fetch(`/api/sources/${result.sourceId}/ingest`, { method: 'POST' })
      if (fileInput.current) fileInput.current.value = ''
      router.refresh()
    } catch {
      setError('Verbindung fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  async function onFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = fileInput.current?.files?.[0]
    if (!file) return setError('Bitte eine Datei auswählen.')

    // Beide Prüfungen gibt es serverseitig ebenfalls — hier stehen sie, damit
    // der Nutzer die Antwort sofort bekommt und nicht erst nach dem Upload
    // einer 30-MB-Datei.
    if (file.size > MAX_FILE_BYTES) return setError('Die Datei ist größer als 10 MB.')

    // Nicht nur `file.type`: Browser liefern für .md und je nach System auch
    // für .txt eine leere Zeichenkette, und dann würde der Upload genau die
    // Textdateien ablehnen, für die er gedacht ist.
    const classified = classifyFile(file.name, file.type)
    if (!classified) return setError('Nur PDF, Text und Markdown werden unterstützt.')

    await submit(
      {
        kind: classified.kind,
        title: file.name.slice(0, MAX_SOURCE_TITLE_CHARS),
        sizeBytes: file.size
      },
      // Mit kanonischem MIME-Typ neu verpackt: der Bucket prüft dagegen, und
      // eine Datei mit leerem Typ würde er sonst zurückweisen.
      new File([file], file.name, { type: classified.mime })
    )
  }

  async function onUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = new FormData(event.currentTarget).get('url')
    await submit({ kind: 'url', url: typeof url === 'string' ? url.trim() : '' })
  }

  async function onPaste(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await submit({
      kind: 'paste',
      title: String(data.get('title') ?? '').trim(),
      content: String(data.get('content') ?? '').trim()
    })
  }

  return (
    <section
      aria-labelledby="quelle-hinzufuegen"
      className="rounded-card border border-hairline bg-surface p-5"
    >
      <h3 id="quelle-hinzufuegen" className="text-base font-bold">
        Quelle hinzufügen
      </h3>

      {/*
        `flex-wrap`, weil die drei Reiter in der Spalte sonst schrumpfen statt
        umzubrechen: Flex-Elemente haben `flex-shrink: 1`, und als die Spalte
        noch 264px breit war, fraß das die Polsterung des letzten auf — „Text"
        klebte am Kartenrand. Kein waagerechter Überlauf, also auch kein roter
        Test; nur ein Knopf, der aussieht, als wäre er verrutscht.

        Die Spalte ist inzwischen breiter und es passt. Die Zeile bleibt
        trotzdem: Sie kostet nichts und hält den Fall auch dann aus, wenn
        später ein vierter Reiter dazukommt.
      */}
      <div role="tablist" aria-label="Art der Quelle" className="mt-3 flex flex-wrap gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            id={`tab-${m.id}`}
            aria-selected={mode === m.id}
            aria-controls={`panel-${m.id}`}
            onClick={() => {
              setMode(m.id)
              setError(null)
            }}
            className={
              mode === m.id
                ? 'rounded-pill bg-brand-600 px-3.5 py-1.5 text-sm font-bold text-on-brand'
                : 'rounded-pill px-3.5 py-1.5 text-sm font-bold text-muted-ink hover:bg-surface-2 hover:text-ink'
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-3">
          <Notice tone="err">{error}</Notice>
        </div>
      ) : null}

      {mode === 'datei' ? (
        <form
          onSubmit={onFile}
          role="tabpanel"
          id="panel-datei"
          aria-labelledby="tab-datei"
          className="mt-4 flex flex-col gap-3"
        >
          <Field
            label="PDF, Text oder Markdown"
            name="file"
            type="file"
            ref={fileInput}
            accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md"
            hint="Höchstens 10 MB. Gescannte PDFs ohne Textebene können nicht gelesen werden."
          />
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Wird hochgeladen …' : 'Hochladen'}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === 'adresse' ? (
        <form
          onSubmit={onUrl}
          role="tabpanel"
          id="panel-adresse"
          aria-labelledby="tab-adresse"
          className="mt-4 flex flex-col gap-3"
        >
          <Field
            label="Adresse der Webseite"
            name="url"
            type="url"
            required
            placeholder="https://beispiel.de/artikel"
            hint="Der Artikeltext wird übernommen, Navigation und Werbung nicht."
          />
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Wird abgerufen …' : 'Hinzufügen'}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === 'text' ? (
        <form
          onSubmit={onPaste}
          role="tabpanel"
          id="panel-text"
          aria-labelledby="tab-text"
          className="mt-4 flex flex-col gap-3"
        >
          <Field
            label="Titel"
            name="title"
            required
            maxLength={MAX_SOURCE_TITLE_CHARS}
            placeholder="Notizen aus der Sitzung"
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="paste-content" className="text-sm font-semibold">
              Inhalt
            </label>
            <textarea
              id="paste-content"
              name="content"
              rows={6}
              required
              maxLength={MAX_PASTE_CHARS}
              placeholder="Text einfügen …"
              className="w-full rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-faint-ink sm:text-sm"
            />
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Wird übernommen …' : 'Hinzufügen'}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
