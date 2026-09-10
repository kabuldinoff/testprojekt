/**
 * Der Zustandsautomat aus Sicht der Oberfläche.
 *
 * Klein, aber tragend: `settled` entscheidet, ob weiter abgefragt wird. Eine
 * falsche Antwort hier führt entweder zu einem Ladebalken, der nie aufhört,
 * oder zu einer Quelle, die stumm auf „wartet" stehen bleibt.
 */
import { describe, expect, it } from 'vitest'

import { anyPending, needsTrigger, statusView } from '../sources/status'

describe('statusView', () => {
  it.each([
    ['pending', 'Wartet', false],
    ['processing', 'Wird verarbeitet', false],
    ['ready', 'Bereit', true],
    ['failed', 'Fehlgeschlagen', true]
  ])('%s', (status, label, settled) => {
    expect(statusView(status).label).toBe(label)
    expect(statusView(status).settled).toBe(settled)
  })

  it('ein unbekannter Zustand gilt als Fehler, nicht als Warten', () => {
    // Als „wartet" dargestellt liefe die Abfrage endlos gegen einen Zustand,
    // der sich nie ändert.
    const v = statusView('quatsch')
    expect(v.tone).toBe('err')
    expect(v.settled).toBe(true)
  })
})

describe('anyPending', () => {
  it('fragt weiter ab, solange etwas offen ist', () => {
    expect(anyPending(['ready', 'pending'])).toBe(true)
    expect(anyPending(['ready', 'processing'])).toBe(true)
  })

  it('hört auf, wenn alles entschieden ist', () => {
    expect(anyPending(['ready', 'failed'])).toBe(false)
    expect(anyPending([])).toBe(false)
  })
})

describe('needsTrigger', () => {
  it('nur pending wird angestoßen', () => {
    // `processing` läuft bereits — ein zweiter Anstoß würde am Lease scheitern,
    // aber jeder Aufruf kostet trotzdem eine Function-Ausführung.
    expect(needsTrigger('pending')).toBe(true)
    expect(needsTrigger('processing')).toBe(false)
    expect(needsTrigger('ready')).toBe(false)
    expect(needsTrigger('failed')).toBe(false)
  })
})
