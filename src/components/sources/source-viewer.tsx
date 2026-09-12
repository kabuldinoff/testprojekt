'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { AssembledPage } from '@/lib/sources/reassemble'

/**
 * Der Text einer Quelle zum Nachlesen — mit der belegten Stelle markiert.
 *
 * ── Warum ein natives `<dialog>` ──────────────────────────────────────────
 *
 * Weil es vier Dinge mitbringt, die eine nachgebaute Überlagerung erst wieder
 * haben müsste: Der Fokus bleibt im Dialog gefangen, Escape schließt, der Rest
 * der Seite wird für Screenreader stillgelegt, und der Hintergrund lässt sich
 * über `::backdrop` einfärben. Das ist eine Bibliothek weniger — und vier
 * Verhaltensweisen, die sonst jede einzeln falsch sein könnten.
 *
 * `showModal()` und nicht das `open`-Attribut: Nur der modale Aufruf schaltet
 * die Fokusfalle und `inert` für den Rest der Seite ein. Mit `open` wäre es
 * ein Kasten, der bloß obenauf liegt.
 *
 * ── Warum die Markierung nicht gesucht wird ───────────────────────────────
 *
 * Sie kommt als Zeichenbereich vom Server (`spans` in `reassemble.ts`). Eine
 * Textsuche nach der Passage wäre einfacher und in dem Moment falsch, in dem
 * dieselbe Formulierung im Dokument zweimal vorkommt — dann markierte sie die
 * erste, und das ist in der Hälfte der Fälle die falsche.
 */

interface QuellText {
  title: string
  kind: string
  status: string
  pages: AssembledPage[]
}

export function SourceViewer({
  sourceId,
  /** Welcher Abschnitt hervorgehoben wird. `null` = nur lesen, nichts markieren. */
  chunkIndex,
  onClose
}: {
  sourceId: string
  chunkIndex: number | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const markeRef = useRef<HTMLElement>(null)
  const [daten, setDaten] = useState<QuellText | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  useEffect(() => {
    // `ignorieren` statt AbortController: Der Abruf soll durchlaufen dürfen,
    // nur das Ergebnis eines inzwischen ersetzten Aufrufs darf nicht mehr in
    // den Zustand. Ein Abbruch mitten in der Antwort brächte hier nichts —
    // die Anfrage ist längst beim Server.
    let ignorieren = false

    void (async () => {
      try {
        const antwort = await fetch(`/api/sources/${sourceId}/text`)
        if (!antwort.ok) {
          if (!ignorieren) {
            setFehler(
              antwort.status === 404
                ? 'Diese Quelle gibt es nicht mehr.'
                : 'Der Text konnte nicht geladen werden.'
            )
          }
          return
        }
        const koerper = (await antwort.json()) as QuellText
        if (!ignorieren) setDaten(koerper)
      } catch {
        if (!ignorieren) setFehler('Der Text konnte nicht geladen werden.')
      }
    })()

    return () => {
      ignorieren = true
    }
  }, [sourceId])

  // Erst wenn der Text steht, kann die Markierung in den sichtbaren Bereich
  // gerollt werden — vorher gibt es sie nicht.
  //
  // Ohne `behavior` und damit ohne Animation: Ein sanfter Sprung über
  // hunderte Zeilen ist bei `prefers-reduced-motion` genau das, was der Nutzer
  // abbestellt hat, und hier bringt er nichts.
  useEffect(() => {
    if (daten) markeRef.current?.scrollIntoView({ block: 'center' })
  }, [daten])

  const seiteMitMarke =
    chunkIndex === null
      ? undefined
      : daten?.pages.find((s) => s.spans.some((sp) => sp.chunkIndex === chunkIndex))

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // Ein Klick auf den Hintergrund schließt. Das Ereignis trifft das
      // `<dialog>` selbst nur dann — alles im Inhalt hat ein anderes Ziel.
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close()
      }}
      aria-labelledby="quelltext-titel"
      className="m-auto w-[min(44rem,92vw)] rounded-card border border-hairline bg-surface p-0 text-ink shadow-pop backdrop:bg-[rgb(0_0_0/0.55)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <h2 id="quelltext-titel" className="truncate text-base font-bold">
            {daten?.title ?? 'Quelltext'}
          </h2>
          {daten ? (
            <p className="mt-0.5 text-xs text-faint-ink">
              {daten.kind.toUpperCase()}
              {daten.pages.length > 1 ? ` · ${daten.pages.length} Seiten` : ''}
              {seiteMitMarke?.pageNumber ? ` · Beleg auf Seite ${seiteMitMarke.pageNumber}` : ''}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          onClick={() => dialogRef.current?.close()}
        >
          Schließen
        </Button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
        {fehler ? (
          <p role="alert" className="rounded-control bg-err-soft px-4 py-3 text-sm text-err">
            {fehler}
          </p>
        ) : !daten ? (
          // Skelett in den Maßen des echten Inhalts — sonst springt das
          // Layout, sobald der Text da ist, und der Sprung zählt als CLS.
          /* `role="status"`, nicht nur `aria-busy`: Ein `<div>` ohne Rolle darf
             gar kein `aria-label` tragen — axe meldet das als
             `aria-prohibited-attr`, und der Ladezustand bliebe unangesagt.
             Gefunden vom a11y-Durchlauf über den offenen Dialog, der mit dieser
             Scheibe dazugekommen ist. */
          <div
            role="status"
            aria-busy="true"
            aria-label="Text wird geladen"
            className="flex flex-col gap-2"
          >
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-surface-2"
                style={{ width: `${[100, 96, 99, 72, 100, 93, 98, 60][i]}%` }}
              />
            ))}
          </div>
        ) : daten.pages.length === 0 ? (
          <p className="text-sm text-muted-ink">
            {daten.status === 'failed'
              ? 'Diese Quelle konnte nicht verarbeitet werden — es gibt keinen Text dazu.'
              : 'Diese Quelle wird noch verarbeitet. Sobald sie bereit ist, steht der Text hier.'}
          </p>
        ) : (
          daten.pages.map((seite) => (
            <section key={seite.pageNumber ?? 'ohne'} className="mb-6 last:mb-0">
              {seite.pageNumber === null ? null : (
                <h3 className="mb-2 text-xs font-bold text-faint-ink">Seite {seite.pageNumber}</h3>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                <Markiert
                  text={seite.text}
                  bereich={seite.spans.find((s) => s.chunkIndex === chunkIndex)}
                  markeRef={markeRef}
                />
              </p>
            </section>
          ))
        )}
      </div>
    </dialog>
  )
}

/**
 * Der Text einer Seite, gegebenenfalls mit einer hervorgehobenen Passage.
 *
 * `<mark>` und kein gefärbtes `<span>`: Das Element bedeutet „hervorgehoben,
 * weil es für den aktuellen Zweck von Belang ist" — genau das trifft hier zu,
 * und Screenreader können es ansagen.
 */
function Markiert({
  text,
  bereich,
  markeRef
}: {
  text: string
  bereich: { von: number; bis: number } | undefined
  markeRef: React.RefObject<HTMLElement | null>
}) {
  if (!bereich) return text

  return (
    <>
      {text.slice(0, bereich.von)}
      <mark ref={markeRef} className="rounded-[3px] bg-accent px-0.5 text-on-accent">
        {text.slice(bereich.von, bereich.bis)}
      </mark>
      {text.slice(bereich.bis)}
    </>
  )
}
