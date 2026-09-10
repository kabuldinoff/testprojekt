/**
 * Die Modellinstanz für den Chat — die einzige Stelle, die beide Anbieter-SDKs
 * kennt.
 *
 * Zwei Zeilen in einem `switch`. Ein Adapter-Interface mit Registrierung und
 * Auflösung wäre hier mehr Code als die Sache selbst; kommt je ein dritter
 * Anbieter dazu, ist das ein weiterer Zweig und kein Umbau.
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import type { LanguageModel } from 'ai'

import { aiEnv } from '@/lib/env'

import type { ProviderId } from './registry'

export interface ChatModel {
  model: LanguageModel
  /** Für `messages.model` und das Verbrauchsprotokoll. */
  modelId: string
}

export function chatModel(provider: ProviderId): ChatModel {
  const env = aiEnv()

  switch (provider) {
    case 'gemini': {
      const modelId = env.googleChatModel
      return {
        model: createGoogleGenerativeAI({
          apiKey: env.googleApiKey,
          ...(env.googleBaseUrl ? { baseURL: env.googleBaseUrl } : {})
        })(modelId),
        modelId
      }
    }
    case 'mistral': {
      const modelId = env.mistralChatModel
      return {
        model: createMistral({
          apiKey: env.mistralApiKey,
          ...(env.mistralBaseUrl ? { baseURL: env.mistralBaseUrl } : {})
        })(modelId),
        modelId
      }
    }
  }
}
