/**
 * Die Grenzen für teure Vorgänge — die Zahlen und ihre Begründung.
 *
 * Das Zählen selbst macht Postgres (`consume_rate_limit`, Migration 0013);
 * hier steht nur, **wie viel wovon** und **was der Nutzer liest**, wenn es
 * nicht mehr geht. Beides ist ohne Netz entscheidbar und deshalb hier, wo es
 * sich prüfen lässt.
 *
 * ── Wonach die Zahlen gewählt sind ───────────────────────────────────────
 *
 * Nicht nach dem, was ein Anbieter erlaubt, sondern nach dem, was ein Mensch
 * in einer Stunde tut. Wer eine Vorführung hält, stellt vielleicht zwanzig
 * Fragen; wer ein Dokument durcharbeitet, vielleicht vierzig. Alles darüber
 * ist kein Gebrauch mehr, sondern ein Skript, ein Neulade-Reflex oder eine
 * offene Schleife — und genau das soll die Grenze abfangen.
 *
 * Sie sind bewusst großzügig. Eine Drosselung, die den ehrlichen Nutzer trifft,
 * wird zum Fehler, den niemand meldet, weil er wie ein Defekt aussieht.
 */

/** Ein Topf. Der Name steht so auch in `rate_limits.bucket`. */
export type Bucket = 'chat' | 'ingest' | 'audio'

/**
 * **Spiegel, nicht Quelle.**
 *
 * `limit` und `window` stehen maßgeblich in `consume_rate_limit`
 * (Migration 0013) — sie müssen dort stehen, weil eine Drosselung, deren
 * Parameter der Gedrosselte mitbringt, keine ist. Hier stehen sie, damit die
 * Tests und der Testaufbau die Zahlen kennen, ohne SQL zu lesen.
 *
 * Zwei Orte heißen: Sie können auseinanderlaufen.
 * `src/lib/__tests__/rate-limit.test.ts` liest deshalb die Migration und
 * vergleicht — dasselbe Vorgehen wie bei den Design-Tokens, die gegen
 * `globals.css` geprüft werden.
 *
 * `window` ist ein Postgres-Intervall in genau der Schreibweise, die in der
 * Migration steht; der Vergleich ist wörtlich.
 */
export interface Grenze {
  limit: number
  window: string
  message: string
}

export const GRENZEN: Record<Bucket, Grenze> = {
  /**
   * Chat: 40 Fragen pro Stunde.
   *
   * Eine Frage kostet einen Embedding-Aufruf für die Suche und einen
   * Chat-Aufruf für die Antwort. Vierzig davon sind mehr, als ein Gespräch in
   * einer Stunde hergibt — gemessen an den bisherigen Läufen liegt eine
   * ausgiebige Sitzung bei zehn bis fünfzehn.
   */
  chat: {
    limit: 40,
    window: '1 hour',
    message:
      'Sie haben in der letzten Stunde sehr viele Fragen gestellt. In einer Weile geht es weiter.'
  },

  /**
   * Verarbeitung: 30 Quellen pro Stunde.
   *
   * Der Datenbank-Trigger deckelt ein Notebook bereits bei zwanzig Quellen —
   * diese Grenze gilt über **alle** Notebooks und fängt den Fall ab, den der
   * Trigger nicht sieht: fünfzig neue Notebooks mit je einer Quelle.
   *
   * Etwas niedriger als beim Chat, obwohl Hochladen in Schüben kommt: Wer ein
   * Projekt anlegt, wirft zehn Dateien auf einmal hinein. Eine Quelle kostet
   * aber mehr als eine Frage — Parsen, Zerlegen und Einbetten des **ganzen**
   * Dokuments statt eines Embeddings für eine Zeile. Dreißig Dokumente in
   * einer Stunde sind bereits viel.
   */
  ingest: {
    limit: 30,
    window: '1 hour',
    message:
      'Sie haben in der letzten Stunde sehr viele Quellen hinzugefügt. In einer Weile geht es weiter.'
  },

  /**
   * Audio: 6 Überblicke pro Tag.
   *
   * Der knappste Topf im ganzen Projekt, und als einziger auf **24 rollende
   * Stunden** gestellt — nicht auf einen Kalendertag. Das Tageskontingent der Sprachausgabe ist von Google nicht
   * dokumentiert und zeigt sich erst als 429; ist es erschöpft, ist es für den
   * Rest des Tages weg. Eine Stundengrenze schützte davor nicht — sechs pro
   * Stunde wären vierundzwanzig mal sechs am Tag.
   *
   * Sechs reichen für eine Vorführung mit Wiederholungen und liegen weit unter
   * dem, was einen Tag leeren kann.
   */
  audio: {
    limit: 6,
    window: '24 hours',
    message:
      'Es wurden bereits mehrere Audio-Überblicke erzeugt. Später geht es weiter — das Transkript bestehender Überblicke bleibt lesbar.'
  }
}

/**
 * Der HTTP-Status für eine erschöpfte Grenze.
 *
 * 429 und nicht 403: Der Zugriff ist nicht verboten, er ist **jetzt** nicht
 * möglich. Ein Client, der beides unterscheidet — und jeder gut gebaute tut
 * das —, wiederholt bei 429 später und bei 403 nie wieder.
 */
export const ZU_VIELE = 429
