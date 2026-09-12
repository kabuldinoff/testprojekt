import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AA_LARGE, AA_NORMAL, composite, contrastRatio, luminance } from '../contrast'
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

  // Das Markenzeichen. Die Fläche ist in beiden Ausprägungen dieselbe dunkle
  // Farbe, nur der Buchstabe wechselt — im Dunkeln Gold, im Hellen Blau.
  //
  // AA_NORMAL, nicht AA_LARGE: „Großer Text" beginnt bei 18.66px fett, der
  // Buchstabe steht aber bei 15px (`--text-mark`). Die lockere Schwelle hätte
  // hier 3:1 erlaubt und damit ein künftiges Farbpaar durchgelassen, das die
  // Richtlinie verfehlt. Beide aktuellen Werte bestehen die strenge ohnehin
  // deutlich: 15.42:1 dunkel, 5.68:1 hell.
  {
    where: 'Buchstabe im Markenzeichen',
    foreground: '--mark-ink',
    background: '--mark-bg',
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

/**
 * Die Überschrift über dem Verlauf hinter dem Hero.
 *
 * Der Verlauf liegt halbdurchsichtig über `--canvas`. Ein Kontrastwert gegen
 * `--canvas` allein misst dort einen Untergrund, den es an dieser Stelle nicht
 * gibt.
 *
 * ── Warum nur die Überschrift ─────────────────────────────────────────────
 *
 * Geprüft wird die **dichteste** Stelle, also die volle Deckkraft. Das ist für
 * die Überschrift eine sinnvolle Annahme — sie steht weit oben, wo der Schein
 * kräftig ist — und für den Fließtext darunter nicht: Der Absatz sitzt bei
 * rund 335px, und dort ist der Verlauf bereits vollständig ausgelaufen
 * (Deckkraft 0, also `--muted-ink` auf `--canvas`, und das ist oben geprüft).
 *
 * Diese Prüfung auch auf `--muted-ink` anzuwenden, war ein Fehlalarm: Sie
 * schlug mit 2.86:1 an für eine Farbkombination, die auf der Seite nirgends
 * entsteht — und hätte erzwungen, die Deckkraft auf 0.12 zu senken, womit vom
 * Schein nichts übrig bliebe.
 *
 * Was diese Rechnung nicht leisten kann, ist die Frage „welcher Text liegt
 * tatsächlich über welcher Dichte" — das hängt vom Layout ab. Eine Messung im
 * Browser wäre die Antwort, verlangt aber das Aufnehmen und Dekodieren eines
 * Bildes; sie ist nicht gebaut, und `e2e/c2-a11y` hält ausdrücklich fest,
 * warum dort nichts steht.
 *
 * Bis dahin trägt diese Rechnung, und sie trägt mit Reserve: Sie setzt die
 * volle Deckkraft an, während der dichteste Punkt des Verlaufs über dem
 * sichtbaren Rand liegt. Sie ist also strenger als die Wirklichkeit.
 */
describe('Überschrift über dem Verlauf', () => {
  for (const [name, block] of Object.entries(themes)) {
    describe(`Palette: ${name}`, () => {
      const glow = block?.tokens.get('--glow') ?? ''
      const treffer = /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)/.exec(glow)

      it('--glow ist lesbar', () => {
        expect(treffer, `--glow nicht auswertbar: ${glow}`).not.toBeNull()
      })

      it('bleibt an der dichtesten Stelle lesbar', () => {
        const [, r, g, b, a] = treffer!
        const hex = '#' + [r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')
        const grund = composite(block!.tokens.get('--canvas')!, hex, Number(a))
        const wert = contrastRatio(block!.tokens.get('--ink')!, grund)

        expect(
          wert,
          `--ink auf ${grund} (Verlauf über --canvas) erreicht nur ${wert.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(AA_NORMAL)
      })
    })
  }
})
