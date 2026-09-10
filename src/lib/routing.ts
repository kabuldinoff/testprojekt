/**
 * Reine Entscheidungen über Pfade. Kein I/O, kein Framework.
 *
 * Beides stand vorher zweimal im Code — einmal in den Server Actions, einmal
 * im Callback-Handler, und die Schutzprüfung als Inline-Ausdruck in der
 * Middleware. Genau bei so etwas korrigiert man eine Stelle und vergisst die
 * andere; bei einer Weiterleitung nach der Anmeldung ist die vergessene Stelle
 * eine Phishing-Bühne.
 */

/** Bereich, der eine Anmeldung voraussetzt. */
const PROTECTED_PREFIX = '/app'

/**
 * Gibt ein Weiterleitungsziel nur zurück, wenn es zweifelsfrei intern ist —
 * sonst `/app`.
 *
 * Die naheliegende Prüfung `/^\/(?!\/)/` reicht **nicht**. Sie lässt
 * `/\evil.com` durch: das beginnt mit einem einzelnen Schrägstrich, das zweite
 * Zeichen ist ein Backslash. Browser normalisieren den Backslash zu einem
 * Schrägstrich, woraus `//evil.com` wird — also eine protokollrelative URL auf
 * eine fremde Domain. `new URL('/\\evil.com', 'https://notabene.test').href`
 * ergibt tatsächlich `https://evil.com/`.
 *
 * Deshalb wird hier positiv geprüft und nicht negativ gefiltert: ein einzelner
 * führender Schrägstrich, danach kein weiterer Schrägstrich und nirgends ein
 * Backslash.
 */
export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string') return PROTECTED_PREFIX
  if (!raw.startsWith('/')) return PROTECTED_PREFIX
  if (raw.startsWith('//')) return PROTECTED_PREFIX
  if (raw.includes('\\')) return PROTECTED_PREFIX
  return raw
}

/**
 * Ob ein Pfad zum geschützten Bereich gehört.
 *
 * `startsWith('/app')` allein wäre zu grob: es trifft auch `/appartement` oder
 * `/app-preview`. Eine öffentliche Seite mit diesem Präfix würde dann
 * unangemeldete Besucher zur Anmeldung schicken, ohne dass jemand versteht,
 * warum. Geprüft wird deshalb auf das vollständige Pfadsegment.
 */
export function isProtectedPath(pathname: string): boolean {
  return pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`)
}
