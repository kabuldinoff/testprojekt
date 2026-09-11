/**
 * Prüft die Regeln für Notizen und die Titelfindung.
 *
 * Der Titelvorschlag ist die Stelle, an der es unangenehm werden kann: er
 * entsteht aus Modelltext, also aus Eingaben, über die niemand Kontrolle hat.
 */
import { describe, expect, it } from 'vitest'

import { NOTE_CONTENT_MAX, NOTE_TITLE_MAX, noteInput, titleFromAnswer } from '../notes/schema'

describe('noteInput', () => {
  it('nimmt eine gewöhnliche Notiz an', () => {
    const r = noteInput.safeParse({ title: 'Marge Q3', content: 'Stieg auf 21,4 Prozent.' })
    expect(r.success).toBe(true)
  })

  it('lehnt einen Titel aus lauter Leerraum ab', () => {
    // `.trim()` läuft vor `.min(1)`, sonst wäre "   " ein gültiger Titel.
    expect(noteInput.safeParse({ title: '   ', content: 'Text' }).success).toBe(false)
  })

  it('lehnt leeren Inhalt ab', () => {
    expect(noteInput.safeParse({ title: 'Titel', content: '  ' }).success).toBe(false)
  })

  it('hält dieselben Grenzen wie die Migration', () => {
    expect(noteInput.safeParse({ title: 'x'.repeat(NOTE_TITLE_MAX), content: 'y' }).success).toBe(
      true
    )
    expect(
      noteInput.safeParse({ title: 'x'.repeat(NOTE_TITLE_MAX + 1), content: 'y' }).success
    ).toBe(false)
    expect(
      noteInput.safeParse({ title: 'x', content: 'y'.repeat(NOTE_CONTENT_MAX + 1) }).success
    ).toBe(false)
  })
})

describe('titleFromAnswer', () => {
  it('nimmt den ersten Satz', () => {
    expect(titleFromAnswer('Die Marge stieg auf 21,4 Prozent. Der Rest folgt.')).toBe(
      'Die Marge stieg auf 21,4 Prozent'
    )
  })

  it('entfernt die Belege', () => {
    // „[1]" in einer Überschrift ist Lärm — und ohne die zugehörige Nachricht
    // zeigt die Zahl ohnehin ins Leere.
    expect(titleFromAnswer('Die Marge stieg [1][2]. Mehr dazu.')).toBe('Die Marge stieg')
  })

  it('nimmt die erste Zeile, wenn sie vor dem ersten Satzende endet', () => {
    expect(titleFromAnswer('Kernpunkte\nDie Marge stieg.')).toBe('Kernpunkte')
  })

  it('kürzt an einer Wortgrenze statt mitten im Wort', () => {
    const lang = 'Wort '.repeat(80)
    const titel = titleFromAnswer(lang)
    expect(titel.length).toBeLessThanOrEqual(NOTE_TITLE_MAX)
    expect(titel.endsWith('…')).toBe(true)
    // Ein abgeschnittenes Wort in einer Überschrift sieht nach einem Fehler aus.
    expect(titel).not.toMatch(/Wo…$|Wor…$/)
  })

  it('fällt bei einer Antwort ohne brauchbaren Text auf einen festen Titel zurück', () => {
    // Eine Antwort, die nur aus Belegen besteht, sollte es nicht geben — aber
    // eine Notiz ohne Titel verletzt den CHECK und ließe das Speichern
    // scheitern, was der Nutzer als kaputten Knopf erlebt.
    expect(titleFromAnswer('[1][2]')).toBe('Notiz aus dem Chat')
    expect(titleFromAnswer('   ')).toBe('Notiz aus dem Chat')
  })

  it('kommt mit einem einzigen langen Wort zurecht', () => {
    const titel = titleFromAnswer('x'.repeat(500))
    expect(titel.length).toBeLessThanOrEqual(NOTE_TITLE_MAX)
  })
})
