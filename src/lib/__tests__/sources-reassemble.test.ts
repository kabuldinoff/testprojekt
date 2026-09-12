/**
 * Prüft das Zusammensetzen — und zwar gegen den echten Zerleger.
 *
 * Erfundene Abschnitte zu prüfen wäre wertlos: Die Funktion muss genau die
 * Abschnitte vertragen, die `chunkDocument` erzeugt, mit deren Überlappung,
 * deren Trennstellen und deren Trimmen. Deshalb läuft fast jeder Test hier
 * über beide Funktionen hintereinander und prüft eine Invariante, die für
 * jedes Paar gelten muss.
 */
import { describe, expect, it } from 'vitest'

import { chunkDocument, type Page } from '../sources/chunk'
import { assembleSource, overlapLength, type ChunkRow } from '../sources/reassemble'

/** Fließtext aus ganzen Sätzen, in der gewünschten Länge. */
function prose(chars: number, wort = 'Dienstleistungssegment'): string {
  const satz = `Die Marge im ${wort} stieg im dritten Quartal deutlich an. `
  return satz.repeat(Math.ceil(chars / satz.length)).slice(0, chars)
}

const page = (text: string, number: number | null = 1): Page => ({ number, text })

/** Der Weg, den die Daten in der Anwendung nehmen: Tabelle → Betrachter. */
const alsZeilen = (pages: Page[]): ChunkRow[] =>
  chunkDocument(pages).map((c) => ({
    chunkIndex: c.index,
    pageNumber: c.pageNumber,
    content: c.content,
    charStart: c.charStart,
    charEnd: c.charEnd
  }))

/** Leerraum ist beim Zusammensetzen nicht erhaltbar — Zeichen schon. */
const kern = (s: string) => s.replace(/\s+/g, '')

describe('overlapLength', () => {
  it('bestätigt die erwartete Länge am Text', () => {
    expect(overlapLength('Anfang und Mitte', 'und Mitte und Ende', 9)).toBe('und Mitte'.length)
  })

  it('zieht ab, was das Trimmen genommen hat', () => {
    // Im Original folgte auf das Ende ein Leerzeichen, das in beiden
    // Abschnitten weggetrimmt wurde. Erwartet werden 10 Zeichen, im Text
    // stehen 9 — die Funktion findet den kleineren Wert.
    expect(overlapLength('Anfang und Mitte', 'und Mitte und Ende', 10)).toBe(9)
  })

  it('meldet 0, wenn die Abschnitte gar nicht überlappen', () => {
    expect(overlapLength('Ende des Absatzes.', 'Beginn des nächsten.', 0)).toBe(0)
    expect(overlapLength('Ende des Absatzes.', 'Beginn des nächsten.', -12)).toBe(0)
  })

  it('lässt sich von wiederkehrendem Text nicht täuschen', () => {
    // Der Fall, an dem die erste Fassung gescheitert ist: Jedes Ende passt auf
    // jeden Anfang. Ohne die erwartete Länge gewänne der längstmögliche
    // Treffer und verschluckte den halben Abschnitt.
    const a = 'x'.repeat(1000)
    const b = 'x'.repeat(1000)
    expect(overlapLength(a, b, 200)).toBe(200)
  })
})

describe('assembleSource · gegen den echten Zerleger', () => {
  it('gibt kurzen Text unverändert zurück', () => {
    const text = prose(400)
    const [seite] = assembleSource(alsZeilen([page(text)]))
    expect(kern(seite!.text)).toBe(kern(text))
  })

  it('verliert und verdoppelt nichts — die eigentliche Zusicherung', () => {
    // Zerlegen und Zusammensetzen müssen sich aufheben. Genau hier würde eine
    // falsch berechnete Überlappung auffallen: zu wenig abgezogen heißt
    // doppelter Text, zu viel heißt fehlender.
    const text = prose(12_000)
    const zeilen = alsZeilen([page(text)])

    // Ohne diese Zeile prüfte der Test unter Umständen gar nichts: Bei einem
    // einzigen Abschnitt gibt es keine Überlappung, und die Zusicherung wäre
    // trivial erfüllt. Genau so ist der End-to-End-Test dieser Scheibe einmal
    // grün geblieben, während das Abziehen der Überlappung ausgebaut war.
    expect(zeilen.length, 'die Vorlage ergibt nur einen Abschnitt').toBeGreaterThan(5)

    expect(kern(assembleSource(zeilen)[0]!.text)).toBe(kern(text))
  })

  it('hält auch Text ohne jede Satzgrenze zusammen', () => {
    // Hier trennt der Zerleger an Wortgrenzen und teils gar nicht — die
    // Überlappung fällt anders aus als bei Fließtext.
    const text = 'x'.repeat(5000)
    const [seite] = assembleSource(alsZeilen([page(text)]))
    expect(kern(seite!.text)).toBe(kern(text))
  })

  it('verträgt eine wiederholte Kopfzeile, ohne Text zu verschlucken', () => {
    // Das Muster, an dem die reine Textsuche zerbrach: dieselbe Zeile auf
    // jeder Seite. Realistisch — Kopf- und Fußzeilen sehen in einem PDF genau
    // so aus.
    const kopf = 'Muster GmbH · Geschäftsbericht 2026 · vertraulich\n'
    const text = Array.from({ length: 8 }, (_, i) => kopf + prose(900, `Segment${i}`)).join('\n\n')
    const [seite] = assembleSource(alsZeilen([page(text)]))
    expect(kern(seite!.text)).toBe(kern(text))
  })

  it('verliert nichts an einer langen Leerraumstrecke', () => {
    // Der Befund aus dem Review, nachgestellt. Ein Satzende, dann 120
    // Leerzeichen — Tabellenlayout aus einem PDF sieht so aus. Liegt das im
    // Überlappungsfenster, betrug der abgeschnittene Leerraum 121 Zeichen.
    //
    // Vorher: Das Suchfenster von acht Zeichen greift nicht, der Rückfall zog
    // die volle erwartete Länge ab und **löschte hundert Zeichen** echten
    // Text. Lautlos — die Anzeige sah vollständig aus.
    const satz = 'Der Umsatz im Segment stieg deutlich an. '
    const text = satz.repeat(25) + ' '.repeat(120) + satz.repeat(60)

    const zeilen = alsZeilen([page(text)])
    expect(zeilen.length, 'ohne mehrere Abschnitte prüft der Test nichts').toBeGreaterThan(1)
    expect(kern(assembleSource(zeilen)[0]!.text)).toBe(kern(text))
  })

  it('verträgt Altbestand mit ungetrimmten Positionen — lieber doppelt als weg', () => {
    // Abschnitte, die vor `alsChunk` geschrieben wurden, tragen Positionen des
    // **Rohbereichs**. In Produktion liegen solche Zeilen; sie werden erst bei
    // einer Neuverarbeitung berichtigt.
    //
    // Die Zusicherung ist deshalb schwächer und trotzdem die richtige: Es darf
    // Text doppelt stehen, aber keiner fehlen. Doppelten sieht man, fehlenden
    // nicht.
    const satz = 'Der Umsatz im Segment stieg deutlich an. '
    const text = satz.repeat(25) + ' '.repeat(120) + satz.repeat(60)

    const alt = chunkDocument([page(text)]).map((c) => ({
      chunkIndex: c.index,
      pageNumber: c.pageNumber,
      content: c.content,
      // Rückwärts auf die alte, ungetrimmte Fassung: nach vorn bis zum
      // vorigen Ende, nach hinten bis zum nächsten sichtbaren Zeichen.
      charStart:
        c.charStart -
        (text.slice(0, c.charStart).length - text.slice(0, c.charStart).trimEnd().length),
      charEnd: c.charEnd + (text.slice(c.charEnd).length - text.slice(c.charEnd).trimStart().length)
    }))

    const zusammen = assembleSource(alt)[0]!.text
    for (const stueck of [satz.repeat(3), 'Der Umsatz im Segment stieg deutlich an.']) {
      expect(kern(zusammen)).toContain(kern(stueck))
    }
    expect(kern(zusammen).length, 'Text ist verlorengegangen').toBeGreaterThanOrEqual(
      kern(text).length
    )
  })

  it('kommt mit Absätzen zurecht, zwischen denen nicht überlappt wird', () => {
    // An einer Absatzgrenze beginnt der nächste Abschnitt hinter dem Umbruch:
    // Es gibt keine Überlappung, und der Trenner muss sie ersetzen. Ohne ihn
    // klebte das Ende des einen Absatzes am Anfang des nächsten.
    const text = [prose(1000), prose(1000, 'Kerngeschäft'), prose(1000)].join('\n\n')
    const [seite] = assembleSource(alsZeilen([page(text)]))
    expect(kern(seite!.text)).toBe(kern(text))
    expect(seite!.text).toContain('\n\n')
  })

  it('trennt Seiten und behält ihre Nummern', () => {
    const seiten = assembleSource(
      alsZeilen([
        page(prose(3000, 'Nordmarkt'), 1),
        page(prose(3000, 'Südmarkt'), 2),
        page(prose(3000, 'Westmarkt'), 3)
      ])
    )

    expect(seiten.map((s) => s.pageNumber)).toEqual([1, 2, 3])
    // Kein Wort der einen Seite darf auf einer anderen landen.
    expect(seiten[0]!.text).toContain('Nordmarkt')
    expect(seiten[0]!.text).not.toContain('Südmarkt')
    expect(seiten[1]!.text).not.toContain('Nordmarkt')
  })

  it('ergibt für eine Quelle ohne Seiten genau eine Seite mit null', () => {
    const seiten = assembleSource(alsZeilen([page(prose(4000), null)]))
    expect(seiten).toHaveLength(1)
    expect(seiten[0]!.pageNumber).toBeNull()
  })

  it('verträgt eine leere Quelle', () => {
    expect(assembleSource([])).toEqual([])
  })
})

describe('assembleSource · Fundstellen', () => {
  it('jede Fundstelle zeigt exakt auf ihren Abschnitt', () => {
    // Das ist die Zusicherung, auf der die Markierung beruht. Stimmte sie um
    // ein Zeichen nicht, markierte das Zitat eine um ein Zeichen verschobene
    // Stelle — und das fiele niemandem auf, weil es fast richtig aussieht.
    const zeilen = alsZeilen([page(prose(9000), 1), page(prose(9000, 'Auslandsgeschäft'), 2)])
    const inhalt = new Map(zeilen.map((z) => [z.chunkIndex, z.content]))

    for (const seite of assembleSource(zeilen)) {
      for (const span of seite.spans) {
        expect(
          seite.text.slice(span.von, span.bis),
          `Abschnitt ${span.chunkIndex} liegt nicht bei ${span.von}…${span.bis}`
        ).toBe(inhalt.get(span.chunkIndex))
      }
    }
  })

  it('führt jeden Abschnitt genau einmal auf', () => {
    const zeilen = alsZeilen([page(prose(8000))])
    const spans = assembleSource(zeilen).flatMap((s) => s.spans)
    expect(spans.map((s) => s.chunkIndex).sort((a, b) => a - b)).toEqual(
      zeilen.map((z) => z.chunkIndex)
    )
  })

  it('die Fundstellen laufen vorwärts und überschneiden sich wie die Abschnitte', () => {
    const spans = assembleSource(alsZeilen([page(prose(8000))]))[0]!.spans
    for (const s of spans) expect(s.bis).toBeGreaterThan(s.von)
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.von).toBeGreaterThan(spans[i - 1]!.von)
    }
  })

  it('verträgt Abschnitte in beliebiger Reihenfolge', () => {
    // PostgREST liefert ohne `order` keine garantierte Reihenfolge. Die
    // Funktion darf sich nicht darauf verlassen, dass der Aufrufer sortiert.
    const zeilen = alsZeilen([page(prose(6000))])
    const gemischt = [...zeilen].reverse()
    expect(assembleSource(gemischt)[0]!.text).toBe(assembleSource(zeilen)[0]!.text)
  })
})
