import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site'

/**
 * `llms.txt` — die Kurzfassung dieser Seite für Sprachmodelle.
 *
 * Der Vorschlag dahinter: Modelle, die eine Seite zusammenfassen sollen,
 * bekommen mit HTML dieselbe Arbeit wie ein Browser — Navigation, Fußzeile,
 * Skripte —, und aus dem Rest entsteht eine ungefähre Beschreibung. Eine
 * kurze Textdatei an einer bekannten Stelle spart ihnen das Raten.
 *
 * Als Route und nicht als Datei in `public/`, aus demselben Grund wie bei
 * `robots.txt`: Die Adressen darin sollen absolut sein und in Produktion,
 * Vorschau und lokal jeweils stimmen.
 *
 * Was hier **nicht** steht: Anweisungen an das lesende Modell. Diese Datei ist
 * eine Beschreibung, keine Aufforderung — und wer ihr Anweisungen mitgibt,
 * baut genau die Schwachstelle, gegen die dieses Projekt an anderer Stelle
 * absichert.
 */
/**
 * Zur Build-Zeit erzeugt statt bei jedem Abruf.
 *
 * Der Inhalt hängt nur am Code und an der Basisadresse, beide stehen beim
 * Bauen fest. Ohne diese Zeile wäre es eine Funktion, die für eine
 * unveränderliche Textdatei bei jedem Aufruf startet.
 */
export const dynamic = 'force-static'

export function GET(): Response {
  const basis = siteUrl()

  const text = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} ist ein Rechercheassistent. Nutzer legen Notebooks an, fügen Quellen hinzu
(PDF, Text, Markdown, Webseiten oder eingefügter Text) und stellen Fragen dazu. Die
Antworten entstehen ausschließlich aus den ausgewählten Quellen und tragen nummerierte
Belege; ein Klick öffnet die belegte Passage im Wortlaut.

## Eigenschaften

- Belegte Antworten. Steht etwas nicht in den Quellen, wird das gesagt statt geraten.
- Hybride Suche: semantisch und wörtlich, zusammengeführt. Namen, Zahlen und Paragrafen
  gehen dadurch nicht verloren.
- Zweistimmiger Audio-Überblick mit mitlesbarem Transkript.
- Die Indexierung der Quellen läuft fest über einen europäischen Anbieter. Für die
  Antworten ist der Anbieter wählbar, und die Anwendung zeigt dabei, was das für die
  Daten bedeutet.

## Seiten

- [Startseite](${basis}/): Was das Produkt tut und wo die Daten liegen.
- [Anmelden](${basis}/anmelden)
- [Registrieren](${basis}/registrieren)

Der Arbeitsbereich unter /app ist angemeldet und nicht öffentlich zugänglich.

## Technik

Next.js (App Router), TypeScript, Supabase (Postgres mit pgvector, Auth, Storage).
Zugriffskontrolle über Row Level Security in der Datenbank, nicht in der Anwendung.
`

  return new Response(text, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Einen Tag im Zwischenspeicher, einen weiteren als veraltet ausliefern,
      // während im Hintergrund neu geholt wird. Der Inhalt ändert sich mit dem
      // Code, nicht mit den Daten.
      'cache-control': 'public, max-age=86400, stale-while-revalidate=86400'
    }
  })
}
