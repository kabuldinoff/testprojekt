/**
 * Reine Helfer, um die Theme-Blöcke aus globals.css zu lesen.
 *
 * Zweck ist nicht Introspektion zur Laufzeit — im Browser passiert damit
 * nichts. Der Zweck ist ein Test: Dark und Light müssen exakt dieselben
 * Token-Namen definieren. Fehlt einer im Light-Block, erbt das Element still
 * den Dark-Wert und wird im hellen Design unsichtbar. Kein Fehler, keine
 * Warnung, nur ein weißer Text auf weißem Grund, den man erst im Screenshot
 * bemerkt.
 *
 * Die Funktionen sind bewusst frei von I/O: die Datei wird im Test gelesen,
 * nicht hier. Das macht sie ohne Dateisystem testbar.
 */

/** Ein Selektor-Block aus einer CSS-Datei, reduziert auf seine Custom Properties. */
export interface TokenBlock {
  selector: string
  tokens: Map<string, string>
}

/**
 * Liest die Custom Properties eines Blocks, der mit `selector` beginnt.
 *
 * Absichtlich ein simpler Parser statt einer CSS-Bibliothek: er muss genau eine
 * bekannte Datei verstehen, die wir selbst schreiben. Eine Abhängigkeit für
 * dreißig Zeilen wäre hier der teurere Weg (YAGNI).
 *
 * @returns `null`, wenn der Block nicht existiert — das ist für den Aufrufer
 *   eine andere Aussage als "Block vorhanden, aber leer", und beides ist ein
 *   Fehler, den der Test unterschiedlich melden soll.
 */
export function readTokenBlock(css: string, selector: string): TokenBlock | null {
  const start = css.indexOf(selector)
  if (start === -1) return null

  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  if (open === -1 || close === -1) return null

  const body = css.slice(open + 1, close)
  const tokens = new Map<string, string>()

  // Kommentare vor dem Zerlegen entfernen: ein /* … */ darf ein Semikolon
  // enthalten, sonst zerreißt der Split mitten in einer Begründung.
  for (const line of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const match = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/.exec(line)
    if (match?.[1] && match[2]) tokens.set(match[1], match[2])
  }

  return { selector, tokens }
}

/** Token-Namen, die im ersten Block stehen und im zweiten fehlen. */
export function missingTokens(reference: TokenBlock, candidate: TokenBlock): string[] {
  return [...reference.tokens.keys()].filter((name) => !candidate.tokens.has(name)).sort()
}

/**
 * Position eines Selektors in der Datei. Wird gebraucht, um die Reihenfolge der
 * Theme-Blöcke zu prüfen: `:root`, `.dark` und `.light` haben alle die
 * Spezifität 0,1,0, also gewinnt bei Gleichstand die spätere Regel. Steht der
 * :root-Block hinten, überstimmt er jedes .light und der Umschalter tut
 * sichtbar nichts — ohne Fehlermeldung.
 */
export function selectorPosition(css: string, selector: string): number {
  return css.indexOf(selector)
}
