/**
 * Prüft die Zerlegung — die Funktion, an der die Qualität aller späteren
 * Antworten hängt.
 *
 * Die Tests sind nach Eigenschaften geordnet, nicht nach Zeilen: Größe,
 * Überlappung, Trennstellen, Rückverweise, Seitentreue. Eine kaputte Zerlegung
 * äußert sich nicht als Fehler, sondern als Antworten, die knapp danebenliegen
 * — und das fällt in keinem anderen Test auf.
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_CHARS,
  MIN_CHARS,
  OVERLAP_CHARS,
  TARGET_CHARS,
  chunkDocument,
  hasUsableText,
  type Page
} from '../sources/chunk'

/** Fließtext aus ganzen Sätzen, in der gewünschten Länge. */
function prose(chars: number): string {
  const sentence = 'Die Marge im Dienstleistungssegment stieg im dritten Quartal deutlich an. '
  return sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars)
}

const page = (text: string, number: number | null = 1): Page => ({ number, text })

describe('chunkDocument · Größe', () => {
  it('kurzer Text bleibt ein einziger Abschnitt', () => {
    const chunks = chunkDocument([page(prose(400))])
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.index).toBe(0)
  })

  it('langer Text wird zerlegt, und kein Abschnitt reißt die Obergrenze', () => {
    const chunks = chunkDocument([page(prose(10_000))])
    expect(chunks.length).toBeGreaterThan(5)
    for (const c of chunks) {
      expect(
        c.content.length,
        `Abschnitt ${c.index} ist ${c.content.length} Zeichen`
      ).toBeLessThanOrEqual(MAX_CHARS)
    }
  })

  it('kein Abschnitt ist ein bedeutungsloser Rest', () => {
    // Eine Länge, die knapp über einer Abschnittsgrenze endet — genau die
    // Situation, in der naive Zerlegung einen Zwei-Wort-Rest hinterlässt.
    const chunks = chunkDocument([page(prose(TARGET_CHARS * 2 + 20))])
    const last = chunks[chunks.length - 1]!
    expect(last.content.length).toBeGreaterThanOrEqual(MIN_CHARS)
  })

  it('die Indizes laufen lückenlos ab 0', () => {
    const chunks = chunkDocument([page(prose(8000))])
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i))
  })
})

describe('chunkDocument · Überlappung', () => {
  it('aufeinanderfolgende Abschnitte teilen sich Text', () => {
    const chunks = chunkDocument([page(prose(6000))])
    expect(chunks.length).toBeGreaterThan(2)

    for (let i = 1; i < chunks.length; i++) {
      // Der nächste Abschnitt beginnt vor dem Ende des vorigen. Ohne das geht
      // jede Aussage verloren, die genau über der Grenze liegt.
      expect(
        chunks[i]!.charStart,
        `Abschnitt ${i} beginnt bei ${chunks[i]!.charStart}, der vorige endet bei ${chunks[i - 1]!.charEnd}`
      ).toBeLessThan(chunks[i - 1]!.charEnd)
    }
  })

  it('die Überlappung bleibt im vorgesehenen Rahmen', () => {
    const chunks = chunkDocument([page(prose(6000))])
    for (let i = 1; i < chunks.length; i++) {
      const overlap = chunks[i - 1]!.charEnd - chunks[i]!.charStart
      expect(overlap).toBeGreaterThan(0)
      // Etwas Spielraum nach oben, weil die Grenze an einen Satz gerückt wird.
      expect(overlap).toBeLessThanOrEqual(OVERLAP_CHARS + 200)
    }
  })
})

describe('chunkDocument · Trennstellen', () => {
  it('trennt bevorzugt an Absätzen', () => {
    const absatz = prose(1000)
    const text = [absatz, absatz, absatz, absatz].join('\n\n')
    const chunks = chunkDocument([page(text)])

    // Geprüft wird das ENDE, nicht der Anfang. Durch die Überlappung beginnt
    // kein Abschnitt an einem Absatzumbruch — er beginnt ein Stück davor, im
    // vorigen Absatz. Der Absatz ist die Stelle, an der getrennt wird.
    const enden = chunks.map((c) => c.charEnd)
    const absatzGrenzen = [1002, 2004, 3006] // 1000 Zeichen + je zwei \n
    const treffer = absatzGrenzen.filter((g) => enden.includes(g))
    expect(treffer.length, `Enden: ${enden.join(', ')}`).toBeGreaterThan(0)
  })

  it('trennt nicht mitten im Wort', () => {
    const chunks = chunkDocument([page(prose(9000))])
    for (const c of chunks.slice(0, -1)) {
      const letzteZeichen = c.content.slice(-1)
      // Ein Abschnitt endet auf Satzzeichen oder einem vollständigen Wort,
      // nie auf einem abgeschnittenen Wortstück gefolgt von nichts.
      expect(letzteZeichen).toMatch(/[.!?»"'\wäöüß)\]]/)
    }
  })

  it('kommt mit Text ohne jede Satzgrenze zurecht', () => {
    // Ein einziges „Wort" über die Obergrenze hinaus — der Fall, in dem weder
    // Absatz noch Satz noch Wortgrenze existiert. Ohne Notausgang liefe die
    // Zerlegung hier endlos.
    const chunks = chunkDocument([page('x'.repeat(5000))])
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.content.length <= MAX_CHARS)).toBe(true)
  })
})

describe('chunkDocument · Rückverweise', () => {
  it('charStart und charEnd zeigen auf den echten Text', () => {
    const text = prose(5000)
    for (const c of chunkDocument([page(text)])) {
      // Das ist die Zusicherung, auf der die anklickbaren Zitate beruhen:
      // der Ausschnitt an diesen Positionen muss den Abschnitt enthalten.
      expect(text.slice(c.charStart, c.charEnd).trim()).toBe(c.content)
    }
  })

  it('die Bereiche laufen vorwärts und decken den Text ab', () => {
    const chunks = chunkDocument([page(prose(5000))])
    expect(chunks[0]!.charStart).toBe(0)
    expect(chunks[chunks.length - 1]!.charEnd).toBe(5000)
    for (const c of chunks) expect(c.charEnd).toBeGreaterThan(c.charStart)
  })
})

describe('chunkDocument · Seiten', () => {
  it('ein Abschnitt gehört zu genau einer Seite', () => {
    const chunks = chunkDocument([page(prose(3000), 1), page(prose(3000), 2), page(prose(3000), 3)])
    expect(new Set(chunks.map((c) => c.pageNumber))).toEqual(new Set([1, 2, 3]))

    // Die Positionen sind pro Seite gezählt, nicht über das Dokument hinweg —
    // sonst zeigte ein Zitat auf Seite 3 an eine Stelle, die es dort nicht gibt.
    for (const c of chunks) expect(c.charStart).toBeLessThan(3000)
  })

  it('überspringt leere Seiten, ohne die Nummerierung zu verlieren', () => {
    // Der Normalfall bei Scans: einzelne Seiten ohne Textebene.
    const chunks = chunkDocument([page(prose(2000), 1), page('   ', 2), page(prose(2000), 3)])
    expect(new Set(chunks.map((c) => c.pageNumber))).toEqual(new Set([1, 3]))
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i))
  })

  it('Quellen ohne Seiten tragen null', () => {
    const chunks = chunkDocument([page(prose(2000), null)])
    expect(chunks.every((c) => c.pageNumber === null)).toBe(true)
  })

  it('ein leeres Dokument ergibt keine Abschnitte', () => {
    expect(chunkDocument([])).toEqual([])
    expect(chunkDocument([page('', 1)])).toEqual([])
  })
})

describe('hasUsableText', () => {
  it('erkennt ein gescanntes PDF an fehlender Textebene', () => {
    // unpdf liefert für Scans leere oder fast leere Seiten. Ohne diese Prüfung
    // landete der Scan als Quelle ohne Abschnitte in der Liste — sichtbar
    // „bereit", aber unbrauchbar.
    expect(hasUsableText([page('', 1), page('  \n ', 2)])).toBe(false)
    expect(hasUsableText([page('Seite 1', 1), page('', 2)])).toBe(false)
  })

  it('lässt echten Text durch', () => {
    expect(hasUsableText([page(prose(500))])).toBe(true)
  })
})
