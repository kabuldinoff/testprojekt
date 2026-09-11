/**
 * Anzeigeformate rund um den Audio-Überblick.
 *
 * Steht in `src/lib/`, weil es ohne I/O entscheidbar ist — und weil eine
 * Formatierung, die nur in einer Komponente lebt, sich nur über einen
 * gerenderten Baum prüfen lässt.
 */

/** Sekunden je Minute. Benannt, weil `60` im Code zweimal etwas anderes heißen kann. */
const SECONDS_PER_MINUTE = 60

/**
 * Dauer als `m:ss`.
 *
 * Zweistellige Sekunden auch unter zehn: `1:05`, nicht `1:5`. Ohne das liest
 * sich die Zahl beim Überfliegen als „eine Minute und fünfzig".
 */
export function formatDuration(seconds: number): string {
  const sicher = Math.max(0, Math.round(seconds))
  const m = Math.floor(sicher / SECONDS_PER_MINUTE)
  const s = sicher % SECONDS_PER_MINUTE
  return `${m}:${String(s).padStart(2, '0')}`
}
