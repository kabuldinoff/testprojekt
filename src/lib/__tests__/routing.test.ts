import { describe, expect, it } from 'vitest'

import { isProtectedPath, safeReturnPath } from '../routing'

describe('safeReturnPath', () => {
  it('lässt interne Pfade durch', () => {
    expect(safeReturnPath('/app')).toBe('/app')
    expect(safeReturnPath('/app/notebooks/1')).toBe('/app/notebooks/1')
    expect(safeReturnPath('/app?tab=quellen')).toBe('/app?tab=quellen')
  })

  it('blockt protokollrelative URLs', () => {
    expect(safeReturnPath('//evil.example')).toBe('/app')
  })

  it('blockt Backslash-Ziele', () => {
    // Der Fall, der die erste Fassung durchgelassen hat: ein einzelner
    // Schrägstrich, dann ein Backslash. Browser normalisieren ihn zu einem
    // Schrägstrich, und daraus wird //evil.example.
    expect(safeReturnPath('/\\evil.example')).toBe('/app')
    expect(safeReturnPath('/app\\..\\evil')).toBe('/app')
  })

  it('blockt absolute URLs und alles ohne führenden Schrägstrich', () => {
    expect(safeReturnPath('https://evil.example')).toBe('/app')
    expect(safeReturnPath('app')).toBe('/app')
    expect(safeReturnPath('')).toBe('/app')
  })

  it('blockt Nicht-Zeichenketten', () => {
    expect(safeReturnPath(null)).toBe('/app')
    expect(safeReturnPath(undefined)).toBe('/app')
    expect(safeReturnPath(42)).toBe('/app')
  })

  it('das geblockte Ziel löst nie auf eine fremde Herkunft auf', () => {
    // Die eigentliche Zusicherung, unabhängig von der Implementierung.
    const angriffe = [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      '\\\\evil.example'
    ]
    for (const angriff of angriffe) {
      const ziel = new URL(safeReturnPath(angriff), 'https://notabene.test')
      expect(ziel.origin, `${angriff} entkam`).toBe('https://notabene.test')
    }
  })
})

describe('isProtectedPath', () => {
  it('trifft den Bereich selbst und alles darunter', () => {
    expect(isProtectedPath('/app')).toBe(true)
    expect(isProtectedPath('/app/')).toBe(true)
    expect(isProtectedPath('/app/notebooks')).toBe(true)
  })

  it('trifft NICHT, was nur mit denselben Zeichen anfängt', () => {
    // Sonst würde eine öffentliche Seite wie /appartement unangemeldete
    // Besucher grundlos zur Anmeldung schicken.
    expect(isProtectedPath('/appartement')).toBe(false)
    expect(isProtectedPath('/app-preview')).toBe(false)
    expect(isProtectedPath('/apps')).toBe(false)
  })

  it('trifft nicht bei öffentlichen Pfaden', () => {
    expect(isProtectedPath('/')).toBe(false)
    expect(isProtectedPath('/anmelden')).toBe(false)
  })
})
