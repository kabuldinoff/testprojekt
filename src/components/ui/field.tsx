import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'

import { cn } from '@/lib/cn'

/**
 * Beschriftetes Eingabefeld mit Fehlertext.
 *
 * Der Grund, warum das eine Komponente ist und kein Muster zum Abschreiben:
 * die Verknüpfung von Label, Feld und Fehlermeldung über id, aria-describedby
 * und aria-invalid ist genau die Stelle, die man beim Abschreiben vergisst.
 * Ohne sie liest ein Screenreader das Feld ohne Namen vor und die
 * Fehlermeldung gar nicht.
 */
export function Field({
  label,
  error,
  hint,
  className,
  ...props
}: ComponentProps<'input'> & { label: string; error?: string | undefined; hint?: ReactNode }) {
  const id = useId()
  const errorId = `${id}-fehler`
  const hintId = `${id}-hinweis`

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>

      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          // 16px auf Mobilgeräten: iOS Safari zoomt beim Fokus in jedes Feld
          // unter 16px hinein und verlässt dabei den Viewport. Ab sm wieder 14px.
          'w-full rounded-control border bg-surface px-3.5 py-2.5 text-base text-ink sm:text-sm',
          'placeholder:text-faint-ink',
          error ? 'border-err' : 'border-hairline',
          className
        )}
      />

      {hint ? (
        <p id={hintId} className="text-xs text-faint-ink">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-xs font-medium text-err">
          {error}
        </p>
      ) : null}
    </div>
  )
}
