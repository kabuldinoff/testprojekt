/**
 * Prüft die Skriptprüfung.
 *
 * Sie ist die Stelle, an der ein stiller Fehler abgefangen wird: Ein Skript
 * mit falschen Sprecherpräfixen erzeugt keine Fehlermeldung, sondern eine
 * Audiodatei, in der jemand „Alex Doppelpunkt" vorliest. Das fällt erst beim
 * Anhören auf — nach dem teuersten Schritt der Kette.
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_CONTEXT_CHARS,
  MAX_SCRIPT_CHARS,
  SPEAKERS,
  buildSourceDigest,
  checkScript,
  parseScript,
  scriptPrompt
} from '../studio/script'

const GUT =
  'Alex: Die Marge stieg deutlich.\nSam: Um wie viel genau?\nAlex: Von 18,2 auf 21,4 Prozent.'

describe('checkScript · was durchgeht', () => {
  it('nimmt ein sauberes Gespräch an', () => {
    const r = checkScript(GUT)
    expect(r.ok).toBe(true)
    expect(r.script).toBe(GUT)
    expect(r.seconds).toBeGreaterThan(0)
  })

  it('entfernt Fettdruck um den Sprechernamen', () => {
    // Modelle liefern das häufig, obwohl die Anweisung es verbietet. Darauf
    // zu vertrauen hieße, das Ergebnis vom Wohlwollen eines Textgenerators
    // abhängig zu machen.
    const r = checkScript('**Alex:** Die Marge stieg.\n**Sam:** Gut.')
    expect(r.ok).toBe(true)
    expect(r.script).toBe('Alex: Die Marge stieg.\nSam: Gut.')
  })

  it('entfernt Regieanweisungen', () => {
    // „(lacht)" würde sonst vorgelesen.
    const r = checkScript('Alex: Die Marge stieg. (lacht)\nSam: [Pause] Erstaunlich.')
    expect(r.script).toBe('Alex: Die Marge stieg.\nSam: Erstaunlich.')
  })

  it('lässt Angaben in Klammern stehen', () => {
    // Der wichtigere Fall. Eine zu großzügige Regel löschte Jahreszahlen,
    // Prozentangaben und Verweise aus den Quellen — ein Überblick, dem still
    // die Zahlen fehlen, ist schlimmer als einer, in dem einmal „lacht"
    // vorgelesen wird.
    const eingabe =
      'Alex: Im Berichtsjahr (2026) stieg sie um 3,2 Punkte (21,4 Prozent).\n' +
      'Sam: Und laut Anhang (vgl. Seite 9) bleibt das so.'
    expect(checkScript(eingabe).script).toBe(eingabe)
  })

  it('entfernt Code-Zäune und Leerzeilen', () => {
    const r = checkScript('```\nAlex: Eins.\n\n\nSam: Zwei.\n```')
    expect(r.ok).toBe(true)
    expect(r.script).toBe('Alex: Eins.\nSam: Zwei.')
  })
})

describe('checkScript · was abgewiesen wird', () => {
  it('lehnt einen fremden Sprechernamen ab', () => {
    // Der Fehler, um den es geht: „Moderator:" wird von der Sprachausgabe
    // nicht als Sprecher erkannt, sondern vorgelesen.
    const r = checkScript('Moderator: Guten Tag.\nSam: Hallo.')
    expect(r.ok).toBe(false)
    expect(r.problem).toBe('zeile-ohne-sprecher')
  })

  it('lehnt eine Zeile ohne Präfix ab', () => {
    const r = checkScript('Alex: Eins.\nEinfach so weiter.\nSam: Zwei.')
    expect(r.problem).toBe('zeile-ohne-sprecher')
  })

  it('lehnt eine Überschrift ab', () => {
    const r = checkScript('# Zusammenfassung\nAlex: Eins.\nSam: Zwei.')
    expect(r.problem).toBe('zeile-ohne-sprecher')
  })

  it('lehnt einen Monolog ab', () => {
    // Ein Gespräch mit einer Stimme ist ein Vortrag — und die zweite Stimme
    // ist der Grund für dieses Format.
    expect(checkScript('Alex: Eins.\nAlex: Zwei.').problem).toBe('nur-ein-sprecher')
  })

  it('lehnt ein leeres Skript ab', () => {
    expect(checkScript('   \n\n  ').problem).toBe('leer')
    // Eine Zeile, die nur aus einer Regieanweisung besteht, bleibt nach dem
    // Aufräumen leer und fällt weg.
    expect(checkScript('(lacht)').problem).toBe('leer')
  })

  it('behandelt eine Klammer mit mehreren Wörtern als Text, nicht als Anweisung', () => {
    // Sie wird nicht entfernt — und fällt dann zu Recht durch die Formprüfung,
    // statt still zu verschwinden. Lieber eine Meldung als ein Skript, aus dem
    // unbemerkt etwas herausgefallen ist.
    expect(checkScript('(nur eine Regieanweisung)').problem).toBe('zeile-ohne-sprecher')
  })

  it('lehnt ein zu langes Skript ab', () => {
    const lang = Array.from(
      { length: 200 },
      (_, i) => `${SPEAKERS[i % 2]}: ${'Wort '.repeat(10)}`
    ).join('\n')
    expect(lang.length).toBeGreaterThan(MAX_SCRIPT_CHARS)
    expect(checkScript(lang).problem).toBe('zu-lang')
  })

  it('lehnt einen Sprechernamen ohne Leerzeichen danach ab', () => {
    // „Alex:Text" ordnet die Sprachausgabe nicht zu.
    expect(checkScript('Alex:Eins.\nSam: Zwei.').problem).toBe('zeile-ohne-sprecher')
  })
})

describe('buildSourceDigest', () => {
  it('nennt jede Quelle mit Titel', () => {
    const d = buildSourceDigest([
      { title: 'Bericht', excerpts: ['Eins.'] },
      { title: 'Notiz', excerpts: ['Zwei.'] }
    ])
    expect(d).toContain('## Bericht')
    expect(d).toContain('## Notiz')
  })

  it('verteilt das Budget gleichmäßig auf die Quellen', () => {
    // Der Fall, um den es geht: ein sehr großes Dokument neben kleinen. Alles
    // aneinanderzuhängen und hinten abzuschneiden ergäbe einen Überblick, der
    // die kleinen Quellen nie erwähnt — und niemand sähe warum.
    const gross = { title: 'Groß', excerpts: [Array(50).fill('x'.repeat(1000)).join('')] }
    const klein = { title: 'Klein', excerpts: ['Die entscheidende Zahl ist 21,4 Prozent.'] }
    const d = buildSourceDigest([gross, klein])

    expect(d).toContain('Die entscheidende Zahl ist 21,4 Prozent.')
    expect(d.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS + 100)
  })

  it('nimmt eine Quelle auf, deren erster Ausschnitt allein zu groß ist', () => {
    // Sonst käme sie gar nicht vor, obwohl sie ausgewählt wurde.
    const d = buildSourceDigest([
      { title: 'Riesig', excerpts: ['y'.repeat(MAX_CONTEXT_CHARS * 2)] }
    ])
    expect(d).toContain('## Riesig')
    expect(d.length).toBeGreaterThan(1000)
  })

  it('füllt den Rest des Budgets, statt einen zu großen Ausschnitt zu verwerfen', () => {
    // Der Fall aus dem Review: ein kurzer Ausschnitt, dann ein sehr langer.
    // Die erste Fassung brach nach dem kurzen ab, und die Quelle bekam einen
    // Bruchteil ihres Anteils, während andere ihren vollen behielten.
    const d = buildSourceDigest([
      { title: 'Gemischt', excerpts: ['Kurz.', 'z'.repeat(MAX_CONTEXT_CHARS * 2)] }
    ])
    expect(d).toContain('Kurz.')
    // Der lange Ausschnitt ist angeschnitten vertreten, nicht verworfen.
    expect(d.length).toBeGreaterThan(MAX_CONTEXT_CHARS / 2)
    expect(d.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS + 100)
  })

  it('liefert für keine Quellen einen leeren Text', () => {
    expect(buildSourceDigest([])).toBe('')
  })
})

describe('scriptPrompt', () => {
  it('nennt beide Sprechernamen wörtlich', () => {
    // Sie müssen zeichengenau denen im TTS-Aufruf entsprechen. Käme hier ein
    // anderer Name vor, läse das Modell ihn vor, statt die Zeile zuzuordnen.
    const p = scriptPrompt('Quelltext')
    for (const s of SPEAKERS) expect(p).toContain(`"${s}:"`)
  })

  it('enthält den Quelltext', () => {
    expect(scriptPrompt('Die Marge stieg.')).toContain('Die Marge stieg.')
  })
})

describe('parseScript', () => {
  it('zerlegt in Sprecher und Text', () => {
    expect(parseScript(GUT)).toEqual([
      { speaker: 'Alex', text: 'Die Marge stieg deutlich.' },
      { speaker: 'Sam', text: 'Um wie viel genau?' },
      { speaker: 'Alex', text: 'Von 18,2 auf 21,4 Prozent.' }
    ])
  })

  it('überspringt, was keine Sprecherzeile ist', () => {
    expect(parseScript('Alex: Eins.\nMüll\nSam: Zwei.')).toHaveLength(2)
  })
})
