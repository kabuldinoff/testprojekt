/**
 * Die Farbwerte, die außerhalb von CSS gebraucht werden.
 *
 * `next/og` rendert Bilder in einer eigenen Umgebung: kein Stylesheet, keine
 * CSS-Variablen, nur Inline-Stile. Die Werte müssen dort also als
 * JavaScript-Literale vorliegen — und genau das ist die Stelle, an der eine
 * Palette auseinanderläuft, ohne dass es jemand merkt. Ein Vorschaubild sieht
 * man erst, wenn ein anderer den Link einfügt.
 *
 * Deshalb stehen sie hier an einer Stelle, und `src/lib/__tests__/brand.test.ts`
 * vergleicht sie Wert für Wert mit `globals.css`. Weicht eine ab, wird der
 * Test rot — nicht das Bild still falsch.
 *
 * Es sind die Werte der **dunklen** Ausprägung: Dark ist der Standard, und ein
 * Vorschaubild hat kein Theme, dem es folgen könnte.
 */

/** `--canvas` · Seitenhintergrund */
export const CANVAS = '#0e1424'

/** `--surface` · Karten und Panels */
export const SURFACE = '#1b2640'

/** `--ink` · Fließtext */
export const INK = '#edf1f7'

/** `--muted-ink` · zweite Ebene */
export const MUTED_INK = '#a8b0be'

/** `--brand-600` · Primärfarbe */
export const BRAND = '#5b8def'

/**
 * Die Ecke der Marken-Plakette.
 *
 * Sieben Pixel auf 28 — ein Viertel. Deutlich abgerundet, ohne ein Kreis zu
 * werden; bei einem einzelnen Buchstaben liest sich ein Kreis als Aufzählung
 * und ein scharfes Quadrat als Fehler. Derselbe Wert liegt als
 * `--radius-mark` in `globals.css`, damit Tab-Symbol und Wortmarke dieselbe
 * Form haben.
 */
export const MARK_RADIUS = 7

/**
 * Der Verlauf hinter dem Hero und im Vorschaubild.
 *
 * Die Geometrie stammt aus `--glow` in `globals.css` — aus der **dunklen**
 * Ausprägung: eine Ellipse von 700 auf 380 Pixeln, mittig und leicht über den
 * oberen Rand hinaus, damit der hellste Punkt außerhalb des Bildes liegt und
 * der sichtbare Teil gleichmäßig abfällt. Ein Vorschaubild hat kein Theme,
 * dem es folgen könnte, und Dark ist der Standard.
 *
 * Der helle Modus benutzt dieselbe Farbe bei weiterem Auslauf; das ist für
 * das Vorschaubild ohne Belang, steht aber in globals.css begründet.
 *
 * Die Farbe ist dieselbe wie dort. Beim Schreiben stand hier zunächst
 * `--brand-600` der dunklen Ausprägung statt der Farbe aus `--glow` — die
 * beiden sind verschieden, und das Vorschaubild hätte einen anderen Verlauf
 * gezeigt als die Seite, für die es wirbt.
 */
export const GLOW_COLOR = 'rgba(37, 99, 235, 0.45)'
export const GLOW_GEOMETRY = '700px 380px at 50% -10%'
export const GLOW = `radial-gradient(${GLOW_GEOMETRY}, ${GLOW_COLOR}, transparent 60%)`
