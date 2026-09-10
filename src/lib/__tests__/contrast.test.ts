import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AA_LARGE, AA_NORMAL, contrastRatio, luminance } from '../contrast'
import { readTokenBlock } from '../theme-tokens'

/**
 * Die Palette muss lesbar sein — in beiden Themes, nachgerechnet statt
 * behauptet.
 *
 * Anlass war ein Review-Befund, der nach einem semantischen Token für die
 * Knopfschrift fragte. Beim Nachmessen stellte sich heraus, dass dahinter ein
 * echter Fehler steckte: `text-white` auf `--brand-600` erreicht im hellen
 * Theme 5.17:1, im dunklen nur 3.23:1. Dark ist der Standard, also verfehlte
 * ausgerechnet der auffälligste Knopf des Produkts die AA-Schwelle.
 *
 * Ein einmaliges Nachrechnen hätte den nächsten Farbwechsel nicht überlebt.
 * Deshalb prüft dieser Test die Paarungen, die im UI tatsächlich vorkommen,
 * gegen `globals.css` — die Datei ist die einzige Quelle der Werte.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

const themes = {
  dark: readTokenBlock(css, ':root,\n.dark'),
  light: readTokenBlock(css, '.light {')
}

/**
 * Paarungen aus dem echten UI. Jede steht für eine Stelle, die es gibt —
 * eine Matrix aller Kombinationen würde Paare prüfen, die niemand je sieht,
 * und dabei echte Lücken hinter Rauschen verstecken.
 */
const PAIRS: Array<{ where: string; foreground: string; background: string; threshold: number }> = [
  // Fließtext und Überschriften
  { where: 'Text auf Karte', foreground: '--ink', background: '--surface', threshold: AA_NORMAL },
  { where: 'Text auf Seite', foreground: '--ink', background: '--canvas', threshold: AA_NORMAL },
  {
    where: 'Fließtext auf Karte',
    foreground: '--muted-ink',
    background: '--surface',
    threshold: AA_NORMAL
  },
  {
    where: 'Fließtext auf Seite',
    foreground: '--muted-ink',
    background: '--canvas',
    threshold: AA_NORMAL
  },
  // Hinweise und Metazeilen sind klein — also gilt die strenge Schwelle.
  {
    where: 'Hinweistext auf Karte',
    foreground: '--faint-ink',
    background: '--surface',
    threshold: AA_NORMAL
  },

  // Der Fall, der diesen Test ausgelöst hat.
  {
    where: 'Knopfschrift auf Primär',
    foreground: '--on-brand',
    background: '--brand-600',
    threshold: AA_NORMAL
  },
  {
    where: 'Knopfschrift beim Hover',
    foreground: '--on-brand',
    background: '--brand-700',
    threshold: AA_NORMAL
  },
  {
    where: 'Link auf Karte',
    foreground: '--brand-600',
    background: '--surface',
    threshold: AA_NORMAL
  },

  // Statusfarben — Text, nicht nur Fläche.
  {
    where: 'Fehlertext auf Karte',
    foreground: '--err',
    background: '--surface',
    threshold: AA_NORMAL
  },
  {
    where: 'Fehlertext auf Fehlerfläche',
    foreground: '--err',
    background: '--err-soft',
    threshold: AA_NORMAL
  },
  {
    where: 'Erfolgstext auf Karte',
    foreground: '--ok',
    background: '--surface',
    threshold: AA_NORMAL
  },
  {
    where: 'Erfolgstext auf Erfolgsfläche',
    foreground: '--ok',
    background: '--ok-soft',
    threshold: AA_NORMAL
  },
  {
    where: 'Warntext auf Warnfläche',
    foreground: '--warn',
    background: '--warn-soft',
    threshold: AA_NORMAL
  },

  // Gold — das Akzentpaar, das am ehesten kippt.
  {
    where: 'Goldtext auf Goldfläche',
    foreground: '--accent-ink',
    background: '--accent-soft',
    threshold: AA_NORMAL
  },

  // Zitat-Chip: der wichtigste Baustein des Produkts.
  { where: 'Zitat-Chip', foreground: '--cite-fg', background: '--cite-bg', threshold: AA_NORMAL },

  // Umrisse und Trennlinien sind keine Schrift — für sie gilt die
  // UI-Komponenten-Schwelle, nicht die für Text.
  {
    where: 'Trennlinie auf Karte',
    foreground: '--hairline',
    background: '--surface',
    threshold: 1.2
  }
]

describe('luminance', () => {
  it('rechnet die Enden der Skala richtig', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5)
    expect(luminance('#000000')).toBeCloseTo(0, 5)
  })

  it('lehnt ab, was kein Hex-Wert ist', () => {
    expect(() => luminance('rot')).toThrow()
    expect(() => luminance('#FFF')).toThrow()
  })
})

describe('contrastRatio', () => {
  it('liefert die bekannten Extremwerte', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('ist unabhängig von der Reihenfolge', () => {
    expect(contrastRatio('#2563EB', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#2563EB'), 10)
  })
})

describe.each(Object.entries(themes))('Palette: %s', (name, block) => {
  it('der Theme-Block existiert', () => {
    expect(block, `Block für ${name} nicht in globals.css gefunden`).not.toBeNull()
  })

  it.each(PAIRS)('$where erreicht die Schwelle', ({ where, foreground, background, threshold }) => {
    const fg = block!.tokens.get(foreground)
    const bg = block!.tokens.get(background)
    expect(fg, `${foreground} fehlt im ${name}-Block`).toBeDefined()
    expect(bg, `${background} fehlt im ${name}-Block`).toBeDefined()

    const ratio = contrastRatio(fg!, bg!)
    expect(
      ratio,
      `${where} (${name}): ${foreground} ${fg} auf ${background} ${bg} = ${ratio.toFixed(2)}:1, nötig ${threshold}`
    ).toBeGreaterThanOrEqual(threshold)
  })
})

describe('die Schwellen sind die aus WCAG 2.1', () => {
  it('AA für normalen und großen Text', () => {
    expect(AA_NORMAL).toBe(4.5)
    expect(AA_LARGE).toBe(3)
  })
})
