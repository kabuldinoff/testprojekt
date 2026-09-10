/**
 * Fügt Klassennamen zusammen und wirft Falsy-Werte weg.
 *
 * Bewusst kein clsx und kein tailwind-merge: die Komponenten hier haben
 * feste Basisklassen und wenige Varianten, es gibt also keine Konflikte
 * aufzulösen. Zwei Abhängigkeiten für zehn Zeichen wären der teurere Weg.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
