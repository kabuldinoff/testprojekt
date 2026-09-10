/**
 * Hält die Eingaberegeln mit der Datenbank im Gleichschritt.
 *
 * Die Grenzen in `schema.ts` spiegeln CHECK-Constraints auf `notebooks`. Läuft
 * eines von beiden weg, äußert sich das nicht als Validierungsfehler, sondern
 * als abgelehnte Zeile aus Postgres — mit einer Meldung, die kein Nutzer
 * versteht. Der interessanteste Fall ist die Emoji-Länge: Postgres zählt Code
 * Points, JavaScript zählt UTF-16-Einheiten, und bei Emoji gehen die
 * auseinander.
 */
import { describe, expect, it } from 'vitest'

import {
  DESCRIPTION_MAX,
  EMOJI_MAX,
  TITLE_MAX,
  firstIssue,
  parseNotebookForm
} from '../notebooks/schema'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('parseNotebookForm', () => {
  it('nimmt einen Titel und macht aus leeren Feldern undefined', () => {
    const r = parseNotebookForm(form({ title: 'Quartalsanalyse', description: '', emoji: '' }))
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.title).toBe('Quartalsanalyse')
    // Nicht '' — eine leere Zeichenkette sähe in der Datenbank wie eine
    // gesetzte Beschreibung aus und erzeugte im UI eine leere Zeile.
    expect(r.data.description).toBeUndefined()
    expect(r.data.emoji).toBeUndefined()
  })

  it('schneidet Leerraum ab, bevor es prüft', () => {
    const r = parseNotebookForm(form({ title: '   Analyse   ' }))
    expect(r.success && r.data.title).toBe('Analyse')
  })

  it('lehnt einen Titel aus reinem Leerraum ab', () => {
    // Ohne trim vor der Längenprüfung wäre '   ' ein gültiger Titel und das
    // Notebook in der Übersicht namenlos.
    const r = parseNotebookForm(form({ title: '   ' }))
    expect(r.success).toBe(false)
    if (r.success) return
    expect(firstIssue(r.error)).toBe('Bitte einen Titel angeben.')
  })

  it('lehnt einen fehlenden Titel ab', () => {
    expect(parseNotebookForm(form({})).success).toBe(false)
  })

  it('hält die Obergrenzen ein, die auch in der Migration stehen', () => {
    expect(parseNotebookForm(form({ title: 'x'.repeat(TITLE_MAX) })).success).toBe(true)
    expect(parseNotebookForm(form({ title: 'x'.repeat(TITLE_MAX + 1) })).success).toBe(false)

    const langeBeschreibung = { title: 'ok', description: 'x'.repeat(DESCRIPTION_MAX + 1) }
    expect(parseNotebookForm(form(langeBeschreibung)).success).toBe(false)

    expect(parseNotebookForm(form({ title: 'ok', emoji: 'x'.repeat(EMOJI_MAX + 1) })).success).toBe(
      false
    )
  })

  it.each([
    ['einfach', '📊'],
    ['ZWJ-Sequenz', '👩‍🔬'],
    // 14 UTF-16-Einheiten, aber nur 7 Code Points. Mit `.max(8)` auf `.length`
    // wäre dieses Emoji abgelehnt worden, obwohl die Spalte es akzeptiert —
    // die Prüfung wäre strenger gewesen als die Datenbank.
    ['Flagge aus Tag-Sequenz', '🏴󠁧󠁢󠁳󠁣󠁴󠁿']
  ])('nimmt %s', (_name, emoji) => {
    const r = parseNotebookForm(form({ title: 'ok', emoji }))
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.emoji).toBe(emoji)
  })

  it('zählt Code Points wie Postgres, nicht UTF-16-Einheiten', () => {
    // Aus der Konstante abgeleitet, nicht abgeschrieben: sonst prüft der Test
    // nach einer Änderung von EMOJI_MAX weiter die alte Grenze.
    expect(
      parseNotebookForm(form({ title: 'ok', emoji: '📊'.repeat(EMOJI_MAX + 1) })).success
    ).toBe(false)
    expect(parseNotebookForm(form({ title: 'ok', emoji: '📊'.repeat(EMOJI_MAX) })).success).toBe(
      true
    )
  })
})
