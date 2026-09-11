import { describe, expect, it } from 'vitest'

import { formatDuration } from '../studio/format'

describe('formatDuration', () => {
  it('schreibt Sekunden unter zehn zweistellig', () => {
    // Ohne das liest sich `1:5` beim Überfliegen als „eine Minute fünfzig".
    expect(formatDuration(65)).toBe('1:05')
  })

  it('formatiert volle Minuten', () => {
    expect(formatDuration(120)).toBe('2:00')
  })

  it('kommt mit weniger als einer Minute zurecht', () => {
    expect(formatDuration(42)).toBe('0:42')
  })

  it('rundet Bruchteile und schützt vor negativen Werten', () => {
    // `durationSeconds` rechnet aus einer Dateigröße; ein unerwartet kleiner
    // Wert soll keine Anzeige wie `-1:-3` ergeben.
    expect(formatDuration(59.6)).toBe('1:00')
    expect(formatDuration(-5)).toBe('0:00')
  })
})
