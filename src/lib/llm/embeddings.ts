/**
 * Embeddings — der eine Schritt, der jede Quelle vollständig durch einen
 * fremden Dienst schickt.
 *
 * Genau deshalb liegt er fest bei Mistral (EU) und ist nicht umschaltbar:
 * siehe `EMBEDDING_PROVIDER` in `registry.ts`. Der Chat sieht nur die
 * gefundenen Ausschnitte, die Indexierung sieht alles.
 *
 * Was diese Datei bewusst nicht tut: Vektoren speichern oder suchen. Sie
 * erzeugt sie, mehr nicht.
 */
import { createMistral } from '@ai-sdk/mistral'
import { embed, embedMany } from 'ai'

import { aiEnv } from '@/lib/env'

/**
 * Die Dimension ist eine Eigenschaft des Modells, keine Einstellung.
 *
 * Sie steht als Konstante da, weil sie an drei Stellen zusammenpassen muss:
 * hier, in der Spaltendefinition `vector(1024)` und im Parametertyp der
 * Suchfunktion. Weichen sie ab, meldet Postgres „expected 1024 dimensions",
 * und zwar erst beim Schreiben der ersten Quelle.
 */
export const EMBEDDING_DIMENSIONS = 1024

/** `mistral-embed` liefert genau EMBEDDING_DIMENSIONS Werte. */
export const EMBEDDING_MODEL = 'mistral-embed'

/**
 * Warum hier nichts zu bündeln oder zu drosseln ist — nachgeschlagen, nicht
 * angenommen.
 *
 * `embedMany` teilt die Eingaben selbst auf, und zwar nach einer Eigenschaft
 * des Anbieters: `MistralEmbeddingModel.maxEmbeddingsPerCall = 32`. Derselbe
 * Anbieter meldet `supportsParallelCalls = false`, das SDK schickt die Pakete
 * also nacheinander. Ein Dokument mit 150 Abschnitten sind damit 5 Anfragen
 * in Folge — gegen ein gemessenes Kontingent von 60 pro Minute.
 *
 * Der naheliegende Griff wäre `maxParallelCalls` gewesen. Das ist eine Falle:
 * die Option begrenzt **gleichzeitige Anfragen**, nicht die Paketgröße. Mit
 * einem dort eingetragenen Hundert wären es hundert parallele Aufrufe
 * gewesen, und das Kontingent wäre in der ersten Sekunde erschöpft.
 */

function model() {
  const env = aiEnv()
  return createMistral({
    apiKey: env.mistralApiKey,
    // Nur in den End-to-End-Tests gesetzt; siehe `aiEnv()`.
    ...(env.mistralBaseUrl ? { baseURL: env.mistralBaseUrl } : {})
  }).textEmbeddingModel(EMBEDDING_MODEL)
}

/**
 * Prüft, was der Anbieter zurückgegeben hat, bevor es in die Datenbank geht.
 *
 * Ohne diese Prüfung landete eine abweichende Dimension als Postgres-Fehler
 * im Verarbeitungsprotokoll — mit einer Meldung, die auf die Datenbank zeigt,
 * während die Ursache beim Modell liegt. Ein Anbieter, der sein Ausgabeformat
 * ändert, ist kein hypothetischer Fall; das Chat-Modell dieses Projekts wurde
 * während der Entwicklung zurückgezogen.
 */
function assertDimensions(vectors: number[][]): void {
  const abweichend = vectors.findIndex((v) => v.length !== EMBEDDING_DIMENSIONS)
  if (abweichend !== -1) {
    throw new Error(
      `${EMBEDDING_MODEL} lieferte ${vectors[abweichend]!.length} statt ${EMBEDDING_DIMENSIONS} Dimensionen. ` +
        'Passt das Modell nicht mehr zum Schema, müssen Spalte, Suchfunktion und Konstante gemeinsam wechseln — und alle Quellen neu verarbeitet werden.'
    )
  }
}

export interface EmbeddingBatch {
  vectors: number[][]
  /** Für `llm_calls`: was der Vorgang gekostet hat. */
  tokens: number
}

/** Bettet die Abschnitte eines Dokuments ein. Reihenfolge bleibt erhalten. */
export async function embedChunks(texts: string[]): Promise<EmbeddingBatch> {
  if (texts.length === 0) return { vectors: [], tokens: 0 }

  const { embeddings, usage } = await embedMany({ model: model(), values: texts })

  assertDimensions(embeddings)
  return { vectors: embeddings, tokens: usage.tokens ?? 0 }
}

/**
 * Bettet eine Frage ein.
 *
 * Getrennt von `embedChunks`, obwohl beide dasselbe Modell benutzen: Mistral
 * kennt keine Unterscheidung zwischen Dokument- und Anfrage-Einbettung, aber
 * der Aufrufer soll das nicht wissen müssen. Käme das Modell je auf die
 * asymmetrische Variante (Gemini hat sie als `taskType`), ändert sich genau
 * diese Funktion.
 */
export async function embedQuery(text: string): Promise<{ vector: number[]; tokens: number }> {
  const { embedding, usage } = await embed({ model: model(), value: text })
  assertDimensions([embedding])
  return { vector: embedding, tokens: usage.tokens ?? 0 }
}
