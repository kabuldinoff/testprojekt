/**
 * Kontrastverhältnis nach WCAG 2.1 — reine Rechnung, kein I/O.
 *
 * Existiert, damit die Palette prüfbar ist statt nur behauptet. Ein
 * Farbwechsel, der einen Text unter die Schwelle drückt, fällt sonst
 * frühestens im Lighthouse-Bericht auf, und dann ist er längst überall im
 * Produkt.
 *
 * Anlass war ein konkreter Fall: `text-white` auf `--brand-600` erreicht im
 * hellen Theme 5.17:1, im dunklen aber nur 3.23:1 — und Dark ist der
 * Standard. Der Knopf, den jeder als Erstes sieht, verfehlte AA.
 */

/** Schwelle für normalen Text (WCAG 2.1 AA). */
export const AA_NORMAL = 4.5
/** Schwelle für großen Text ab 24px bzw. 19px fett, und für UI-Umrisse. */
export const AA_LARGE = 3

/**
 * Relative Leuchtdichte eines sRGB-Farbwerts.
 * Formel aus WCAG 2.1, inklusive der Gamma-Rücknahme unterhalb von 0.03928.
 */
export function luminance(hex: string): number {
  const value = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Kein sechsstelliger Hex-Wert: ${hex}`)
  }

  const channels = [0, 2, 4]
    .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))

  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

/** Kontrastverhältnis zweier Farben, zwischen 1 und 21. Reihenfolge egal. */
export function contrastRatio(a: string, b: string): number {
  const [heller, dunkler] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (heller! + 0.05) / (dunkler! + 0.05)
}

/**
 * Legt eine halbdurchsichtige Farbe über eine deckende und gibt das Ergebnis
 * als Hex-Wert zurück.
 *
 * Gebraucht für den Verlauf hinter dem Hero: Er liegt als `rgb(… / alpha)`
 * über `--canvas`, und der Text darauf muss auch an seiner dichtesten Stelle
 * lesbar bleiben. Ein Kontrastwert gegen `--canvas` allein wäre dort zu
 * optimistisch — er misst einen Untergrund, den es an dieser Stelle nicht
 * gibt.
 *
 * Die gewöhnliche Alpha-Überblendung, nicht die wahrnehmungsrichtige:
 * Browser mischen so, und geprüft wird, was der Browser zeigt.
 */
export function composite(background: string, overlay: string, alpha: number): string {
  const kanaele = (hex: string) => {
    const wert = hex.trim().replace('#', '')
    if (!/^[0-9a-fA-F]{6}$/.test(wert)) throw new Error(`Kein sechsstelliger Hex-Wert: ${hex}`)
    return [0, 2, 4].map((i) => parseInt(wert.slice(i, i + 2), 16))
  }

  const unten = kanaele(background)
  const oben = kanaele(overlay)

  return (
    '#' +
    [0, 1, 2]
      .map((i) => Math.round(unten[i]! * (1 - alpha) + oben[i]! * alpha))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}
