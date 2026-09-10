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
type Size = 'default' | 'compact'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 border-transparent',
  secondary: 'bg-surface text-ink border-hairline hover:bg-surface-2',
  ghost: 'bg-transparent text-muted-ink border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-transparent text-err border-hairline hover:bg-err-soft'
}

const SIZES: Record<Size, string> = {
  default: 'px-4 py-2.5 text-sm',
  compact: 'px-3 py-1.5 text-sm'
}

export function Button({
  variant = 'primary',
  size = 'default',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control border',
        'leading-tight font-bold transition-colors',
        // Ein deaktivierter Knopf muss als deaktiviert erkennbar sein, nicht
        // nur als nicht reagierend — sonst hält der Nutzer die Seite für kaputt.
        'disabled:cursor-not-allowed disabled:opacity-45',
        SIZES[size],
        VARIANTS[variant],
        className
      )}
    />
  )
}
