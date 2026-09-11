import Link from 'next/link'

import { cn } from '@/lib/cn'
import { SITE_NAME } from '@/lib/site'

/**
 * Das Markenzeichen: das „N" als Plakette, der Rest als Wort.
 *
 * Dieselbe Gestalt wie das Symbol im Browser-Tab (`src/app/icon.tsx`) —
 * abgerundetes Quadrat, dunkler Grund, ein Buchstabe. Wer den Tab und die
 * Seite nebeneinander sieht, soll dasselbe Zeichen erkennen.
 *
 * Die Farbe des Buchstabens kommt aus `--mark-ink` und wechselt mit dem
 * Theme: im Dunkeln Gold, im Hellen das Blau des Tab-Symbols. Die Fläche
 * bleibt in beiden Ausprägungen dunkel, damit das Zeichen überall gleich
 * aussieht, egal auf welchem Grund es sitzt.
 *
 * **Gold ist hier die vierte und letzte erlaubte Stelle** (siehe CLAUDE.md).
 * Ein Markenzeichen ist der Ort, an dem ein Akzent hingehört — aber die
 * Aufzählung dort ist abschließend, damit daraus keine zweite Primärfarbe
 * wird.
 *
 * Als Link, wenn `href` gesetzt ist: In der Kopfzeile führt das Zeichen zur
 * Startseite, im Arbeitsbereich wäre das ein Weg nach draußen, den niemand
 * sucht.
 */
export function Wordmark({
  href,
  className,
  hideWordBelowSm = false
}: {
  href?: string
  className?: string
  /**
   * Blendet den Wortteil unter 640 px aus und lässt nur die Plakette stehen.
   *
   * Nur für die Kopfleiste der Startseite: Dort konkurriert das Zeichen mit
   * zwei Einstiegen um denselben Platz, und von den dreien ist es das, dessen
   * Verkürzung am wenigsten kostet — die Plakette ist dieselbe wie im
   * Browser-Tab und damit für sich erkennbar.
   */
  hideWordBelowSm?: boolean
}) {
  const inhalt = (
    <>
      {/*
        `aria-hidden`, weil der Buchstabe im Text daneben ohnehin steht: Ein
        Screenreader liest sonst „N Notabene".
      */}
      {/*
        Der Rahmen ist nicht Zierde. Die Fläche der Plakette hat dieselbe Farbe
        wie `--canvas` im dunklen Theme — auf der Anmeldeseite säße sie damit
        unsichtbar auf ihrem eigenen Grund, und übrig bliebe ein einzelner
        goldener Buchstabe mit Abstand zum Wort. Der Rahmen gibt ihr auf jedem
        Untergrund eine Kante.
      */}
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-mark border border-hairline bg-mark-bg text-mark leading-none font-extrabold text-mark-ink"
      >
        N
      </span>
      {/*
        Enger Abstand und `word-spacing: normal`: Das Zeichen soll als **ein**
        Wort gelesen werden. Die Regel aus globals.css, die überall sonst mehr
        Luft zwischen Wörter setzt, wirkt hier gegen den Zweck.
      */}
      <span
        className={cn(
          'font-bold tracking-tight [word-spacing:normal]',
          hideWordBelowSm && 'hidden sm:inline'
        )}
      >
        otabene
      </span>
    </>
  )

  const klassen = cn(
    'inline-flex items-center gap-1 rounded-control',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
    className
  )

  if (!href) {
    return (
      <span className={klassen} aria-label={SITE_NAME}>
        {inhalt}
      </span>
    )
  }

  return (
    <Link href={href} className={klassen} aria-label={SITE_NAME}>
      {inhalt}
    </Link>
  )
}
