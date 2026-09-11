/**
 * Die Suche: aus einer Frage werden Ausschnitte.
 *
 * Zwei Schritte, und der zweite ist absichtlich dünn. Die eigentliche Arbeit
 * — semantisch und lexikalisch suchen und beides zusammenführen — steht als
 * SQL in Migration 0007 und läuft in der Datenbank. Sie in TypeScript zu
 * wiederholen hieße, zwei Kandidatenlisten über das Netz zu holen und im
 * Anwendungsprozess zu sortieren.
 *
 * Wichtig: Der Aufruf geht über den **RLS-Client** mit der Sitzung des
 * Nutzers. `match_chunks` ist `security invoker`, die Policy greift also im
 * Funktionsrumpf. Der Secret-Key-Client hat hier nichts zu suchen.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { embedQuery } from '@/lib/llm/embeddings'

import type { RetrievedChunk } from './citations'

/**
 * Wie viele Ausschnitte dem Modell vorgelegt werden.
 *
 * Zwölf ist ein Kompromiss zwischen zwei Fehlern: zu wenige, und die Antwort
 * verpasst eine Stelle, die im Dokument steht; zu viele, und die eigentliche
 * Fundstelle geht zwischen entfernt Verwandtem unter — Modelle antworten
 * messbar schlechter, je mehr nur halb Passendes im Kontext liegt.
 */
export const TOP_K = 12

interface MatchRow {
  id: string
  source_id: string
  source_title: string
  chunk_index: number
  content: string
  page_number: number | null
  char_start: number
  char_end: number
  score: number
}

/**
 * Ob die Auswahl überhaupt etwas treffen kann.
 *
 * Ein leeres Array heißt „keine Quelle ausgewählt" und liefert garantiert
 * nichts — das steht schon in der Bedingung der Suchfunktion. Ohne diese
 * Prüfung würde die Frage trotzdem erst eingebettet: ein Aufruf beim
 * Anbieter, dessen Ergebnis niemand benutzt. Schlimmer als die verbrauchten
 * Token ist der Fehlerpfad — schlägt das Einbetten fehl, antwortet die Route
 * mit 502, obwohl „dazu steht nichts in den ausgewählten Quellen" die
 * richtige und vollständig bestimmbare Antwort gewesen wäre.
 *
 * Als eigene Funktion, weil die Entscheidung ohne I/O fällt und damit prüfbar
 * sein soll.
 */
export function selectsNothing(sourceIds: string[] | null): boolean {
  return sourceIds !== null && sourceIds.length === 0
}

export interface Retrieval {
  chunks: RetrievedChunk[]
  /** Für das Verbrauchsprotokoll: das Einbetten der Frage kostet auch etwas. */
  embedTokens: number
}

/**
 * Sucht die passenden Ausschnitte eines Notebooks.
 *
 * `sourceIds === null` heißt „alle Quellen". Ein leeres Array heißt „keine"
 * und liefert korrekterweise nichts — hat der Nutzer alle Quellen abgewählt,
 * darf die Antwort nicht heimlich doch auf allen beruhen.
 */
export async function retrieveChunks(
  supabase: SupabaseClient,
  notebookId: string,
  question: string,
  sourceIds: string[] | null
): Promise<Retrieval> {
  if (selectsNothing(sourceIds)) return { chunks: [], embedTokens: 0 }

  const { vector, tokens } = await embedQuery(question)

  const { data, error } = await supabase.rpc('match_chunks', {
    p_notebook: notebookId,
    // pgvector nimmt über PostgREST die Textform entgegen. Ein JS-Array käme
    // als JSON-Array an und ließe sich nicht nach vector(1024) wandeln.
    p_embedding: JSON.stringify(vector),
    p_query: question,
    p_source_ids: sourceIds,
    p_k: TOP_K
  })

  if (error) {
    // Weiterwerfen statt eine leere Liste zurückzugeben: eine leere Liste
    // führte zu „dazu steht nichts in Ihren Quellen" — einer inhaltlichen
    // Aussage über die Dokumente, obwohl in Wahrheit die Suche ausgefallen
    // ist. Das ist die unehrlichste Form des Scheiterns.
    throw new Error(`Die Suche in den Quellen ist fehlgeschlagen: ${error.message}`)
  }

  const chunks = ((data ?? []) as MatchRow[]).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    chunkIndex: r.chunk_index,
    content: r.content,
    pageNumber: r.page_number,
    charStart: r.char_start,
    charEnd: r.char_end
  }))

  return { chunks, embedTokens: tokens }
}
