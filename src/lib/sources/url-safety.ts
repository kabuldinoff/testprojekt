/**
 * Schutz gegen Server-Side Request Forgery beim URL-Import.
 *
 * Beim URL-Import ruft **der Server** eine Adresse ab, die der Nutzer angibt.
 * Ohne Prüfung wird daraus ein Werkzeug, um von innen an Dinge zu kommen, die
 * von außen unerreichbar sind: der Metadatendienst der Cloud-Umgebung, ein
 * internes Netz, oder die eigene Anwendung auf localhost. Die Antwort landet
 * anschließend als „Quelle" sichtbar im Notebook.
 *
 * Zwei Ebenen, weil eine nicht reicht:
 *
 * 1. **Hier**: die rein syntaktische Prüfung — Schema, offensichtlich private
 *    Adressen, bekannte Sonderfälle. Ohne Netz testbar.
 * 2. **Beim Abruf** (`fetchArticle`): die Auflösung des Hostnamens und die
 *    Prüfung der tatsächlichen IP-Adressen. Nötig, weil `evil.test` auf
 *    `127.0.0.1` zeigen darf und die syntaktische Prüfung das nicht sehen kann.
 *
 * Diese Datei kennt nur Ebene 1 und bleibt dadurch rein.
 */

export type UrlRejection =
  | 'kein-gueltiger-link'
  | 'nur-http-und-https'
  | 'kein-hostname'
  | 'private-adresse'
  | 'zugangsdaten-im-link'

export const REJECTION_MESSAGES: Record<UrlRejection, string> = {
  'kein-gueltiger-link': 'Das ist keine gültige Adresse.',
  'nur-http-und-https': 'Nur http- und https-Adressen können abgerufen werden.',
  'kein-hostname': 'Der Adresse fehlt ein Hostname.',
  'private-adresse': 'Adressen im lokalen oder privaten Netz können nicht abgerufen werden.',
  'zugangsdaten-im-link': 'Bitte eine Adresse ohne Benutzername und Passwort angeben.'
}

/**
 * Ob eine IPv4-Adresse in einem Bereich liegt, der nicht im offenen Netz steht.
 *
 * Die Liste ist bewusst großzügig: lieber eine erreichbare Adresse ablehnen
 * als eine interne freigeben. Wer eine Seite aus einem privaten Netz braucht,
 * fügt den Text ein.
 */
function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false

  const octets = parts.map((p) => {
    // Führende Nullen sind hier verdächtig: 010.0.0.1 wird von manchen
    // Bibliotheken oktal gelesen. Wer so etwas schickt, meint es nicht gut.
    if (!/^\d{1,3}$/.test(p)) return NaN
    return Number(p)
  })
  if (octets.some((o) => Number.isNaN(o) || o > 255)) return false

  const [a, b] = octets as [number, number, number, number]
  return (
    a === 0 || // 0.0.0.0/8 — „dieses Netz"
    a === 10 || // privat
    a === 127 || // Loopback
    (a === 100 && b >= 64 && b <= 127) || // Carrier-Grade NAT
    (a === 169 && b === 254) || // Link-local, enthält 169.254.169.254 (Cloud-Metadaten)
    (a === 172 && b >= 16 && b <= 31) || // privat
    (a === 192 && b === 168) || // privat
    (a === 192 && b === 0) || // IETF-Protokollzuweisungen
    (a === 198 && b >= 18 && b <= 19) || // Benchmarking
    a >= 224 // Multicast und reserviert
  )
}

/** Loopback, Link-local und die eingebetteten IPv4-Formen. */
function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === '::1' || h === '::' || h === '0:0:0:0:0:0:0:1') return true
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true
  // IPv4 in IPv6-Schreibweise, in beiden Formen.
  //
  // Die Punktform ist die, die man eintippt. Node normalisiert sie beim Parsen
  // aber in Hextets: aus `::ffff:127.0.0.1` wird `::ffff:7f00:1`. Wer nur die
  // Punktform prüft, prüft eine Zeichenkette, die `new URL()` nie liefert —
  // und lässt Loopback durch. Nachgemessen, nicht vermutet.
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h)
  if (dotted?.[1]) return isPrivateIPv4(dotted[1])

  const hextets = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h)
  if (hextets?.[1] && hextets[2]) {
    const high = parseInt(hextets[1], 16)
    const low = parseInt(hextets[2], 16)
    const ipv4 = [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
    return isPrivateIPv4(ipv4)
  }

  return false
}

/** Namen, die konventionell auf die eigene Maschine oder ein internes Netz zeigen. */
function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  // Reservierte Sonder-Domains nach RFC 6761 und RFC 8375.
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true
  // Cloud-Metadatendienste sind über Namen genauso erreichbar wie über die IP.
  if (h === 'metadata.google.internal' || h === 'metadata') return true
  return false
}

export interface UrlCheck {
  ok: boolean
  /** Normalisierte Adresse — nur gesetzt, wenn `ok`. */
  url?: string
  reason?: UrlRejection
}

/**
 * Prüft eine vom Nutzer angegebene Adresse, bevor der Server sie abruft.
 *
 * Gibt die normalisierte Adresse zurück, damit der Aufrufer genau das abruft,
 * was geprüft wurde — und nicht die Rohfassung, die sich beim Parsen noch
 * anders auflösen könnte.
 */
export function checkExternalUrl(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'kein-gueltiger-link' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'nur-http-und-https' }
  }

  // `http://user:pass@intern.example/` wäre ein Weg, Zugangsdaten aus dem
  // Server heraus an eine fremde Stelle zu schicken.
  if (url.username || url.password) {
    return { ok: false, reason: 'zugangsdaten-im-link' }
  }

  const host = url.hostname
  if (!host) return { ok: false, reason: 'kein-hostname' }

  if (isPrivateHostname(host) || isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return { ok: false, reason: 'private-adresse' }
  }

  return { ok: true, url: url.toString() }
}

/**
 * Dieselbe Prüfung für eine bereits aufgelöste IP-Adresse.
 *
 * Getrennt exportiert, weil sie in der zweiten Ebene gebraucht wird: dort
 * steht kein Hostname mehr zur Verfügung, sondern das, worauf er zeigt.
 */
export function isPrivateAddress(ip: string): boolean {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip)
}
