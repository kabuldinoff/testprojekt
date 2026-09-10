/**
 * Darstellung des Verarbeitungszustands — rein, damit sie testbar ist.
 *
 * Die Zuordnung von Zustand zu Text und Tonlage steht an einer Stelle. Sonst
 * heißt derselbe Zustand in der Liste anders als im Detail, und der Nutzer
 * hält es für zwei verschiedene Dinge.
 */

export type SourceStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface StatusView {
  label: string
  tone: 'wait' | 'work' | 'ready' | 'err'
  /** Ob dieser Zustand sich noch ändern kann — steuert Abfrage und Anzeige. */
  settled: boolean
}

const VIEWS: Record<SourceStatus, StatusView> = {
  pending: { label: 'Wartet', tone: 'wait', settled: false },
  processing: { label: 'Wird verarbeitet', tone: 'work', settled: false },
  ready: { label: 'Bereit', tone: 'ready', settled: true },
  failed: { label: 'Fehlgeschlagen', tone: 'err', settled: true }
}

export function statusView(status: string): StatusView {
  // Ein unbekannter Zustand ist ein Fehler im Programm, kein Nutzerfehler.
  // Ihn als „wartet" darzustellen wäre eine Lüge; als Fehler ist er wenigstens
  // sichtbar.
  return VIEWS[status as SourceStatus] ?? { label: 'Unbekannt', tone: 'err', settled: true }
}

/** Ob überhaupt noch etwas passieren kann — Abbruchbedingung fürs Abfragen. */
export function anyPending(statuses: string[]): boolean {
  return statuses.some((s) => !statusView(s).settled)
}

/** Zustände, die ein erneutes Anstoßen brauchen. */
export function needsTrigger(status: string): boolean {
  return status === 'pending'
}
