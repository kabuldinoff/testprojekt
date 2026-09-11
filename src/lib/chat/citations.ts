/**
 * Belege: aus einer Modellantwort die Verweise herauslesen und prüfen.
 *
 * Das Modell bekommt nummerierte Ausschnitte und die Anweisung, jede Aussage
 * mit `[1]`, `[2]` … zu belegen. Was zurückkommt, ist Text mit Zahlen darin —
 * mehr nicht. Diese Datei macht daraus überprüfte Verweise.
 *
 * Der Punkt, um den es geht: **ein Modell kann eine Nummer erfinden.** Es
 * bekommt fünf Ausschnitte und schreibt `[7]`, weil die Antwort damit belegter
 * aussieht. Bliebe das stehen, zeigte die Oberfläche einen Beleg, der ins
 * Leere führt — und ein Beleg, der ins Leere führt, ist schlimmer als keiner:
 * er sieht aus wie Sorgfalt. Erfundene Nummern werden deshalb aus dem Text
 * entfernt und gezählt.
 *
 * Diese Datei ist rein: kein Netz, keine Datenbank. Sie ist der Grund, warum
 * sich das Verhalten ohne laufendes Modell prüfen lässt.
 */
import { z } from 'zod'

/** Ein Ausschnitt, wie ihn die Suche liefert. */
export interface RetrievedChunk {
  id: string
  sourceId: string
  sourceTitle: string
  chunkIndex: number
  content: string
  pageNumber: number | null
  charStart: number
  charEnd: number
}

/**
 * Die Form eines Verweises — als Schema, nicht nur als Typ.
 *
 * Ein TypeScript-Typ verschwindet beim Übersetzen. Für eine Server Action, die
 * eine Belegliste entgegennimmt, ist er deshalb wertlos: Was dort ankommt, ist
 * JSON vom Client, und `[null]` oder `[{}]` passieren jede Typprüfung, weil es
 * keine mehr gibt. In der Datenbank stünde dann eine Notiz, deren Belege beim
 * Rendern einen Fehler auslösen.
 *
 * Der Typ wird aus dem Schema abgeleitet und nicht daneben geschrieben, damit
 * beide nicht auseinanderlaufen können.
 */
export const citationSchema = z.object({
  n: z.number().int().positive(),
  sourceId: z.uuid(),
  sourceTitle: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  pageNumber: z.number().int().nullable(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),

  /**
   * Die belegte Passage im Wortlaut.
   *
   * Mitgespeichert und nicht beim Anklicken nachgeladen, und das ist die
   * teurere von zwei Möglichkeiten — ein Abschnitt sind rund 1200 Zeichen,
   * eine Antwort mit zwölf Belegen also etwa 14 KB. Der Gegenwert:
   *
   * 1. Ein Beleg bleibt lesbar, wenn die Quelle gelöscht wird. Bei einem
   *    Rechercheassistenten ist das keine Kleinigkeit — ein Zitat, das
   *    verschwindet, macht die ganze alte Antwort unüberprüfbar.
   * 2. Es gibt genau einen Weg zur Passage. Nachladen hieße: während des
   *    Gesprächs aus dem Strom, nach dem Neuladen aus der Datenbank — zwei
   *    Wege zu denselben Daten, die unterschiedlich falsch sein können.
   */
  excerpt: z.string()
})

/** Eine Belegliste, wie sie an einer Systemgrenze ankommt. */
export const citationsSchema = z.array(citationSchema)

/**
 * Ein geprüfter Verweis. Genau das, was in `messages.citations` landet.
 *
 * Die Positionsangaben werden mitgespeichert und nicht später nachgeschlagen:
 * löscht der Nutzer die Quelle, soll die alte Antwort lesbar bleiben. Siehe
 * den Kommentar an der Spalte in Migration 0008.
 */
export type Citation = z.infer<typeof citationSchema>

/**
 * Findet `[1]`, `[2, 3]`, `[4,5]` — eine Klammer mit einer oder mehreren
 * Zahlen.
 *
 * Bewusst nicht `\[.*?\]`: Markdown-Links (`[Text](…)`) und Fußnoten wären
 * sonst Treffer. Nur Ziffern, Kommas und Leerzeichen zwischen den Klammern.
 *
 * Bewusst auch keine Vorzeichen: `[-1]` ist kein Beleg, sondern Text — etwa
 * ein Feldindex in einer zitierten Passage. Es bleibt deshalb unangetastet
 * stehen, genau wie `[Platzhalter]`. Ein Muster, das `-1` mitnähme, würde
 * solche Stellen aus der Antwort löschen. Festgehalten als Test.
 */
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g

/**
 * Dasselbe mit dem Leerraum davor.
 *
 * Nur zum Umschreiben, nicht zum Aufteilen: Wird eine erfundene Klammer
 * entfernt, muss das Leerzeichen davor mit weg, sonst bleibt „Behauptung ."
 * stehen. Der naheliegende Weg wäre gewesen, hinterher alle doppelten
 * Leerzeichen im Text zusammenzuziehen — das aber zerstörte Einrückungen und
 * ausgerichtete Passagen auch dann, wenn gar nichts entfernt wurde. Die
 * Antwort wird mit `whitespace-pre-wrap` dargestellt, der Unterschied ist
 * also sichtbar.
 */
const MARKER_MIT_VORRAUM = /([ \t]*)(\[\d+(?:\s*,\s*\d+)*\])/g

export interface ParsedAnswer {
  /** Der Antworttext, bereinigt um Verweise, die es nicht gibt. */
  text: string
  /** Die tatsächlich benutzten Verweise, in der Reihenfolge ihres Auftretens. */
  citations: Citation[]
  /**
   * Wie viele erfundene Nummern entfernt wurden.
   *
   * Nicht für den Nutzer — für die Protokollierung. Steigt diese Zahl, stimmt
   * etwas mit dem System-Prompt nicht, und ohne Zählung merkt das niemand.
   */
  dropped: number
}

/**
 * Zerlegt eine Modellantwort in Text und geprüfte Verweise.
 *
 * `chunks` ist die Liste, die dem Modell vorgelegt wurde, in genau der
 * Reihenfolge: Ausschnitt 1 ist `chunks[0]`. Diese Zuordnung ist die einzige
 * Verbindung zwischen der Zahl im Text und der Stelle im Dokument — geht die
 * Reihenfolge verloren, zeigen alle Belege auf die falsche Stelle, und zwar
 * unauffällig.
 */
/**
 * Schreibt die Klammern im Text neu und meldet, was benutzt und was verworfen
 * wurde.
 *
 * Der gemeinsame Kern von zwei Aufrufern, und das ist der Punkt: der Server
 * bereinigt die Antwort beim Speichern, die Oberfläche beim Darstellen des
 * noch strömenden Textes. Wären das zwei Regeln, zeigte die Seite während des
 * Strömens einen erfundenen Beleg und nach dem Neuladen nicht mehr — der
 * Nutzer sähe zwei verschiedene Antworten auf dieselbe Frage.
 *
 * Aufgefallen ist das im End-to-End-Test, nicht beim Nachdenken: die
 * Bereinigung lief zuerst nur serverseitig.
 */
export function rewriteMarkers(
  answer: string,
  isKnown: (n: number) => boolean
): { text: string; used: number[]; dropped: number } {
  const used: number[] = []
  let dropped = 0

  const text = answer.replace(MARKER_MIT_VORRAUM, (_treffer, vorraum: string, klammer: string) => {
    const zahlen = klammer.slice(1, -1)
    const nummern = zahlen.split(',').map((z) => Number.parseInt(z.trim(), 10))
    const gueltig = nummern.filter((n) => Number.isInteger(n) && isKnown(n))

    dropped += nummern.length - gueltig.length

    // Alle Nummern in dieser Klammer waren erfunden: die Klammer
    // verschwindet ganz, samt dem Leerraum davor. Ein leeres `[]` sähe nach
    // einem Darstellungsfehler aus, und „Behauptung ." nach einem zweiten.
    if (gueltig.length === 0) return ''

    for (const n of gueltig) if (!used.includes(n)) used.push(n)

    // Mehrere Nummern werden zu einzelnen Klammern: die Oberfläche stellt
    // jeden Beleg als eigene anklickbare Schaltfläche dar, und `[2, 3]` wäre
    // eine Schaltfläche, die zwei Stellen gleichzeitig meint.
    return vorraum + gueltig.map((n) => `[${n}]`).join('')
  })

  return { text, used, dropped }
}

/**
 * Zerlegt eine Modellantwort in Text und geprüfte Verweise.
 *
 * `chunks` ist die Liste, die dem Modell vorgelegt wurde, in genau der
 * Reihenfolge: Ausschnitt 1 ist `chunks[0]`. Diese Zuordnung ist die einzige
 * Verbindung zwischen der Zahl im Text und der Stelle im Dokument — geht die
 * Reihenfolge verloren, zeigen alle Belege auf die falsche Stelle, und zwar
 * unauffällig.
 */
export function parseCitations(answer: string, chunks: RetrievedChunk[]): ParsedAnswer {
  const { text, used, dropped } = rewriteMarkers(answer, (n) => n >= 1 && n <= chunks.length)

  const citations = used
    .map((n) => {
      const c = chunks[n - 1]!
      return {
        n,
        sourceId: c.sourceId,
        sourceTitle: c.sourceTitle,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        charStart: c.charStart,
        charEnd: c.charEnd,
        excerpt: c.content
      }
    })
    // Nach Nummer sortiert und nicht nach Auftreten: die Liste unter der
    // Antwort soll dieselbe Reihenfolge haben wie die Zahlen im Text.
    .sort((a, b) => a.n - b.n)

  return { text, citations, dropped }
}

/**
 * Zerlegt Antworttext für die Darstellung in Stücke.
 *
 * Die Oberfläche kann keinen String mit `[3]` darin rendern und trotzdem eine
 * Schaltfläche daraus machen. Sie braucht die Teile einzeln — und weil das
 * Aufteilen dieselbe Regel benutzen muss wie das Auslesen, steht es hier
 * neben `parseCitations` und nicht in der Komponente.
 */
export type AnswerPart = { kind: 'text'; value: string } | { kind: 'citation'; n: number }

export function splitAnswer(text: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  let last = 0

  for (const treffer of text.matchAll(MARKER)) {
    const index = treffer.index
    if (index > last) parts.push({ kind: 'text', value: text.slice(last, index) })

    // Nach `parseCitations` enthält jede Klammer genau eine Zahl. Kommt
    // trotzdem eine mehrfache an — etwa aus einer älteren gespeicherten
    // Nachricht — wird sie in einzelne zerlegt statt verworfen.
    for (const z of treffer[1]!.split(',')) {
      parts.push({ kind: 'citation', n: Number.parseInt(z.trim(), 10) })
    }
    last = index + treffer[0].length
  }

  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  return parts
}
