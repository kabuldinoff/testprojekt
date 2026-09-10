/**
 * Protokoll der Modellaufrufe.
 *
 * Der Zweck ist nicht Abrechnung — im kostenlosen Kontingent ist der Betrag
 * null. Der Zweck ist, ein Ausreißen zu bemerken: eine Quelle, die in einer
 * Schleife neu verarbeitet wird, oder ein Nutzer, der das Tageskontingent
 * allein aufbraucht, fällt hier als Zeilenzahl auf und sonst nirgends.
 *
 * Gespeichert werden Token, keine Beträge. Token liefert der Anbieter, sie
 * sind überprüfbar; ein Preis wäre eine abgetippte Zahl, die still veraltet.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { ProviderId } from './registry'

export interface LlmCall {
  userId: string
  notebookId: string | null
  kind: 'embed' | 'chat' | 'tts'
  provider: ProviderId
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}

/**
 * Schreibt eine Zeile ins Protokoll.
 *
 * Nimmt den Secret-Key-Client entgegen, weil es für `llm_calls` bewusst kein
 * Schreibrecht für Nutzer gibt: ein Verbrauchsnachweis, den der Verbraucher
 * selbst anlegt, ließe sich weglassen.
 *
 * Scheitert der Eintrag, wird das protokolliert und weitergearbeitet. Eine
 * Antwort zu verwerfen, weil ihre Buchführung nicht klappte, wäre der falsche
 * Tausch — der Nutzer verlöre etwas Echtes für eine Statistik.
 */
export async function logLlmCall(admin: SupabaseClient, call: LlmCall): Promise<void> {
  const { error } = await admin.from('llm_calls').insert({
    user_id: call.userId,
    notebook_id: call.notebookId,
    kind: call.kind,
    provider: call.provider,
    model: call.model,
    input_tokens: call.inputTokens,
    output_tokens: call.outputTokens,
    duration_ms: call.durationMs
  })

  if (error) console.error('[llm] Aufruf konnte nicht protokolliert werden', error)
}
