import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Hinweisfeld für Erfolg, Warnung und Fehler.
 *
 * Beide Tonlagen brauchen eine Live-Region, aber nicht dieselbe.
 *
 * `role="alert"` beim Fehler: die Rolle unterbricht den Screenreader sofort.
 * Bei einer fehlgeschlagenen Anmeldung ist das genau richtig.
 *
 * `role="status"` beim Erfolg: höflich statt unterbrechend. Ohne irgendeine
 * Rolle wäre die Meldung für einen Screenreader gar nicht vorhanden — und
 * nach der Registrierung steht dort der Hinweis, dass eine Bestätigungsmail
 * unterwegs ist. Wer ihn nicht hört, kommt nicht weiter.
 *
 * `warn` bleibt bewusst ohne Rolle: diese Tonlage erscheint nur an Stellen,
 * die der Nutzer ohnehin gerade liest, nie als Ergebnis einer Aktion.
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
      role={tone === 'err' ? 'alert' : tone === 'ok' ? 'status' : undefined}
      className={cn('rounded-control border px-3.5 py-2.5 text-sm', TONES[tone])}
    >
      {children}
    </p>
  )
}
