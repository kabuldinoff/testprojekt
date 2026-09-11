/**
 * Prüft die eine Entscheidung der Suche, die ohne Datenbank fällt.
 *
 * Alles andere in `retrieve.ts` ist ein Aufruf nach draußen und gehört in
 * die End-to-End-Suite. Diese Bedingung nicht: sie entscheidet, ob überhaupt
 * ein Anbieter angefasst wird.
 */
import { describe, expect, it } from 'vitest'

import { selectsNothing } from '../chat/retrieve'

describe('selectsNothing', () => {
  it('null heißt „alle Quellen" und trifft etwas', () => {
    expect(selectsNothing(null)).toBe(false)
  })

  it('ein leeres Array heißt „keine" und kann nichts treffen', () => {
    // Der Unterschied zwischen null und [] trägt die ganze Funktion: hat der
    // Nutzer alle Quellen abgewählt, darf die Antwort nicht heimlich doch auf
    // allen beruhen — und die Frage muss dafür gar nicht erst eingebettet
    // werden.
    expect(selectsNothing([])).toBe(true)
  })

  it('eine ausgewählte Quelle trifft etwas', () => {
    expect(selectsNothing(['11111111-1111-1111-1111-111111111111'])).toBe(false)
  })
})
