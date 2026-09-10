/**
 * Prüft den SSRF-Schutz.
 *
 * Diese Funktion entscheidet, ob der Server eine vom Nutzer angegebene Adresse
 * abruft. Fällt sie falsch aus, wird der URL-Import zum Fernrohr ins interne
 * Netz — und die Antwort landet sichtbar als „Quelle" im Notebook.
 *
 * Deshalb sind die Tests nach Angriffsform geordnet und nicht nach Codezeile:
 * jede Zeile hier steht für einen Weg, an der Prüfung vorbeizukommen.
 */
import { describe, expect, it } from 'vitest'

import { checkExternalUrl, isPrivateAddress } from '../sources/url-safety'

describe('checkExternalUrl · was durchgehen soll', () => {
  it.each([
    'https://beispiel.de/artikel',
    'http://beispiel.de',
    'https://sub.beispiel.co.uk/a/b?c=d#e',
    'https://beispiel.de:8443/pfad',
    // Öffentliche IP-Adressen sind erlaubt — die Sperre gilt privaten Bereichen.
    'https://8.8.8.8/',
    'https://93.184.216.34/'
  ])('%s', (url) => {
    const r = checkExternalUrl(url)
    expect(r.ok, `${url} wurde abgelehnt: ${r.reason}`).toBe(true)
    expect(r.url).toBeTruthy()
  })

  it('gibt die normalisierte Adresse zurück, nicht die Rohfassung', () => {
    // Der Aufrufer soll genau das abrufen, was geprüft wurde. Zwischen Prüfung
    // und Abruf noch einmal zu parsen wäre eine Gelegenheit für Abweichungen.
    expect(checkExternalUrl('  https://beispiel.de  ').url).toBe('https://beispiel.de/')
  })
})

describe('checkExternalUrl · Loopback und lokales Netz', () => {
  it.each([
    ['localhost', 'http://localhost:3000/'],
    ['localhost mit Subdomain', 'http://api.localhost/'],
    ['127.0.0.1', 'http://127.0.0.1:54421/rest/v1/'],
    ['anderes 127er', 'http://127.42.7.9/'],
    ['0.0.0.0', 'http://0.0.0.0/'],
    ['IPv6 Loopback', 'http://[::1]:3000/'],
    ['IPv6 unspezifiziert', 'http://[::]/'],
    ['IPv4 in IPv6, Punktform', 'http://[::ffff:127.0.0.1]/'],
    // Node normalisiert die Punktform in Hextets — beide Schreibweisen
    // müssen greifen, sonst prüft man eine Form, die nie ankommt.
    ['IPv4 in IPv6, Hextets', 'http://[::ffff:7f00:1]/'],
    ['IPv4 in IPv6, privates Netz', 'http://[::ffff:a00:1]/'],
    ['.local', 'http://drucker.local/'],
    ['.internal', 'http://datenbank.internal/'],
    ['.home.arpa', 'http://nas.home.arpa/']
  ])('%s wird abgelehnt', (_name, url) => {
    const r = checkExternalUrl(url)
    expect(r.ok, `${url} kam durch`).toBe(false)
    expect(r.reason).toBe('private-adresse')
  })
})

describe('checkExternalUrl · private Netze und Cloud-Metadaten', () => {
  it.each([
    ['10er-Netz', 'http://10.0.0.5/'],
    ['172.16-31', 'http://172.20.1.1/'],
    ['172.31 Randfall', 'http://172.31.255.255/'],
    ['192.168', 'http://192.168.1.1/'],
    ['Carrier-Grade NAT', 'http://100.64.0.1/'],
    ['IPv6 unique local (fd)', 'http://[fd00::1]/'],
    ['IPv6 link-local', 'http://[fe80::1]/'],
    // Der bekannteste SSRF-Fall überhaupt: der Metadatendienst liefert
    // Zugangsdaten der Ausführungsumgebung.
    ['Cloud-Metadaten über IP', 'http://169.254.169.254/latest/meta-data/'],
    ['Cloud-Metadaten über Namen', 'http://metadata.google.internal/']
  ])('%s wird abgelehnt', (_name, url) => {
    expect(checkExternalUrl(url).ok, `${url} kam durch`).toBe(false)
  })

  it('172.15 und 172.32 sind öffentlich und bleiben erlaubt', () => {
    // Die Grenzen des privaten Bereichs sind 172.16–172.31. Ein zu grober
    // Filter auf „172." würde legitime Adressen sperren.
    expect(checkExternalUrl('http://172.15.0.1/').ok).toBe(true)
    expect(checkExternalUrl('http://172.32.0.1/').ok).toBe(true)
  })
})

describe('checkExternalUrl · andere Schemata und Formen', () => {
  it.each([
    ['file', 'file:///etc/passwd'],
    ['ftp', 'ftp://beispiel.de/'],
    ['gopher', 'gopher://beispiel.de/'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,<h1>x</h1>']
  ])('%s wird abgelehnt', (_name, url) => {
    const r = checkExternalUrl(url)
    expect(r.ok, `${url} kam durch`).toBe(false)
  })

  it('lehnt eingebettete Zugangsdaten ab', () => {
    // Sonst wäre der Import ein Weg, Zugangsdaten aus dem Server heraus an
    // eine beliebige Stelle zu schicken.
    const r = checkExternalUrl('http://nutzer:geheim@beispiel.de/')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('zugangsdaten-im-link')
  })

  it.each(['', '   ', 'beispiel.de', 'https://', 'kein link'])(
    'lehnt %o als ungültig ab',
    (raw) => {
      expect(checkExternalUrl(raw).ok).toBe(false)
    }
  )
})

describe('isPrivateAddress', () => {
  it('erkennt aufgelöste Adressen — die zweite Ebene', () => {
    // Gebraucht, nachdem der Hostname aufgelöst wurde: `evil.test` darf auf
    // 127.0.0.1 zeigen, und die syntaktische Prüfung sieht das nicht.
    expect(isPrivateAddress('127.0.0.1')).toBe(true)
    expect(isPrivateAddress('169.254.169.254')).toBe(true)
    expect(isPrivateAddress('10.1.2.3')).toBe(true)
    expect(isPrivateAddress('::1')).toBe(true)
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
  })
})
