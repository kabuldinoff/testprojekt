'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useMemo, useState } from 'react'

import { Answer } from '@/components/chat/answer'
import { SaveAsNote } from '@/components/notes/save-as-note'
import { Button } from '@/components/ui/button'
import { PfeilHoch } from '@/components/ui/icons'
import { rewriteMarkers } from '@/lib/chat/citations'
import {
  sourcesOf,
  storedToUi,
  textOf,
  type NotabeneMessage,
  type StoredMessage
} from '@/lib/chat/ui'

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

  // Kein früher Rückgabepfad mehr. Die erste Fassung blendete bei null
  // bereiten Quellen alles aus — auch den gespeicherten Verlauf. Wer die
  // letzte Quelle löscht, verlöre damit sämtliche früheren Antworten samt
  // ihren Belegen, obwohl die Passagen in der Nachricht gespeichert sind und
  // weiterhin lesbar wären. Gesperrt wird deshalb nur das, was ohne Quelle
  // nicht geht: Auswahl und Eingabe.
  const fragbar = bereit.length > 0

  return (
    <div className="flex flex-col gap-4">
      {fragbar ? (
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
      ) : null}

      {/*
        aria-live="polite" ist bei einer strömenden Antwort keine Zutat,
        sondern die Bedingung dafür, dass ein Screenreader sie überhaupt
        mitbekommt: der Text erscheint ohne Fokuswechsel und ohne Neuladen,
        und ohne diese Auszeichnung bliebe er unangesagt.
      */}
      <ol aria-live="polite" aria-busy={laeuft} className="flex flex-col gap-4">
        {messages.map((m, i) => (
          <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
            {m.role === 'user' ? (
              <p className="max-w-[85%] rounded-card bg-brand-600 px-4 py-2 text-sm text-on-brand">
                {textOf(m)}
              </p>
            ) : (
              <Assistant
                notebookId={notebookId}
                message={m}
                // Nur die letzte Nachricht kann noch im Fluss sein.
                stroemt={laeuft && i === messages.length - 1}
              />
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

      {fragbar ? (
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
          {/*
            Ein Symbolknopf, und damit einer ohne Text — sein zugänglicher Name
            steht deshalb im `aria-label` und wechselt mit dem Zustand: Wer
            nicht sieht, dass der Pfeil ausgegraut ist, hört „Antwortet …" und
            weiß, warum nichts passiert.

            Der Name bleibt im Ruhezustand wörtlich „Fragen". Das ist kein
            Zufall: Vier End-to-End-Tests greifen den Knopf über genau diesen
            Namen, und ein Symbol, das seinen Namen verliert, wäre für einen
            Screenreader dasselbe wie für den Test — nicht auffindbar.
          */}
          <Button
            type="submit"
            size="icon"
            aria-label={laeuft ? 'Antwortet …' : 'Fragen'}
            disabled={laeuft || frage.trim().length === 0}
          >
            <PfeilHoch />
          </Button>
        </form>
      ) : (
        <p className="rounded-control border border-hairline bg-surface-2 px-4 py-3 text-sm text-muted-ink">
          {history.length === 0
            ? 'Sobald eine Quelle verarbeitet ist, können Sie hier Fragen dazu stellen.'
            : 'Dieses Notebook hat derzeit keine verarbeitete Quelle. Der bisherige Verlauf bleibt lesbar; neue Fragen sind erst wieder möglich, wenn eine Quelle bereit ist.'}
        </p>
      )}
    </div>
  )
}

/**
 * Eine Antwort samt der Möglichkeit, sie zu behalten.
 *
 * Der Text wird hier einmal bereinigt und an beide weitergereicht: die
 * Darstellung und die Notiz sollen dasselbe zeigen. Eine gespeicherte Notiz
 * mit einem erfundenen Beleg darin wäre besonders ärgerlich — sie überlebt das
 * Gespräch.
 *
 * `rewriteMarkers` läuft in `Answer` noch einmal. Das ist kein Versehen: die
 * Funktion ist idempotent, und `Answer` soll auch dann richtig anzeigen, wenn
 * sie jemand mit rohem Text aufruft.
 */
function Assistant({
  notebookId,
  message,
  stroemt
}: {
  notebookId: string
  message: NotabeneMessage
  stroemt: boolean
}) {
  const sources = sourcesOf(message)
  const { text, used } = rewriteMarkers(textOf(message), (n) => sources.some((s) => s.n === n))

  // Nur die Belege, die im Text auch vorkommen. `sources` enthält alle
  // Ausschnitte, die dem Modell vorlagen — meist mehr, als es zitiert hat.
  // Landeten sie ungefiltert in der Notiz, führte die Belegliste darunter
  // Quellen auf, auf denen die Aussage gar nicht beruht. Das ist die
  // unangenehmste Sorte Fehler in diesem Produkt: er sieht nach Sorgfalt aus.
  const zitiert = sources.filter((s) => used.includes(s.n))

  return (
    <div className="rounded-card border border-hairline bg-surface px-4 py-3">
      <Answer text={text} sources={sources} />
      {/*
        Erst anbieten, wenn die Antwort fertig ist. Während des Strömens wäre
        der Knopf ein Angebot, das man bereut: gespeichert würde der halbe
        Satz, der zufällig gerade dastand.
      */}
      {stroemt || text.length === 0 ? null : (
        <SaveAsNote notebookId={notebookId} content={text} citations={zitiert} />
      )}
    </div>
  )
}
