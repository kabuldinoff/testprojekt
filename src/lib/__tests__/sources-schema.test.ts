/**
 * Die reinen Entscheidungen rund um neue Quellen.
 *
 * Beide Funktionen hier standen ursprünglich woanders — die eine im
 * Route Handler, die andere gar nicht. Sie sind der Teil, der sich ohne
 * Datenbank und ohne Browser entscheiden lässt, und deshalb der Teil, der
 * Tests bekommt.
 */
import { describe, expect, it } from 'vitest'

import { classifyFile, kindFromMime, sourceInsertMessage } from '../sources/schema'

describe('kindFromMime', () => {
  it.each([
    ['application/pdf', 'pdf'],
    ['text/plain', 'text'],
    ['text/markdown', 'markdown'],
    // Der Browser hängt gern eine Kodierung an.
    ['text/plain; charset=utf-8', 'text'],
    ['TEXT/PLAIN', 'text']
  ])('%s → %s', (mime, kind) => {
    expect(kindFromMime(mime)).toBe(kind)
  })

  it.each(['application/zip', 'image/png', '', 'text/html'])('lehnt %o ab', (mime) => {
    expect(kindFromMime(mime)).toBeNull()
  })
})

describe('classifyFile', () => {
  it('nimmt den gemeldeten Typ, wenn es einen gibt', () => {
    expect(classifyFile('bericht.pdf', 'application/pdf')).toEqual({
      kind: 'pdf',
      mime: 'application/pdf'
    })
  })

  it.each([
    ['notizen.md', 'markdown', 'text/markdown'],
    ['notizen.markdown', 'markdown', 'text/markdown'],
    ['bericht.txt', 'text', 'text/plain'],
    ['bericht.pdf', 'pdf', 'application/pdf']
  ])('fällt bei leerem Typ auf die Endung zurück: %s', (name, kind, mime) => {
    // Browser liefern für .md und je nach System auch für .txt eine leere
    // Zeichenkette. Ohne Rückfallebene lehnte der Upload genau die
    // Textdateien ab, für die er gedacht ist.
    expect(classifyFile(name, '')).toEqual({ kind, mime })
  })

  it('liefert immer einen MIME-Typ, den der Bucket akzeptiert', () => {
    // Der Bucket prüft gegen allowed_mime_types. Eine Datei mit leerem Typ
    // muss also mit einem kanonischen Typ neu verpackt werden, sonst weist
    // Storage sie zurück.
    const erlaubt = ['application/pdf', 'text/plain', 'text/markdown']
    for (const name of ['a.pdf', 'b.txt', 'c.md', 'd.markdown']) {
      expect(erlaubt).toContain(classifyFile(name, '')!.mime)
    }
  })

  it.each(['archiv.zip', 'bild.png', 'ohne-endung', 'a.PDF.exe'])('lehnt %o ab', (name) => {
    expect(classifyFile(name, '')).toBeNull()
  })

  it('die Endung entscheidet nicht über den Parser', () => {
    // Eine umbenannte Datei bekommt zwar `kind: 'pdf'`, aber der Parser
    // scheitert dann an ihrem Inhalt und meldet das. Die Endung ist eine
    // Vermutung über den Typ, keine Umgehung der Prüfung.
    expect(classifyFile('eigentlich-ein-bild.pdf', '')).toEqual({
      kind: 'pdf',
      mime: 'application/pdf'
    })
  })
})

describe('sourceInsertMessage', () => {
  it('übersetzt die Mengenbegrenzung in einen Satz', () => {
    // Die Grenze steht als Trigger in der Migration, damit sie auch für
    // Zugriffe an der Anwendung vorbei gilt — der Preis ist, dass sie als
    // Postgres-Fehler ankommt.
    expect(sourceInsertMessage({ message: 'Ein Notebook fasst höchstens 20 Quellen.' })).toContain(
      'höchstens 20 Quellen'
    )
  })

  it('gibt für alles andere eine allgemeine Meldung', () => {
    // Datenbankfehler werden nicht durchgereicht: sie sind für Nutzer
    // unlesbar und verraten Interna.
    expect(sourceInsertMessage({ message: 'duplicate key value violates unique constraint' })).toBe(
      'Die Quelle konnte nicht angelegt werden.'
    )
    expect(sourceInsertMessage(null)).toBe('Die Quelle konnte nicht angelegt werden.')
  })
})
