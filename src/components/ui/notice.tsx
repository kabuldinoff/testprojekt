import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Hinweisfeld für Erfolg, Warnung und Fehler.
 *
 * `role="alert"` nur beim Fehler: die Rolle unterbricht den Screenreader
 * sofort. Für eine Bestätigung ist das übergriffig, für eine fehlgeschlagene
 * Anmeldung ist es genau richtig.
 */
type Tone = 'ok' | 'warn' | 'err'

const TONES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-ok/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  err: 'bg-err-soft text-err border-err/30'
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <p
      role={tone === 'err' ? 'alert' : undefined}
      className={cn('rounded-control border px-3.5 py-2.5 text-sm', TONES[tone])}
    >
      {children}
    </p>
  )
}
