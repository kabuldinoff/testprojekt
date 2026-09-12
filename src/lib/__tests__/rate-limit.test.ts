/**
 * Prüft die Grenzen — nicht, dass sie existieren, sondern dass sie zueinander
 * passen.
 *
 * Eine Zahl allein lässt sich nicht testen; „40" ist weder richtig noch
 * falsch. Was sich prüfen lässt, sind die Verhältnisse, die die Begründungen
 * in `limits.ts` behaupten — und genau die gehen beim nächsten Nachjustieren
 * verloren, wenn niemand sie festhält.
 */
import { describe, expect, it } from 'vitest'

import { GRENZEN, ZU_VIELE, type Bucket } from '../rate-limit/limits'

const TOEPFE = Object.keys(GRENZEN) as Bucket[]

describe('die Grenzen', () => {
  it('decken genau die drei teuren Vorgänge ab', () => {
    // Kommt ein vierter Anbieter-Aufruf dazu, soll dieser Test daran erinnern,
    // dass er einen Topf braucht.
    expect(TOEPFE.sort()).toEqual(['audio', 'chat', 'ingest'])
  })

  it.each(TOEPFE)('%s hat eine Grenze, ein Fenster und einen Text', (topf) => {
    const g = GRENZEN[topf]
    expect(g.limit).toBeGreaterThan(0)
    expect(g.window).toMatch(/^\d+ (second|minute|hour|day)s?$/)
    expect(g.message.length).toBeGreaterThan(20)
  })

  it('Audio ist der knappste Topf und zählt über den Tag', () => {
    // Die Begründung aus `limits.ts`: Das Tageskontingent der Sprachausgabe
    // zeigt sich erst als 429 vom Anbieter und ist dann bis Mitternacht weg.
    // Eine Stundengrenze schützte davor nicht — sechs pro Stunde wären
    // vierundzwanzigmal sechs am Tag.
    expect(GRENZEN.audio.window).toBe('24 hours')
    expect(GRENZEN.audio.limit).toBeLessThan(GRENZEN.chat.limit)
    expect(GRENZEN.audio.limit).toBeLessThan(GRENZEN.ingest.limit)
  })

  it('Quellen dürfen in Schüben kommen, Fragen nicht', () => {
    // Wer ein Projekt anlegt, wirft zehn Dateien auf einmal hinein; wer fragt,
    // fragt nacheinander. Deshalb liegt `ingest` pro Vorgang großzügiger.
    expect(GRENZEN.ingest.window).toBe(GRENZEN.chat.window)
  })
})

describe('die Meldungen', () => {
  it.each(TOEPFE)('%s verspricht keine Uhrzeit, die niemand einhalten kann', (topf) => {
    // „In 23 Minuten geht es weiter" wäre eine Zusage über einen Zeitpunkt,
    // den die Anwendung gar nicht kennt: Das Fenster beginnt beim ersten
    // Vorgang, und wann das war, steht nur in der Datenbank. Eine falsche
    // Zeitangabe ist ärgerlicher als gar keine.
    expect(GRENZEN[topf].message).not.toMatch(/\d+\s*(Minute|Sekunde|Stunde)/i)
  })

  it.each(TOEPFE)('%s klingt nicht nach einem Defekt', (topf) => {
    // Der Nutzer hat nichts falsch gemacht und nichts ist kaputt. Worte wie
    // „Fehler" oder „gesperrt" schicken ihn auf die Suche nach einer Ursache,
    // die es nicht gibt.
    expect(GRENZEN[topf].message).not.toMatch(/Fehler|gesperrt|blockiert|verboten/i)
  })

  it('nennt beim Audio-Topf den Ausweg, der bleibt', () => {
    // Ein Überblick, der schon erzeugt wurde, ist weiterhin lesbar. Das zu
    // sagen ist der Unterschied zwischen einer Grenze und einer Sackgasse.
    expect(GRENZEN.audio.message).toMatch(/Transkript/)
  })
})

describe('der Status', () => {
  it('ist 429 und nicht 403', () => {
    // 403 hieße „nie wieder", 429 heißt „jetzt nicht". Ein Client, der beides
    // unterscheidet — und jeder gut gebaute tut das —, versucht es nur im
    // zweiten Fall erneut.
    expect(ZU_VIELE).toBe(429)
  })
})
