'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useMemo, useState } from 'react'

import { Answer } from '@/components/chat/answer'
import { Button } from '@/components/ui/button'
import type { Citation } from '@/lib/chat/citations'
import { sourcesOf, textOf, type NotabeneMessage } from '@/lib/chat/ui'

/**
 * Der Chat eines Notebooks: Quellenauswahl, Verlauf, Eingabe.
 *
 * ── Warum der Verlauf vom Server kommt und nicht aus dem Hook ─────────────
 *
 * `useChat` hält die Nachrichten dieser Sitzung. Der gespeicherte Verlauf
 * wird als `initialMessages` übergeben — von der Server-Komponente aus der
 * Datenbank geladen. Es gibt damit eine einzige Wahrheit: was in `messages`
 * steht. Ein zweiter Zustand für „alte" Nachrichten wäre ein zweiter Ort,
 * an dem er falsch sein kann.
 *
 * ── Warum die Quellenauswahl hier liegt ───────────────────────────────────
 *
 * Sie entscheidet, worauf geantwortet wird, und wird mit jeder Frage
 * mitgeschickt. Keine gespeicherte Einstellung: die Auswahl gehört zur Frage,
 * nicht zum Notebook. „Frag nur dieses eine Dokument" ist eine Absicht für
 * einen Moment.
 */

export interface ChatSource {
  id: string
  title: string
  /** Nur `ready` ist durchsuchbar — der Rest hat keine Abschnitte. */
  status: string
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
}

export function ChatPanel({
  notebookId,
  sources,
  history
}: {
  notebookId: string
  sources: ChatSource[]
  history: StoredMessage[]
}) {
  const bereit = useMemo(() => sources.filter((s) => s.status === 'ready'), [sources])

  // `null` heißt „alle" — und zwar auch dann noch, wenn später eine Quelle
  // dazukommt. Eine beim Laden gefüllte Liste würde neue Quellen stumm
  // ausschließen.
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string> | null>(null)
  const [frage, setFrage] = useState('')

  const { messages, sendMessage, status, error } = useChat<NotabeneMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    messages: history.map(storedToUi)
  })

  const laeuft = status === 'submitted' || status === 'streaming'
  const aktiveIds = ausgewaehlt === null ? null : [...ausgewaehlt]

  function toggle(id: string) {
    setAusgewaehlt((vorher) => {
      const naechste = new Set(vorher ?? bereit.map((s) => s.id))
      if (naechste.has(id)) naechste.delete(id)
      else naechste.add(id)
      return naechste
    })
  }

  function absenden(event: React.FormEvent) {
    event.preventDefault()
    const text = frage.trim()
    if (text.length === 0 || laeuft) return

    setFrage('')
    void sendMessage({ text }, { body: { notebookId, question: text, sourceIds: aktiveIds } })
  }

  if (bereit.length === 0) {
    return (
      <p className="rounded-control border border-hairline bg-surface-2 px-4 py-3 text-sm text-muted-ink">
        Sobald eine Quelle verarbeitet ist, können Sie hier Fragen dazu stellen.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="rounded-control border border-hairline bg-surface px-4 py-3">
        <legend className="px-1 text-xs font-semibold text-muted-ink">
          Worauf geantwortet wird
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {bereit.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand-600)]"
                checked={ausgewaehlt === null || ausgewaehlt.has(s.id)}
                onChange={() => toggle(s.id)}
              />
              {s.title}
            </label>
          ))}
        </div>
        {aktiveIds !== null && aktiveIds.length === 0 ? (
          <p className="mt-2 text-xs text-warn">
            Keine Quelle ausgewählt — es gibt nichts, worauf geantwortet werden könnte.
          </p>
        ) : null}
      </fieldset>

      {/*
        aria-live="polite" ist bei einer strömenden Antwort keine Zutat,
        sondern die Bedingung dafür, dass ein Screenreader sie überhaupt
        mitbekommt: der Text erscheint ohne Fokuswechsel und ohne Neuladen,
        und ohne diese Auszeichnung bliebe er unangesagt.
      */}
      <ol aria-live="polite" aria-busy={laeuft} className="flex flex-col gap-4">
        {messages.map((m) => (
          <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
            {m.role === 'user' ? (
              <p className="max-w-[85%] rounded-card bg-brand-600 px-4 py-2 text-sm text-on-brand">
                {textOf(m)}
              </p>
            ) : (
              <div className="rounded-card border border-hairline bg-surface px-4 py-3">
                <Answer text={textOf(m)} sources={sourcesOf(m)} />
              </div>
            )}
          </li>
        ))}
      </ol>

      {/*
        Ein eigener Ladehinweis, solange noch kein Zeichen da ist. Ohne ihn
        wirken die Sekunden zwischen Absenden und erstem Wort wie ein
        verschlucktes Formular.
      */}
      {status === 'submitted' ? (
        <p className="text-sm text-muted-ink">Suche in den ausgewählten Quellen …</p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
        >
          {error.message}
        </p>
      ) : null}

      <form onSubmit={absenden} className="flex items-end gap-2">
        <label htmlFor="frage" className="sr-only">
          Frage an die ausgewählten Quellen
        </label>
        <textarea
          id="frage"
          rows={2}
          value={frage}
          onChange={(e) => setFrage(e.target.value)}
          onKeyDown={(e) => {
            // Enter sendet, Umschalt+Enter macht einen Absatz. Die
            // Alternative — Enter macht immer einen Absatz — kostet bei einem
            // Chat jeden Absendevorgang einen Mausweg.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              absenden(e)
            }
          }}
          placeholder="Was möchten Sie wissen?"
          className="min-h-16 flex-1 resize-y rounded-control border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        />
        <Button type="submit" disabled={laeuft || frage.trim().length === 0}>
          {laeuft ? 'Antwortet …' : 'Fragen'}
        </Button>
      </form>
    </div>
  )
}

/**
 * Übersetzt eine gespeicherte Nachricht in die Form, die `useChat` erwartet.
 *
 * Die Belege reisen im selben Datenteil wie bei einer frisch geströmten
 * Antwort. Dadurch stellt `Answer` beide Fälle mit demselben Code dar — es
 * gibt keinen „alte Nachricht"-Zweig, der veralten könnte.
 */
function storedToUi(m: StoredMessage): NotabeneMessage {
  return {
    id: m.id,
    role: m.role,
    parts:
      m.role === 'assistant'
        ? [
            { type: 'data-sources', data: m.citations },
            { type: 'text', text: m.content }
          ]
        : [{ type: 'text', text: m.content }]
  }
}
