/**
 * Setzt den Text einer Quelle aus ihren Abschnitten wieder zusammen — rein,
 * ohne I/O, die Gegenrichtung zu `chunk.ts`.
 *
 * ── Warum aus den Abschnitten und nicht aus der Originaldatei ──────────────
 *
 * Weil es für eine der fünf Quellarten keine Originaldatei gibt: Ein
 * URL-Import legt nichts in Storage ab, sein Inhalt wird beim Verarbeiten
 * geholt und existiert danach nur noch als Abschnitte. Ein Betrachter, der aus
 * Storage liest, könnte also vier von fünf Arten anzeigen — und die fünfte
 * bräuchte einen zweiten Weg.
 *
 * Es gibt einen zweiten Grund, und der ist der bessere: Die Abschnitte sind
 * das, worauf die Antworten tatsächlich beruhen. Ein PDF im Originallayout
 * daneben zu stellen hieße, zwei Wahrheiten zu zeigen — und die Frage „warum
 * steht in der Antwort etwas anderes als im Dokument" hätte keine gute
 * Antwort. Hier sieht der Nutzer genau den Text, den das Modell gesehen hat.
 *
 * ── Das eigentliche Problem: die Überlappung ───────────────────────────────
 *
 * `chunk.ts` lässt aufeinanderfolgende Abschnitte einander überlappen, damit
 * keine Aussage an einer Grenze verlorengeht. Aneinandergehängt ergäbe das
 * einen Text, in dem jeder zweite Satz doppelt steht.
 *
 * Zwei Signale, und keines trägt allein.
 *
 * **`char_start`/`char_end`** stehen in der Tabelle und sagen, wie weit zwei
 * Abschnitte einander überlappen — aber nur in den Koordinaten des
 * Originaltextes. Gespeichert wird `text.slice(charStart, charEnd).trim()`,
 * und der abgeschnittene Leerraum fehlt in der Rechnung. Um ein bis zwei
 * Zeichen daneben heißt hier: ein angeschnittenes Wort, an jeder Grenze.
 *
 * **Der Text selbst** kann die Differenz auflösen — aber nicht für sich
 * genommen. Die naive Fassung suchte das längste Ende des bisherigen Textes,
 * das zugleich der Anfang des nächsten Abschnitts ist. Bei wiederkehrendem
 * Text passt jedes Ende auf jeden Anfang: In einem Dokument mit einer
 * wiederholten Textbausteinzeile — einer Kopfzeile, einer Tabellenspalte —
 * gewinnt ein viel zu langer Treffer, und der Betrachter verschluckt einen
 * halben Absatz. Drei Tests sind genau daran gescheitert, bevor diese Fassung
 * stand.
 *
 * Deshalb beides: Die gespeicherte Länge sagt, **wo** gesucht wird, der Text
 * sagt, **wie viel** das Trimmen genommen hat. Gesucht wird nur im Spielraum
 * weniger Zeichen darunter — und da Trimmen ausschließlich entfernt, nie
 * hinzufügt, liegt die Antwort immer unterhalb des erwarteten Werts.
 */

/**
 * Wie weit unterhalb des erwarteten Werts noch gesucht wird.
 *
 * Für Abschnitte, die `chunk.ts` heute schreibt, ist das **null Arbeit**:
 * `charStart`/`charEnd` folgen seit `alsChunk` dem getrimmten Inhalt, die
 * erwartete Länge stimmt also exakt und der erste Versuch trifft.
 *
 * Das Fenster ist für **Altbestand** da. Vor dieser Änderung zeigten die
 * Positionen auf den Rohbereich, und die Differenz — der abgeschnittene
 * Leerraum — steckt in keiner gespeicherten Spalte. Bei Satz- und
 * Absatzgrenzen sind das ein bis zwei Zeichen; acht deckt das ab und ist eng
 * genug, dass in dem Fenster kein zweiter, falscher Treffer liegen kann.
 *
 * Breiter zu suchen wäre keine Verbesserung, sondern der Rückfall in den
 * ersten Entwurf: Bei wiederkehrendem Text passt jedes Ende auf jeden Anfang,
 * und ein zu langer Treffer verschluckt einen halben Absatz.
 */
const TRIM_SPIELRAUM = 8

/**
 * Was zwischen zwei Abschnitte kommt, die einander **nicht** überlappen.
 *
 * Das ist der Normalfall an einer Absatzgrenze: `chunk.ts` trennt dort
 * bevorzugt, und der nächste Abschnitt beginnt dann hinter dem Umbruch statt
 * davor. Ein Leerzeichen würde die beiden Absätze zu einem verschmelzen.
 */
const TRENNER = '\n\n'

export interface ChunkRow {
  chunkIndex: number
  pageNumber: number | null
  content: string
  /** Zeichenposition im Quelltext **dieser Seite** — siehe `chunk.ts`. */
  charStart: number
  charEnd: number
}

/** Wo ein Abschnitt im zusammengesetzten Text seiner Seite liegt. */
export interface Span {
  chunkIndex: number
  von: number
  bis: number
}

export interface AssembledPage {
  /** `null` bei Quellen ohne Seiten (Text, Markdown, Webseite). */
  pageNumber: number | null
  text: string
  /**
   * Damit ein Zitat seine Stelle markieren kann, ohne sie zu suchen.
   *
   * Ein Zitat trägt `chunkIndex` — die Markierung ist damit ein Nachschlagen
   * und keine Textsuche. Der Unterschied ist nicht kosmetisch: Kommt eine
   * Passage im Dokument zweimal vor, markierte eine Suche die erste, und das
   * wäre in der Hälfte der Fälle die falsche.
   */
  spans: Span[]
}

/**
 * Wie viele Zeichen vom Anfang des nächsten Abschnitts schon dastehen.
 *
 * `erwartet` ist die Überlappung in Originalkoordinaten
 * (`vorheriger.charEnd - naechster.charStart`). Gesucht wird von dort abwärts:
 * Das Trimmen kann nur Zeichen genommen haben, nie welche hinzugefügt, die
 * Antwort liegt also nie darüber. Der erste Wert, der sich am Text bestätigt,
 * gewinnt — und weil das Fenster nur wenige Zeichen breit ist, kann darin kein
 * zufälliger zweiter Treffer liegen.
 *
 * `k = 0` bestätigt sich immer (`endsWith('')`) und ist damit zugleich die
 * richtige Antwort für „überlappt gar nicht".
 */
export function overlapLength(vorheriger: string, naechster: string, erwartet: number): number {
  if (erwartet <= 0) return 0

  const oben = Math.min(erwartet, naechster.length)
  const unten = Math.max(0, erwartet - TRIM_SPIELRAUM)

  for (let k = oben; k >= unten; k--) {
    if (vorheriger.endsWith(naechster.slice(0, k))) return k
  }

  // Kein Treffer im Fenster — also **nichts** abziehen.
  //
  // Der erste Entwurf gab hier `oben` zurück, die erwartete Länge. Das war ein
  // stiller Datenverlust, und das Review hat ihn gefunden: Steht im
  // Überlappungsfenster ein Satzende direkt vor zwölf Leerzeichen, beträgt der
  // abgeschnittene Leerraum dreizehn Zeichen, das Fenster greift nicht — und
  // `slice(oben)` schnitt zehn Zeichen weg, die nur einmal vorkamen. Bei
  // hundertzwanzig Leerzeichen waren es hundert. Nachgemessen, bevor
  // geändert wurde.
  //
  // `0` ist der sichere Ausgang: Die Überlappung steht dann doppelt da. Das
  // sieht man, und es ist lesbar. Fehlender Text sieht man nicht.
  return 0
}

/**
 * Baut aus den Abschnitten einer Quelle die Seiten zurück.
 *
 * Seitengrenzen werden nicht überschritten — ein Abschnitt gehört zu genau
 * einer Seite, und zwei Seiten zu einem Text zu verschmelzen machte jede
 * Seitenzahl in einem Zitat zur Lüge.
 */
export function assembleSource(chunks: ChunkRow[]): AssembledPage[] {
  // Nach `chunk_index`, nicht nach Seitenzahl: Der Index ist die Reihenfolge,
  // in der der Text entstanden ist, und er läuft über das ganze Dokument.
  const geordnet = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex)

  // Map statt Objekt, weil der Schlüssel `null` sein darf und die
  // Einfügereihenfolge erhalten bleibt — die erste Seite soll vorn stehen.
  const seiten = new Map<number | null, ChunkRow[]>()
  for (const c of geordnet) {
    const liste = seiten.get(c.pageNumber)
    if (liste) liste.push(c)
    else seiten.set(c.pageNumber, [c])
  }

  return [...seiten].map(([pageNumber, liste]) => {
    let text = ''
    const spans: Span[] = []
    let bisherBis = 0 // Originalposition, bis zu der der Text schon steht

    for (const c of liste) {
      if (text.length === 0) {
        text = c.content
        spans.push({ chunkIndex: c.chunkIndex, von: 0, bis: text.length })
        bisherBis = c.charEnd
        continue
      }

      // In **Originalkoordinaten** gerechnet und nicht über die Länge des
      // bisherigen Textes: Der ist die Aneinanderreihung getrimmter Inhalte,
      // seine Länge entspricht keiner Position im Quelltext.
      const k = overlapLength(text, c.content, bisherBis - c.charStart)
      // Bei Überlappung beginnt der Abschnitt dort, wo sie anfängt — also ein
      // Stück **vor** dem bisherigen Ende. Ohne Überlappung hinter dem
      // Trenner.
      const von = k > 0 ? text.length - k : text.length + TRENNER.length
      text += (k > 0 ? '' : TRENNER) + c.content.slice(k)
      spans.push({ chunkIndex: c.chunkIndex, von, bis: text.length })

      // Nur vorwärts: Ein vollständig überdeckter Abschnitt darf den Stand
      // nicht zurückdrehen.
      bisherBis = Math.max(bisherBis, c.charEnd)
    }

    return { pageNumber, text, spans }
  })
}
