import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { missingTokens, readTokenBlock, selectorPosition } from '../theme-tokens'

const GLOBALS = join(process.cwd(), 'src/app/globals.css')
const css = readFileSync(GLOBALS, 'utf8')

describe('readTokenBlock', () => {
  it('liest Custom Properties und ignoriert Kommentare mit Semikolon', () => {
    const block = readTokenBlock('.x { --a: red; /* Grund; mit Semikolon */ --b: blue; }', '.x')
    expect(block?.tokens.get('--a')).toBe('red')
    expect(block?.tokens.get('--b')).toBe('blue')
    expect(block?.tokens.size).toBe(2)
  })

  it('gibt null zurück, wenn der Block fehlt', () => {
    expect(readTokenBlock('.x { --a: red; }', '.y')).toBeNull()
  })
})

describe('Theme-Vertrag in globals.css', () => {
  const dark = readTokenBlock(css, ':root,\n.dark')
  const light = readTokenBlock(css, '.light {')

  it('beide Theme-Blöcke existieren', () => {
    expect(dark, 'Dark-Block (:root, .dark) nicht gefunden').not.toBeNull()
    expect(light, 'Light-Block (.light) nicht gefunden').not.toBeNull()
  })

  it('Light definiert jedes Token, das Dark definiert', () => {
    // Fehlt hier eines, erbt das Element im hellen Design still den dunklen
    // Wert — unsichtbarer Text statt einer Fehlermeldung.
    expect(missingTokens(dark!, light!)).toEqual([])
  })

  it('Dark definiert jedes Token, das Light definiert', () => {
    expect(missingTokens(light!, dark!)).toEqual([])
  })

  it('der Dark-Block steht vor dem Light-Block', () => {
    // Gleiche Spezifität (0,1,0) → die spätere Regel gewinnt. Andersherum
    // überstimmt :root jedes .light und der Umschalter wird wirkungslos.
    expect(selectorPosition(css, ':root,\n.dark')).toBeLessThan(selectorPosition(css, '.light {'))
  })
})
