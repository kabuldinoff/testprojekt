/**
 * Prüft den Kontextaufbau.
 *
 * Die eine Eigenschaft, an der hier alles hängt: die Nummerierung im Text muss
 * zur zurückgegebenen Liste passen. Stimmt das nicht, zeigt jeder Beleg auf
 * die falsche Stelle — und nichts daran sieht kaputt aus.
 */
import { describe, expect, it } from 'vitest'

import { MAX_CONTEXT_CHARS, buildContext, buildUserMessage } from '../chat/prompt'
import type { RetrievedChunk } from '../chat/citations'

function chunk(n: number, content: string, pageNumber: number | null = n): RetrievedChunk {
  return {
    id: `id-${n}`,
    sourceId: `quelle-${n}`,
    sourceTitle: `Quelle ${n}`,
    chunkIndex: n,
    content,
    pageNumber,
    charStart: 0,
    charEnd: content.length
  }
}

describe('buildContext', () => {
  it('nummeriert ab 1 und gibt dieselbe Reihenfolge zurück', () => {
    const eingabe = [chunk(1, 'Erster'), chunk(2, 'Zweiter')]
    const { context, used } = buildContext(eingabe)

    expect(context).toContain('[1] (Quelle 1, Seite 1)\nErster')
    expect(context).toContain('[2] (Quelle 2, Seite 2)\nZweiter')
    expect(used).toEqual(eingabe)
  })

  it('nennt bei Quellen ohne Seiten nur den Titel', () => {
    // Webseiten und eingefügter Text haben keine Seitenzahl. „Seite null" im
    // Beleg wäre schlimmer als gar keine Angabe.
    const { context } = buildContext([chunk(1, 'Text', null)])
    expect(context).toContain('[1] (Quelle 1)')
    expect(context).not.toContain('Seite')
  })

  it('schneidet an der Zeichengrenze ab', () => {
    const gross = 'x'.repeat(10_000)
    const { context, used } = buildContext([1, 2, 3, 4].map((n) => chunk(n, gross)))

    expect(context.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS)
    expect(used.length).toBeLessThan(4)
  })

  it('gibt beim Abschneiden genau die verwendeten Ausschnitte zurück', () => {
    // Das ist die Zusicherung, auf der die Belege beruhen: der Aufrufer muss
    // mit derselben verkürzten Liste weiterarbeiten. Nähme er die
    // ursprüngliche, verwiese [3] auf einen Ausschnitt, den das Modell nie
    // gesehen hat.
    const gross = 'x'.repeat(10_000)
    const { context, used } = buildContext([1, 2, 3, 4].map((n) => chunk(n, gross)))

    expect(context).toContain(`[${used.length}] (`)
    expect(context).not.toContain(`[${used.length + 1}] (`)
  })

  it('nimmt den ersten Ausschnitt auch dann, wenn er allein zu groß ist', () => {
    // Sonst käme bei einer einzigen sehr langen Passage gar kein Kontext
    // zustande, und das Modell antwortete „dazu steht nichts in den Quellen",
    // obwohl der Treffer vorliegt.
    const { used } = buildContext([chunk(1, 'x'.repeat(MAX_CONTEXT_CHARS * 2))])
    expect(used).toHaveLength(1)
  })

  it('liefert für keine Treffer einen leeren Kontext', () => {
    expect(buildContext([])).toEqual({ context: '', used: [] })
  })
})

describe('buildUserMessage', () => {
  it('stellt die Ausschnitte vor die Frage', () => {
    const nachricht = buildUserMessage('[1] (Quelle 1)\nInhalt', 'Wie war die Marge?')
    expect(nachricht.indexOf('Inhalt')).toBeLessThan(nachricht.indexOf('Wie war die Marge?'))
  })

  it('sagt bei leerem Kontext ausdrücklich, dass nichts gefunden wurde', () => {
    // Ohne diesen Satz beantwortet das Modell die Frage aus seinem
    // Allgemeinwissen — plausibel, unbelegt und falsch für dieses Produkt.
    const nachricht = buildUserMessage('', 'Wie war die Marge?')
    expect(nachricht).toContain('keine passenden')
    expect(nachricht).toContain('Wie war die Marge?')
  })
})
