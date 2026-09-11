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
 * Wählt die kanonische Adresse aus zwei möglichen Angaben.
 *
 * Rein und ohne Umgebungszugriff, damit die Reihenfolge prüfbar ist statt nur
 * behauptet. `siteUrl()` darunter liest die Werte, diese Funktion entscheidet.
 *
 * Die Reihenfolge ist Absicht:
 *
 * 1. **Die eigene Festlegung.** Sie gewinnt, weil sie als einzige eine eigene
 *    Domain kennen kann.
 * 2. **Die Produktionsadresse von Vercel.** Sie zeigt auch aus einer Vorschau
 *    heraus auf die Produktion — und genau das ist hier richtig: Eine
 *    Vorschau soll nicht ihre eigene Wegwerf-Adresse als kanonisch ausgeben
 *    und damit in den Index geraten.
 * 3. **localhost** für die Entwicklung.
 *
 * Der abschließende Schrägstrich fällt weg: Die Adressen werden mit einem
 * Pfad zusammengesetzt, und `https://example.test//sitemap.xml` ist für
 * Crawler eine andere Adresse als die mit einem Schrägstrich.
 */
export function pickSiteUrl(explicit?: string, vercelHost?: string): string {
  if (explicit && explicit.trim().length > 0) return explicit.trim().replace(/\/+$/, '')
  if (vercelHost && vercelHost.trim().length > 0) {
    return `https://${vercelHost.trim().replace(/\/+$/, '')}`
  }
  return 'http://localhost:3000'
}

/**
 * Die kanonische Adresse aus der Umgebung.
 *
 * Sie wird gebraucht, damit Open-Graph-Bilder, `sitemap.xml` und die
 * kanonischen Links absolute Adressen bekommen — relative funktionieren dort
 * nicht, weil sie von fremden Servern gelesen werden.
 *
 * Kein `required()`: Eine fehlende Adresse darf den Build nicht anhalten. Sie
 * macht die Vorschaubilder falsch, nicht die Anwendung kaputt.
 */
export function siteUrl(): string {
  return pickSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL)
}
