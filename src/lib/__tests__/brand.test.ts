/**
 * Hält die JavaScript-Farbwerte und `globals.css` zusammen.
 *
 * Gebraucht werden sie in `next/og`: Dort gibt es kein Stylesheet und keine
 * CSS-Variablen, also müssen die Werte als Literale vorliegen. Das ist die
 * Stelle, an der eine Palette auseinanderläuft, ohne dass es auffällt — ein
 * Vorschaubild sieht man erst, wenn jemand anders den Link einfügt.
 *
 * Und es ist bereits passiert: Der Verlauf im Vorschaubild stand auf
 * `#5B8DEF`, während `--glow` mit `rgb(37 99 235 / 0.45)` arbeitet. Das Bild
 * hätte einen anderen Verlauf gezeigt als die Seite, für die es wirbt.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BRAND, CANVAS, GLOW_COLOR, INK, MARK_RADIUS, MUTED_INK, SURFACE } from '../brand'
import { readTokenBlock } from '../theme-tokens'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
const block = readTokenBlock(css, ':root,\n.dark')
if (block === null) throw new Error('Der Dark-Block fehlt in globals.css')
const dark = block.tokens

const PAARE: Array<[string, string, string]> = [
  ['--canvas', CANVAS, 'Seitenhintergrund'],
  ['--surface', SURFACE, 'Karten'],
  ['--ink', INK, 'Fließtext'],
  ['--muted-ink', MUTED_INK, 'zweite Ebene'],
  ['--brand-600', BRAND, 'Primärfarbe']
]

describe('die Farbwerte für next/og', () => {
  it.each(PAARE)('%s (%s) entspricht globals.css — %s', (token, wert) => {
    expect(dark.get(token)?.toLowerCase()).toBe(wert.toLowerCase())
  })

  it('der Verlauf benutzt dieselbe Farbe wie --glow', () => {
    // `--glow` steht als CSS-Funktion da, nicht als einzelner Wert. Verglichen
    // werden deshalb die Kanäle, nicht die Schreibweise: CSS schreibt
    // `rgb(37 99 235 / 0.45)`, `next/og` versteht nur `rgba(37, 99, 235, 0.45)`.
    const glow = dark.get('--glow') ?? ''
    const kanaele = /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)/.exec(glow)
    expect(kanaele, `--glow nicht lesbar: ${glow}`).not.toBeNull()

    const [, r, g, b, a] = kanaele!
    expect(GLOW_COLOR).toBe(`rgba(${r}, ${g}, ${b}, ${a})`)
  })

  it('der Radius der Plakette entspricht --mark-radius', () => {
    // Aus dem themenunabhängigen Block: Geometrie ist in beiden Ausprägungen
    // dieselbe und steht deshalb nicht im Dark-Block.
    const geometrie = readTokenBlock(css, ':root {')
    expect(geometrie?.tokens.get('--mark-radius')).toBe(`${MARK_RADIUS}px`)
  })
})
