/**
 * Die Angaben über das Produkt, die an mehreren Stellen wortgleich auftauchen
 * müssen: Titel, Beschreibung, Adresse.
 *
 * An einer Stelle, weil sie sonst auseinanderlaufen — und zwar unbemerkt. Der
 * Titel steht im `<title>`, in den Open-Graph-Angaben, im JSON-LD und im
 * OG-Bild. Vier Orte, vier Gelegenheiten für eine veraltete Fassung, und
 * keiner davon fällt beim Benutzen auf: Man sieht die Beschreibung erst,
 * wenn jemand den Link woanders einfügt.
 */

export const SITE_NAME = 'Notabene'

/** Eine Zeile. Erscheint unter dem Titel in Suchergebnissen und in Vorschauen. */
export const SITE_TAGLINE = 'Rechercheassistent mit belegten Antworten'

/**
 * Rund 150 Zeichen: die Länge, die Suchmaschinen typischerweise anzeigen.
 * Länger wird abgeschnitten, kürzer verschenkt Fläche.
 */
export const SITE_DESCRIPTION =
  'Dokumente hochladen und Fragen dazu stellen. Jede Antwort trägt Belege, ' +
  'ein Klick öffnet die Passage in der Quelle. Indexierung in der EU.'

/**
 * Die kanonische Adresse.
 *
 * Sie wird gebraucht, damit Open-Graph-Bilder, `sitemap.xml` und die
 * kanonischen Links absolute Adressen bekommen — relative funktionieren dort
 * nicht, weil sie von fremden Servern gelesen werden.
 *
 * Die Reihenfolge ist Absicht:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — die eigene Festlegung. Sie gewinnt, weil sie die
 *    einzige ist, die eine eigene Domain kennen kann.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — von Vercel gesetzt, zeigt immer auf die
 *    Produktionsadresse, auch aus einer Vorschau heraus. Genau das ist hier
 *    richtig: Eine Vorschau soll nicht ihre eigene Wegwerf-Adresse als
 *    kanonisch ausgeben und damit in den Index geraten.
 * 3. localhost — für die Entwicklung.
 *
 * Kein `required()`: Eine fehlende Adresse darf den Build nicht anhalten. Sie
 * macht die Vorschaubilder falsch, nicht die Anwendung kaputt.
 */
export function siteUrl(): string {
  const gesetzt = process.env.NEXT_PUBLIC_SITE_URL
  if (gesetzt) return gesetzt.replace(/\/$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}
