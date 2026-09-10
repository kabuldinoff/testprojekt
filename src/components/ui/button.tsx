import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

/**
 * Der Knopf aus dem Design-Canvas (design/canvas.html, Artboard 03).
 *
 * Vier Varianten, mehr braucht das Produkt nicht. Jede weitere Variante wäre
 * eine Entscheidung, die im Canvas fehlt — und dann gehört sie zuerst dorthin.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 border-transparent',
  secondary: 'bg-surface text-ink border-hairline hover:bg-surface-2',
  ghost: 'bg-transparent text-muted-ink border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-transparent text-err border-hairline hover:bg-err-soft'
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control border px-4 py-2.5',
        'text-sm leading-tight font-bold transition-colors',
        // Ein deaktivierter Knopf muss als deaktiviert erkennbar sein, nicht
        // nur als nicht reagierend — sonst hält der Nutzer die Seite für kaputt.
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        className
      )}
    />
  )
}
