/**
 * Zerlegt Quelltext in Abschnitte — rein, ohne I/O, das Herzstück der
 * späteren Zitate.
 *
 * Warum überhaupt zerlegen: ein Sprachmodell bekommt nicht das ganze Dokument,
 * sondern die passenden Ausschnitte. Wie gut die Antworten werden, entscheidet
 * sich hier — ein Abschnitt, der mitten im Satz beginnt, ist als Beleg wertlos,
 * und einer, der zwei Themen mischt, wird für beide gefunden und passt zu
 * keinem.
 *
 * Drei Eigenschaften, die das Ergebnis tragen:
 *
 * 1. **Struktur vor Länge.** Getrennt wird zuerst an Überschriften, dann an
 *    Absätzen, erst zuletzt an Satzgrenzen. Eine feste Zeichenzahl würde
 *    Tabellen zerschneiden und Aufzählungen köpfen.
 *
 * 2. **Überlappung.** Aufeinanderfolgende Abschnitte teilen sich das Ende des
 *    vorigen. Ohne das verliert man jede Aussage, die genau über einer Grenze
 *    liegt — und das ist keine Randerscheinung, sondern der Normalfall bei
 *    Fließtext.
 *
 * 3. **Rückverweise.** Jeder Abschnitt trägt `charStart` und `charEnd` relativ
 *    zum Quelltext seiner Seite. Nur dadurch kann ein Zitat später die Stelle
 *    im Dokument markieren und nicht bloß die Datei nennen.
 */

/**
 * Zielgröße in Zeichen, grob 300 Token.
 *
 * Die Zahl ist ein Kompromiss zwischen zwei Fehlern: zu kleine Abschnitte
 * verlieren den Zusammenhang, in dem eine Aussage steht; zu große verdünnen
 * das Thema, sodass die Ähnlichkeitssuche sie nicht mehr trennscharf findet.
 * Bei Fließtext hat sich diese Größenordnung als brauchbar erwiesen; sie ist
 * bewusst eine benannte Konstante, weil sie beim Nachjustieren die erste
 * Stellschraube ist.
 */
export const TARGET_CHARS = 1200

/**
 * Harte Obergrenze. Ein Abschnitt darf sie überschreiten, wenn er sonst mitten
 * in einem Wort getrennt würde — aber nicht beliebig weit.
 */
export const MAX_CHARS = 1800

/**
 * Überlappung zwischen aufeinanderfolgenden Abschnitten.
 *
 * Sie wird an einer Satzgrenze abgeschnitten, nicht mitten im Wort: eine
 * halbe Überlappung stiftet mehr Verwirrung als sie Zusammenhang rettet.
 */
export const OVERLAP_CHARS = 200

/** Kürzer als das ist kein Abschnitt, sondern ein Rest. */
export const MIN_CHARS = 60

export interface Chunk {
  /** Fortlaufend ab 0, über das gesamte Dokument hinweg. */
  index: number
  content: string
  /** 1-basiert. `null` für Quellen ohne Seiten (Text, Markdown, Webseite). */
  pageNumber: number | null
  /** Zeichenposition im Quelltext **dieser Seite**, nicht im ganzen Dokument. */
  charStart: number
  charEnd: number
}

/** Eine Seite Quelltext. Textquellen haben genau eine. */
export interface Page {
  /** 1-basiert, oder `null` wenn die Quelle keine Seiten kennt. */
  number: number | null
  text: string
}

/**
 * Sucht rückwärts ab `from` nach einer Satzgrenze.
 *
 * Rückwärts und nicht vorwärts, damit ein Abschnitt lieber etwas kürzer wird
 * als die Zielgröße zu überschreiten. Gibt `null` zurück, wenn im erlaubten
 * Fenster keine liegt — dann trennt der Aufrufer an einer Wortgrenze.
 */
function findSentenceEnd(text: string, from: number, notBefore: number): number | null {
  // Satzzeichen gefolgt von Leerraum. Die Prüfung auf den Leerraum verhindert,
  // dass Abkürzungen und Dezimalzahlen als Satzende gelten.
  for (let i = from; i > notBefore; i--) {
    const c = text[i]
    if ((c === '.' || c === '!' || c === '?' || c === '\n') && /\s/.test(text[i + 1] ?? ' ')) {
      return i + 1
    }
  }
  return null
}

/**
 * Sucht **vorwärts** ab `from` nach der ersten Satzgrenze vor `until`.
 *
 * Für den Beginn der Überlappung gebraucht, und die Richtung ist der Punkt:
 * rückwärts ab dem Abschnittsende gesucht, fände man die dem Ende nächste
 * Grenze — also fast keine Überlappung. Gesucht ist die Grenze am *Anfang* des
 * Überlappungsfensters.
 */
function findSentenceStartForward(text: string, from: number, until: number): number | null {
  for (let i = from; i < until - 1; i++) {
    const c = text[i]
    if ((c === '.' || c === '!' || c === '?' || c === '\n') && /\s/.test(text[i + 1] ?? ' ')) {
      return i + 1
    }
  }
  return null
}

/** Sucht rückwärts nach einer Wortgrenze — der Notausgang, wenn kein Satz endet. */
function findWordEnd(text: string, from: number, notBefore: number): number {
  for (let i = from; i > notBefore; i--) {
    if (/\s/.test(text[i] ?? '')) return i
  }
  return from
}

/**
 * Macht aus einem Rohbereich einen Abschnitt — und rückt die Positionen auf
 * den **getrimmten** Inhalt.
 *
 * Das ist der Punkt der Funktion. `content` war immer die getrimmte Fassung,
 * `charStart`/`charEnd` zeigten aber auf den Rohbereich. Die Differenz ist der
 * abgeschnittene Leerraum, und sie ist aus den gespeicherten Daten nicht mehr
 * herleitbar: Wer später aus den Abschnitten wieder einen Text bauen will,
 * kann die Überlappung nur schätzen.
 *
 * Nachgemessen, was das kostet: Steht im Überlappungsfenster ein Satzende
 * direkt vor zwölf Leerzeichen, schätzt `reassemble.ts` um dreizehn Zeichen
 * daneben und verliert zehn Zeichen echten Text — lautlos. Bei hundertzwanzig
 * Leerzeichen sind es hundert. Tabellenlayout aus einem PDF sieht genau so aus.
 *
 * Mit dieser Zuordnung gilt `text.slice(charStart, charEnd) === content`
 * **exakt**, ohne `trim()`. Aus einer Schätzung wird eine Subtraktion.
 */
function alsChunk(
  text: string,
  von: number,
  bis: number,
  index: number,
  pageNumber: number | null
): Chunk {
  const roh = text.slice(von, bis)
  const content = roh.trim()

  // Ein Bereich aus reinem Leerraum hat keine sinnvolle Position. Ohne diesen
  // Zweig überholte `charStart` das `charEnd`, weil beide Trimmwerte die volle
  // Länge betragen.
  if (content.length === 0) {
    return { index, content, pageNumber, charStart: von, charEnd: von }
  }

  const vorn = roh.length - roh.trimStart().length
  const hinten = roh.length - roh.trimEnd().length
  return { index, content, pageNumber, charStart: von + vorn, charEnd: bis - hinten }
}

/**
 * Zerlegt eine einzelne Seite.
 *
 * Getrennt wird an Absatzgrenzen, wo sie günstig liegen, sonst an Satzenden,
 * sonst an Wortgrenzen. Der letzte Rest wird an den vorigen Abschnitt
 * angehängt, wenn er zu kurz zum Alleinstehen ist — ein Abschnitt aus drei
 * Wörtern findet nichts und verwässert nur die Trefferliste.
 */
function chunkPage(page: Page, startIndex: number): Chunk[] {
  const text = page.text
  const chunks: Chunk[] = []
  let cursor = 0
  let index = startIndex

  while (cursor < text.length) {
    const rest = text.length - cursor

    if (rest <= MAX_CHARS) {
      chunks.push(alsChunk(text, cursor, text.length, index++, page.number))
      break
    }

    const ideal = cursor + TARGET_CHARS
    const limit = cursor + MAX_CHARS

    // Ein Absatzumbruch in der Nähe der Zielgröße ist die beste Trennstelle:
    // dort endet mit hoher Wahrscheinlichkeit auch ein Gedanke.
    const paragraph = text.lastIndexOf('\n\n', limit)
    let end =
      paragraph > cursor + MIN_CHARS && paragraph <= limit
        ? paragraph + 2
        : (findSentenceEnd(text, Math.min(ideal, limit), cursor + MIN_CHARS) ??
          findWordEnd(text, limit, cursor + MIN_CHARS))

    // Sicherheitsnetz gegen einen Stillstand: käme keine Trennstelle zustande,
    // liefe die Schleife endlos.
    if (end <= cursor) end = Math.min(limit, text.length)

    const abschnitt = alsChunk(text, cursor, end, index, page.number)
    if (abschnitt.content.length > 0) {
      chunks.push(abschnitt)
      index++
    }

    // Der nächste Abschnitt beginnt vor dem Ende des vorigen — an der ersten
    // Satzgrenze im Überlappungsfenster, nicht mitten im Wort.
    //
    // `cursor + 1` als Untergrenze ist kein Detail: ohne sie könnte der neue
    // Beginn auf den alten fallen und die Schleife stünde still.
    const overlapFrom = Math.max(cursor + 1, end - OVERLAP_CHARS)
    const overlapStart = findSentenceStartForward(text, overlapFrom, end) ?? overlapFrom
    cursor = overlapStart > cursor ? overlapStart : end
  }

  // Ein zu kurzer letzter Abschnitt wird dem vorigen zugeschlagen — aber nur,
  // wenn das Ergebnis die Obergrenze hält.
  //
  // Der Fall, der das nötig macht: ein Text aus 1600 Zeichen, dann viel
  // Leerraum, dann ein einzelnes Zeichen. Der letzte Abschnitt schrumpft beim
  // Trimmen auf ein Zeichen, und das blinde Zusammenlegen erzeugte einen
  // Abschnitt von 2000 Zeichen — über MAX_CHARS, das jeder andere Abschnitt
  // einhält.
  const last = chunks[chunks.length - 1]
  if (chunks.length > 1 && last && last.content.length < MIN_CHARS) {
    const previous = chunks[chunks.length - 2]!
    const merged = text.slice(previous.charStart, last.charEnd).trim()
    if (merged.length <= MAX_CHARS) {
      previous.content = merged
      previous.charEnd = last.charEnd
      chunks.pop()
    }
    // Passt es nicht, bleibt der kurze Abschnitt stehen. Ein Rest von wenigen
    // Zeichen ist unschön, ein Abschnitt über der Obergrenze ist ein Bruch
    // der Zusicherung, auf die sich alles Weitere verlässt.
  }

  return chunks
}

/**
 * Zerlegt ein ganzes Dokument.
 *
 * Seitengrenzen werden nie überschritten: ein Abschnitt gehört zu genau einer
 * Seite, sonst wäre die Seitenzahl im Zitat eine Lüge. Leere Seiten — bei
 * Scans der Normalfall — werden übersprungen.
 */
export function chunkDocument(pages: Page[]): Chunk[] {
  const chunks: Chunk[] = []
  for (const page of pages) {
    if (page.text.trim().length === 0) continue
    chunks.push(...chunkPage(page, chunks.length))
  }
  return chunks
}

/**
 * Ob ein Dokument genug Text enthält, um verarbeitet zu werden.
 *
 * Gedacht für gescannte PDFs: die haben Seiten, aber keine Textebene, und
 * `unpdf` liefert dann leere oder fast leere Zeichenketten. Ohne diese Prüfung
 * landete ein Scan als Quelle mit null Abschnitten in der Liste — sichtbar
 * „bereit", aber unbrauchbar, und niemand wüsste warum.
 */
export function hasUsableText(pages: Page[]): boolean {
  const total = pages.reduce((sum, p) => sum + p.text.trim().length, 0)
  return total >= MIN_CHARS
}
