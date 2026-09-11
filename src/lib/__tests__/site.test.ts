/**
 * Prüft die Wahl der kanonischen Adresse.
 *
 * Sie entscheidet, welche Adresse in `sitemap.xml`, in den kanonischen Links
 * und im Vorschaubild steht. Ein Fehler hier ist unsichtbar, solange man die
 * eigene Seite benutzt — man sieht ihn erst in einem Suchergebnis oder wenn
 * jemand den Link woanders einfügt.
 */
import { describe, expect, it } from 'vitest'

import { pickSiteUrl } from '../site'

describe('pickSiteUrl', () => {
  it('nimmt die eigene Festlegung, wenn es eine gibt', () => {
    // Sie gewinnt, weil sie als einzige eine eigene Domain kennen kann.
    expect(pickSiteUrl('https://notabene.example', 'projekt.vercel.app')).toBe(
      'https://notabene.example'
    )
  })

  it('nimmt sonst die Produktionsadresse von Vercel und ergänzt das Schema', () => {
    // Vercel liefert nur den Host, ohne https://.
    expect(pickSiteUrl(undefined, 'projekt.vercel.app')).toBe('https://projekt.vercel.app')
  })

  it('fällt zuletzt auf localhost zurück', () => {
    expect(pickSiteUrl()).toBe('http://localhost:3000')
  })

  it('behandelt leere und aus Leerraum bestehende Werte wie nicht gesetzt', () => {
    // Eine im Dashboard angelegte, aber leer gelassene Variable kommt als ''
    // an. Ohne diese Prüfung stünde in der Sitemap eine leere Adresse.
    expect(pickSiteUrl('', 'projekt.vercel.app')).toBe('https://projekt.vercel.app')
    expect(pickSiteUrl('   ', '')).toBe('http://localhost:3000')
  })

  it('entfernt den abschließenden Schrägstrich', () => {
    // Die Adresse wird mit Pfaden zusammengesetzt, und
    // `https://example.test//sitemap.xml` ist für einen Crawler eine andere
    // Adresse als die mit einem Schrägstrich.
    expect(pickSiteUrl('https://notabene.example/')).toBe('https://notabene.example')
    expect(pickSiteUrl('https://notabene.example///')).toBe('https://notabene.example')
    expect(pickSiteUrl(undefined, 'projekt.vercel.app/')).toBe('https://projekt.vercel.app')
  })
})
