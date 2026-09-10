/**
 * Prüft die Belegverarbeitung.
 *
 * Der Schwerpunkt liegt auf dem Fall, der einen Rechercheassistenten
 * unglaubwürdig macht: eine Nummer, die es nicht gibt. Ein Beleg, der ins
 * Leere führt, sieht aus wie Sorgfalt und ist das Gegenteil.
 */
import { describe, expect, it } from 'vitest'

import { parseCitations, splitAnswer, type RetrievedChunk } from '../chat/citations'

function chunk(n: number, extra: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: `id-${n}`,
    sourceId: `quelle-${n}`,
    sourceTitle: `Quelle ${n}`,
    chunkIndex: n,
    content: `Inhalt ${n}`,
    pageNumber: n,
    charStart: n * 100,
    charEnd: n * 100 + 50,
    ...extra
  }
}

const drei = [chunk(1), chunk(2), chunk(3)]

describe('parseCitations · gültige Verweise', () => {
  it('liest einen Verweis aus und behält ihn im Text', () => {
    const { text, citations, dropped } = parseCitations('Die Marge stieg [1].', drei)
    expect(text).toBe('Die Marge stieg [1].')
    expect(citations).toHaveLength(1)
    expect(citations[0]!.sourceTitle).toBe('Quelle 1')
    expect(dropped).toBe(0)
  })

  it('bildet die Nummer auf den Ausschnitt an dieser Position ab', () => {
    // Die einzige Verbindung zwischen Zahl und Dokumentstelle. Wäre sie um
    // eins verschoben, zeigte jeder Beleg auf die falsche Stelle — und zwar
    // ohne dass irgendetwas kaputt aussieht.
    const { citations } = parseCitations('Text [2].', drei)
    expect(citations[0]!.charStart).toBe(200)
    expect(citations[0]!.chunkIndex).toBe(2)
  })

  it('trägt die belegte Passage im Wortlaut mit', () => {
    // Der Beleg muss lesbar bleiben, wenn die Quelle gelöscht wird — sonst
    // ist die alte Antwort nachträglich unüberprüfbar.
    const { citations } = parseCitations('Text [1].', drei)
    expect(citations[0]!.excerpt).toBe('Inhalt 1')
  })

  it('zerlegt eine Sammelklammer in einzelne Belege', () => {
    // `[2, 3]` als eine Schaltfläche müsste zwei Stellen gleichzeitig öffnen.
    const { text, citations } = parseCitations('Beides gilt [2, 3].', drei)
    expect(text).toBe('Beides gilt [2][3].')
    expect(citations.map((c) => c.n)).toEqual([2, 3])
  })

  it('führt eine mehrfach genannte Nummer nur einmal auf', () => {
    const { citations } = parseCitations('Erst [1], später erneut [1].', drei)
    expect(citations).toHaveLength(1)
  })

  it('sortiert die Liste nach Nummer, nicht nach Auftreten', () => {
    // Die Liste unter der Antwort soll dieselbe Reihenfolge haben wie die
    // Zahlen im Text — sonst sucht der Leser bei jedem Klick.
    const { citations } = parseCitations('Zuerst [3], dann [1].', drei)
    expect(citations.map((c) => c.n)).toEqual([1, 3])
  })
})

describe('parseCitations · erfundene Verweise', () => {
  it('entfernt eine Nummer, die es nicht gibt, und zählt sie', () => {
    const { text, citations, dropped } = parseCitations('Behauptung [7].', drei)
    expect(text).toBe('Behauptung.')
    expect(citations).toEqual([])
    expect(dropped).toBe(1)
  })

  it('behält die gültigen aus einer gemischten Klammer', () => {
    const { text, citations, dropped } = parseCitations('Teils belegt [2, 9].', drei)
    expect(text).toBe('Teils belegt [2].')
    expect(citations.map((c) => c.n)).toEqual([2])
    expect(dropped).toBe(1)
  })

  it('lehnt die Null und negative Zahlen ab', () => {
    // `[0]` wäre chunks[-1] — in JavaScript undefined, und der Zugriff darauf
    // ergäbe einen Beleg aus lauter undefined statt eines Fehlers.
    const { citations, dropped } = parseCitations('Text [0].', drei)
    expect(citations).toEqual([])
    expect(dropped).toBe(1)
  })

  it('kommt mit einer leeren Ausschnittsliste zurecht', () => {
    const { text, citations } = parseCitations('Dazu steht nichts in den Quellen [1].', [])
    expect(text).toBe('Dazu steht nichts in den Quellen.')
    expect(citations).toEqual([])
  })
})

describe('parseCitations · was kein Verweis ist', () => {
  it('lässt einen Markdown-Link unangetastet', () => {
    // Ein zu großzügiges Muster (`\[.*?\]`) würde hier zuschlagen.
    const eingabe = 'Siehe [die Übersicht](https://example.test) dazu [1].'
    const { text, citations } = parseCitations(eingabe, drei)
    expect(text).toContain('[die Übersicht](https://example.test)')
    expect(citations.map((c) => c.n)).toEqual([1])
  })

  it('lässt Klammern ohne Ziffern stehen', () => {
    const { text } = parseCitations('Ein [Platzhalter] im Text.', drei)
    expect(text).toBe('Ein [Platzhalter] im Text.')
  })
})

describe('splitAnswer', () => {
  it('trennt Text und Belege in der Reihenfolge des Vorkommens', () => {
    expect(splitAnswer('Vor [1] nach.')).toEqual([
      { kind: 'text', value: 'Vor ' },
      { kind: 'citation', n: 1 },
      { kind: 'text', value: ' nach.' }
    ])
  })

  it('setzt zwei aufeinanderfolgende Belege einzeln', () => {
    expect(splitAnswer('Beides [1][2]').filter((p) => p.kind === 'citation')).toHaveLength(2)
  })

  it('behält den Text unverändert, wenn kein Beleg vorkommt', () => {
    expect(splitAnswer('Nur Text.')).toEqual([{ kind: 'text', value: 'Nur Text.' }])
  })

  it('zerlegt auch eine gespeicherte Sammelklammer', () => {
    // Ältere Nachrichten können `[1, 2]` enthalten. Sie sollen weiterhin
    // anklickbar sein statt roh dargestellt zu werden.
    expect(splitAnswer('Alt [1, 2]').filter((p) => p.kind === 'citation')).toHaveLength(2)
  })
})
