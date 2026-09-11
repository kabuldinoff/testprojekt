/**
 * Prüft die Übersetzung gespeicherter Nachrichten in die Form des Chat-Hooks.
 *
 * Die Eigenschaft, um die es geht: eine neu geströmte und eine aus der
 * Datenbank geladene Antwort müssen für die Oberfläche **gleich aussehen**.
 * Nur deshalb kommt die Darstellung ohne einen Zweig für „alte Nachricht"
 * aus — und ein solcher Zweig wäre die Stelle, an der live und gespeichert
 * auseinanderlaufen.
 */
import { describe, expect, it } from 'vitest'

import type { Citation } from '../chat/citations'
import { sourcesOf, storedToUi, textOf, type StoredMessage } from '../chat/ui'

const beleg: Citation = {
  n: 1,
  sourceId: 'quelle-1',
  sourceTitle: 'Quartalsbericht',
  chunkIndex: 0,
  pageNumber: 4,
  charStart: 0,
  charEnd: 80,
  excerpt: 'Die Marge stieg von 18,2 auf 21,4 Prozent.'
}

const gespeichert = (m: Partial<StoredMessage>): StoredMessage => ({
  id: 'm1',
  role: 'assistant',
  content: 'Antwort [1].',
  citations: [beleg],
  ...m
})

describe('storedToUi', () => {
  it('legt die Belege vor den Text', () => {
    // Dieselbe Reihenfolge wie im Strom: die Route schreibt die Ausschnitte,
    // bevor das erste Zeichen kommt, damit `[1]` sofort auflösbar ist.
    const m = storedToUi(gespeichert({}))
    expect(m.parts.map((p) => p.type)).toEqual(['data-sources', 'text'])
  })

  it('macht die Belege über sourcesOf wieder zugänglich', () => {
    const m = storedToUi(gespeichert({}))
    expect(sourcesOf(m)).toEqual([beleg])
    expect(sourcesOf(m)[0]!.excerpt).toBe(beleg.excerpt)
  })

  it('gibt den Text unverändert zurück', () => {
    expect(textOf(storedToUi(gespeichert({})))).toBe('Antwort [1].')
  })

  it('hängt an eine Nutzerfrage keinen Belegteil', () => {
    // Eine Frage hat keine Quellen. Ein leerer Datenteil wäre kein Fehler,
    // aber er stünde im Verlauf und lüde dazu ein, ihn auszuwerten.
    const m = storedToUi(gespeichert({ role: 'user', content: 'Wie war die Marge?' }))
    expect(m.parts.map((p) => p.type)).toEqual(['text'])
    expect(sourcesOf(m)).toEqual([])
  })

  it('kommt mit einer Antwort ohne Belege zurecht', () => {
    // „Dazu steht nichts in den Quellen" ist eine gültige Antwort und hat
    // keine Belege.
    const m = storedToUi(gespeichert({ citations: [] }))
    expect(sourcesOf(m)).toEqual([])
    expect(textOf(m)).toBe('Antwort [1].')
  })

  it('behält die Kennung, damit React die Nachricht wiedererkennt', () => {
    expect(storedToUi(gespeichert({ id: 'abc' })).id).toBe('abc')
  })
})
