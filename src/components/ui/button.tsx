import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

/**
 * Der Knopf aus dem Design-Canvas (design/canvas.html, Artboard 03).
 *
 * Vier Varianten und zwei Größen, mehr braucht das Produkt nicht. Jede weitere
 * wäre eine Entscheidung, die im Canvas fehlt — und dann gehört sie zuerst
 * dorthin.
 *
 * Warum `size` eine Prop ist und keine Klasse von außen: Tailwind v4 löst
 * Konflikte nicht über die Reihenfolge im class-Attribut, sondern über die
 * Reihenfolge im erzeugten Stylesheet. Ein `className="px-3 py-1.5"` von außen
 * überschreibt das eingebaute `px-4 py-2.5` deshalb **nicht zuverlässig** —
 * beide Klassen existieren, und welche gewinnt, ist nicht die, die man
 * hinschreibt. Das war hier bereits der Fall: das Abmelden im App-Kopf sollte
 * kompakt sein und war es nur zufällig.
 *
 * Die naheliegende Lösung wäre `tailwind-merge`. Dagegen spricht, dass sie ein
 * Problem entschärft, statt es abzuschaffen: Konflikte blieben möglich, nur
 * würden sie zur Laufzeit aufgelöst. Mit einer festen Größenachse gibt es
 * nichts mehr aufzulösen, und `className` bleibt für das zuständig, was nicht
 * kollidiert — Breite, Abstand nach außen, Ausrichtung.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'default' | 'compact' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-on-brand hover:bg-brand-700 border-transparent',
  secondary: 'bg-surface text-ink border-hairline hover:bg-surface-2',
  ghost: 'bg-transparent text-muted-ink border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-transparent text-err border-hairline hover:bg-err-soft'
}

const SIZES: Record<Size, string> = {
  default: 'px-4 py-2.5 text-sm',
  compact: 'px-3 py-1.5 text-sm',
  // Nur ein Symbol darin, also ringsum gleich viel Luft: 2.5 auf ein 20px-Icon
  // ergibt 40px im Quadrat — dieselbe Höhe wie `default`, damit ein Symbolknopf
  // neben einem beschrifteten auf derselben Linie sitzt.
  //
  // Ein Symbolknopf trägt seinen zugänglichen Namen zwangsläufig im
  // `aria-label`: Es gibt keinen Text, aus dem er entstehen könnte.
  icon: 'p-2.5'
}

/**
 * Die Klassen ohne das Element.
 *
 * Ein Link, der wie ein Knopf aussieht, muss ein `<a>` bleiben: er navigiert,
 * also gehört ihm die Link-Rolle, das Öffnen im neuen Tab und die
 * Adressanzeige beim Überfahren. Ein `<button>` mit `onClick={router.push}`
 * nimmt dem Nutzer all das weg.
 *
 * Die Alternative wäre `asChild` über Radix Slot. Das wäre eine Abhängigkeit
 * für etwas, das eine exportierte Funktion genauso löst.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'default',
  className
  // `| undefined` ausdrücklich, nicht nur `?`. Mit exactOptionalPropertyTypes
  // sind das zwei verschiedene Dinge: `?` heißt "darf fehlen", nicht "darf
  // undefined sein". Der Aufruf aus <Button> reicht className durch, und das
  // ist dort legitim undefined.
}: { variant?: Variant; size?: Size; className?: string | undefined } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-control border',
    'leading-tight font-bold transition-colors',
    // Ein deaktivierter Knopf muss als deaktiviert erkennbar sein, nicht
    // nur als nicht reagierend — sonst hält der Nutzer die Seite für kaputt.
    'disabled:cursor-not-allowed disabled:opacity-45',
    SIZES[size],
    VARIANTS[variant],
    className
  )
}

export function Button({
  variant = 'primary',
  size = 'default',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClasses({ variant, size, className })} />
}
