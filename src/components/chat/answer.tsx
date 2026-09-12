'use client'

import { useId, useState } from 'react'

import { SourceViewer } from '@/components/sources/source-viewer'
import { rewriteMarkers, splitAnswer } from '@/lib/chat/citations'
import type { StreamedSource } from '@/lib/chat/ui'

/**
 * Eine Antwort mit anklickbaren Belegen.
 *
 * Der Text kommt als Zeichenkette mit `[1]` darin — und zwar roh, während er
 * noch strömt. Bereinigt wird deshalb hier mit `rewriteMarkers`, derselben
 * Funktion, die der Server beim Speichern benutzt.
 *
 * Das war zuerst nicht so: die Bereinigung lief nur serverseitig, und ein
 * erfundener Beleg blieb während des Strömens sichtbar und verschwand erst
 * nach dem Neuladen. Zwei Antworten auf dieselbe Frage. Der End-to-End-Test
 * hat es gefunden.
 *
 * Ein Beleg ist eine echte `<button>` und kein gestyltes `<span>`: er ist
 * über die Tastatur erreichbar, hat einen Fokusring und wird von
 * Screenreadern als Bedienelement angesagt. Sein zugänglicher Name nennt
 * Quelle und Seite, nicht bloß die Zahl — „3" allein ist vorgelesen wertlos.
 */
export function Answer({ text, sources }: { text: string; sources: StreamedSource[] }) {
  // Welcher Beleg gerade geöffnet ist. Nur einer, weil zwei gleichzeitig
  // geöffnete Passagen die Antwort auseinanderreißen würden.
  const [offen, setOffen] = useState<number | null>(null)

  // Welcher Beleg im Dokument nachgeschlagen wird. Getrennt von `offen`, weil
  // der aufgeklappte Ausschnitt sichtbar bleiben soll, während der Dialog
  // darüber steht — beim Schließen steht der Nutzer wieder dort, wo er war.
  const [imDokument, setImDokument] = useState<StreamedSource | null>(null)

  const panelId = useId()

  // Erfundene Nummern fliegen raus, bevor gerendert wird — nach derselben
  // Regel wie beim Speichern.
  const { text: bereinigt } = rewriteMarkers(text, (n) => sources.some((s) => s.n === n))
  const parts = splitAnswer(bereinigt)
  const gezeigt = offen === null ? undefined : sources.find((s) => s.n === offen)

  return (
    <div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {parts.map((part, i) =>
          part.kind === 'text' ? (
            <span key={i}>{part.value}</span>
          ) : (
            <CitationChip
              key={i}
              n={part.n}
              source={sources.find((s) => s.n === part.n)}
              active={offen === part.n}
              controls={panelId}
              onToggle={() => setOffen(offen === part.n ? null : part.n)}
            />
          )
        )}
      </p>

      {gezeigt ? (
        <figure
          id={panelId}
          className="mt-3 rounded-control border border-accent bg-accent-soft px-4 py-3"
        >
          <figcaption className="text-xs font-semibold text-accent-ink">
            {gezeigt.sourceTitle}
            {gezeigt.pageNumber === null ? '' : `, Seite ${gezeigt.pageNumber}`}
          </figcaption>
          {/*
            Die Passage im Wortlaut, so wie sie dem Modell vorlag. Sie ist in
            der Nachricht gespeichert und wird nicht nachgeladen — dadurch
            bleibt sie lesbar, auch wenn die Quelle inzwischen gelöscht ist.
          */}
          <blockquote className="mt-2 text-sm leading-relaxed text-ink">
            {gezeigt.excerpt}
          </blockquote>

          {/*
            Der zweite Schritt des Versprechens aus README.md: erst die Passage
            im Wortlaut, dann sie an ihrer Stelle im Dokument.
 
            Warum nicht gleich der Dialog beim Klick auf den Chip: Die häufige
            Frage ist „worauf stützt sich das?", und die beantwortet der
            Ausschnitt an Ort und Stelle, ohne den Lesefluss zu unterbrechen.
            Die seltenere ist „was steht drumherum?" — die verdient den ganzen
            Text, und dafür lohnt sich ein Dialog.
          */}
          <button
            type="button"
            onClick={() => setImDokument(gezeigt)}
            className="mt-3 rounded-control text-xs font-semibold text-brand-600 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Im Dokument anzeigen
          </button>
        </figure>
      ) : null}

      {imDokument ? (
        <SourceViewer
          sourceId={imDokument.sourceId}
          chunkIndex={imDokument.chunkIndex}
          onClose={() => setImDokument(null)}
        />
      ) : null}
    </div>
  )
}

function CitationChip({
  n,
  source,
  active,
  controls,
  onToggle
}: {
  n: number
  source: StreamedSource | undefined
  active: boolean
  controls: string
  onToggle: () => void
}) {
  // Eine Nummer ohne passenden Ausschnitt sollte es nach `parseCitations`
  // nicht geben. Kommt sie trotzdem — etwa aus einer älteren gespeicherten
  // Nachricht, deren Belege verloren gingen — wird sie als schlichter Text
  // dargestellt statt als Schaltfläche, die nichts tut.
  if (!source) return <span className="text-muted-ink">[{n}]</span>

  const ort =
    source.pageNumber === null
      ? source.sourceTitle
      : `${source.sourceTitle}, Seite ${source.pageNumber}`

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={active}
      aria-controls={active ? controls : undefined}
      aria-label={`Beleg ${n}: ${ort}`}
      className={[
        'mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5',
        'align-baseline text-xs font-semibold tabular-nums transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        // Ruhend die eigenen Zitat-Tokens: der Chip sitzt als einziges
        // Element sowohl auf einer Karte als auch mitten im Fließtext und
        // braucht deshalb eigene Werte statt brand-*.
        //
        // Aktiv Gold — Stelle 1 von 4 der Gold-Disziplin aus CLAUDE.md.
        //
        // `text-on-accent`, nicht `text-accent-ink`: Letzteres ist die Schrift
        // auf --accent-soft, der blassen Tönung. Auf der vollen Fläche war es
        // im dunklen Theme derselbe Goldton und die Nummer unsichtbar.
        active
          ? 'bg-accent text-on-accent'
          : 'border border-cite-border bg-cite-bg text-cite-fg hover:border-cite-fg'
      ].join(' ')}
    >
      {n}
    </button>
  )
}
