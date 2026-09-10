import { lookup } from 'node:dns/promises'

import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import { extractText, getDocumentProxy } from 'unpdf'

import { type Page } from './chunk'
import { REJECTION_MESSAGES, checkExternalUrl, isPrivateAddress } from './url-safety'

/**
 * Macht aus einer Quelle Seiten mit Text. Der einzige Ort im Projekt, der
 * fremde Formate anfasst.
 *
 * Was diese Datei bewusst **nicht** tut: zerlegen, einbetten, speichern. Sie
 * liefert Seiten, und was daraus wird, entscheidet der Verarbeitungslauf.
 *
 * Alle drei Funktionen geben Fehler als Wert zurück statt zu werfen. Ein
 * kaputtes PDF ist kein Ausnahmefall des Programms, sondern ein erwartetes
 * Ergebnis, das dem Nutzer erklärt werden muss.
 */

/**
 * Ein Fehlschlag trägt mit, ob ein weiterer Versuch überhaupt Sinn hätte.
 *
 * Ohne diese Unterscheidung wird jedes kaputte PDF dreimal gelesen, bevor es
 * aufgibt — der Nutzer sieht anderthalb Minuten „wartet" für eine Antwort, die
 * beim ersten Versuch feststand. Umgekehrt darf ein einzelner Netzfehler nicht
 * sofort endgültig sein.
 *
 * `permanent: true` heißt: das Ergebnis hängt nicht vom Zeitpunkt ab.
 */
export type ParseResult =
  | { ok: true; pages: Page[]; title?: string | undefined }
  | { ok: false; message: string; permanent: boolean }

/** Größter Text, den wir aus einer Quelle übernehmen. */
const MAX_TEXT_CHARS = 1_000_000

/** Abbruch beim Abrufen einer Webseite. */
const FETCH_TIMEOUT_MS = 15_000

/** Größte Antwort, die wir von einer fremden Seite entgegennehmen. */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

/**
 * Liest den Antwortkörper und bricht ab, sobald die Grenze überschritten ist.
 *
 * `response.arrayBuffer()` wäre eine Zeile, liest aber **erst alles** und
 * prüft **dann** die Größe — bei einer Antwort, die absichtlich nicht aufhört,
 * ist der Speicher voll, bevor die Prüfung überhaupt drankommt. Die Adresse
 * gibt der Nutzer an; das ist also kein hypothetischer Fall.
 *
 * Deshalb stückweise lesen, mitzählen und den Reader abbrechen. Das Abbrechen
 * ist der Punkt: ohne `cancel()` liefe der Download im Hintergrund weiter.
 *
 * @returns Den Text, oder `null` wenn die Grenze überschritten wurde.
 */
async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

/**
 * PDF → eine Seite pro Seite.
 *
 * `mergePages: false` ist die wichtigste Zeile hier. Mit `true` bekäme man
 * einen einzigen Textblock, und die Seitenzahl wäre für immer verloren — damit
 * auch die Möglichkeit, ein Zitat mit „Seite 17" zu belegen.
 *
 * `unpdf` liest ausschließlich die Textebene. Ein Scan hat keine, und das ist
 * kein Fehler, sondern ein Ergebnis: die Prüfung darauf steht im
 * Verarbeitungslauf, damit die Meldung dort formuliert wird, wo sie beim
 * Nutzer ankommt.
 */
export async function parsePdf(data: ArrayBuffer): Promise<ParseResult> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data))
    const { text } = await extractText(pdf, { mergePages: false })

    const pages: Page[] = (text as string[]).map((t, i) => ({
      number: i + 1,
      text: t.slice(0, MAX_TEXT_CHARS)
    }))

    return { ok: true, pages }
  } catch {
    // Absichtlich ohne Details aus der Bibliothek: die Meldungen von pdf.js
    // sind für Endnutzer unlesbar und verraten Interna.
    // Dauerhaft: dieselbe Datei ergibt beim nächsten Mal denselben Fehler.
    return { ok: false, message: 'Diese PDF-Datei konnte nicht gelesen werden.', permanent: true }
  }
}

/**
 * Text oder Markdown → genau eine Seite ohne Nummer.
 *
 * `null` als Seitenzahl ist eine Aussage, kein fehlender Wert: diese Quelle
 * hat keine Seiten, und ein Zitat darauf nennt deshalb keine.
 */
export function parsePlainText(content: string): ParseResult {
  const text = content.slice(0, MAX_TEXT_CHARS)
  if (text.trim().length === 0) {
    return { ok: false, message: 'Diese Datei enthält keinen Text.', permanent: true }
  }
  return { ok: true, pages: [{ number: null, text }] }
}

/**
 * Webseite → eine Seite Markdown.
 *
 * Drei Schritte, jeder mit einem eigenen Grund:
 *
 * `Readability` holt den Artikel heraus. Ohne sie bestünde die Quelle zur
 * Hälfte aus Navigation, Cookie-Bannern und Fußzeile — Text, der in jeder
 * Ähnlichkeitssuche mitschwimmt und nichts bedeutet.
 *
 * `linkedom` statt `jsdom`: Readability braucht nur ein DOM-förmiges Objekt,
 * und linkedom hat keine nativen Abhängigkeiten. Das ist auf einer
 * Serverless-Plattform der Unterschied zwischen „läuft" und „lässt sich nicht
 * bündeln".
 *
 * `turndown` macht Markdown daraus statt reinen Text: die Überschriften
 * bleiben erhalten, und genau an denen trennt die Zerlegung am liebsten.
 */
export async function fetchArticle(rawUrl: string): Promise<ParseResult> {
  const check = checkExternalUrl(rawUrl)
  if (!check.ok || !check.url) {
    // Eine abgelehnte Adresse bleibt abgelehnt.
    return {
      ok: false,
      message: REJECTION_MESSAGES[check.reason ?? 'kein-gueltiger-link'],
      permanent: true
    }
  }

  // Zweite Ebene des SSRF-Schutzes. Die syntaktische Prüfung sieht nur den
  // Hostnamen; `intern.beispiel.de` darf aber auf 127.0.0.1 zeigen. Erst die
  // Auflösung zeigt, wohin der Abruf wirklich ginge.
  //
  // Die verbleibende Lücke ist bekannt und heißt DNS-Rebinding: zwischen
  // dieser Auflösung und dem Abruf kann sich die Antwort ändern. Sie zu
  // schließen hieße, selbst zu verbinden statt fetch zu benutzen. Für ein
  // Produkt, das öffentliche Artikel importiert, ist das Verhältnis von
  // Aufwand zu Gewinn nicht gegeben — festgehalten in docs/security.md.
  const target = new URL(check.url)
  try {
    const addresses = await lookup(target.hostname, { all: true })
    if (addresses.some((a) => isPrivateAddress(a.address))) {
      return { ok: false, message: REJECTION_MESSAGES['private-adresse'], permanent: true }
    }
  } catch {
    // Vorübergehend: DNS kann kurz ausfallen.
    return { ok: false, message: 'Diese Adresse konnte nicht aufgelöst werden.', permanent: false }
  }

  let html: string
  try {
    const response = await fetch(check.url, {
      // Keine Weiterleitungen verfolgen: eine öffentliche Adresse könnte auf
      // eine interne umleiten und damit beide Prüfungen umgehen.
      redirect: 'manual',
      headers: {
        // Ohne User-Agent antworten viele Seiten mit einer Sperrseite, und die
        // landete dann als Quelleninhalt im Notebook.
        'user-agent': 'Mozilla/5.0 (compatible; Notabene/1.0)',
        accept: 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })

    if (response.status >= 300 && response.status < 400) {
      return {
        ok: false,
        message: 'Diese Adresse leitet weiter. Bitte die Zieladresse angeben.',
        permanent: true
      }
    }
    if (!response.ok) {
      // 5xx kann vorübergehen, 4xx nicht.
      return {
        ok: false,
        message: `Die Seite antwortete mit Status ${response.status}.`,
        permanent: response.status < 500
      }
    }

    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('html')) {
      return { ok: false, message: 'Unter dieser Adresse liegt keine Webseite.', permanent: true }
    }

    const tooLarge = { ok: false as const, message: 'Diese Seite ist zu groß.', permanent: true }

    // Content-Length ist der billige Weg, aber kein Verlass: der Header kann
    // fehlen oder lügen. Er spart nur den Verbindungsaufbau im ehrlichen Fall.
    const declared = Number(response.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) return tooLarge

    const body = await readCapped(response, MAX_RESPONSE_BYTES)
    if (!body) return tooLarge
    html = body
  } catch {
    // Zeitüberschreitung oder Verbindungsabbruch — beides kann vorübergehen.
    return { ok: false, message: 'Die Seite konnte nicht abgerufen werden.', permanent: false }
  }

  const { document } = parseHTML(html)
  const article = new Readability(document).parse()

  if (!article?.content) {
    // Der typische Fall ist eine Seite, die ihren Inhalt erst per JavaScript
    // nachlädt: Readability findet dann eine leere Hülle. Ohne diese Prüfung
    // entstünde eine Quelle aus vierzig Zeichen Navigationstext.
    return {
      ok: false,
      message: 'Auf dieser Seite war kein Artikeltext zu finden. Text einfügen funktioniert aber.',
      permanent: true
    }
  }

  const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(
    article.content
  )

  if (markdown.trim().length < 100) {
    return {
      ok: false,
      message: 'Auf dieser Seite war zu wenig Text zu finden. Text einfügen funktioniert aber.',
      permanent: true
    }
  }

  return {
    ok: true,
    pages: [{ number: null, text: markdown.slice(0, MAX_TEXT_CHARS) }],
    title: article.title?.trim() || undefined
  }
}
