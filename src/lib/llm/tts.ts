/**
 * Sprachausgabe — der einzige Schritt, den nur ein Anbieter kann.
 *
 * Zweistimmig in einem Aufruf gibt es bei Google; Mistral hat keine
 * Sprachausgabe. Das ist der Grund für das `capabilities.tts`-Flag in der
 * Registry und dafür, dass Gemini die Voreinstellung ist: Mit Mistral als
 * Standard wäre das auffälligste Merkmal des Produkts beim ersten Öffnen
 * abgeschaltet.
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateSpeech } from 'ai'

import { aiEnv, ttsEnv } from '@/lib/env'
import { SPEAKERS, type Speaker } from '@/lib/studio/script'

/**
 * Welche Stimme zu welcher Rolle gehört.
 *
 * Zwei deutlich unterschiedliche Stimmen, damit ein Zuhörer die Sprecher
 * auseinanderhält, ohne auf die Namen zu achten. `Kore` ist ruhiger und führt,
 * `Puck` heller und fragt nach.
 *
 * Die Schlüssel sind an `SPEAKERS` gebunden: Der Name im Skript und der Name
 * hier müssen zeichengenau übereinstimmen, sonst liest das Modell „Alex:" als
 * Wort vor. Der Typ erzwingt das — ein Name, den `SPEAKERS` nicht kennt,
 * lässt sich hier gar nicht eintragen.
 */
const VOICES: Record<Speaker, string> = {
  Alex: 'Kore',
  Sam: 'Puck'
}

export interface SpokenAudio {
  bytes: Uint8Array
  /** Vom SDK gesetzt; erwartet wird `wav`. */
  format: string
  mediaType: string
}

/**
 * Vertont ein geprüftes Skript.
 *
 * Erwartet ein Skript, das `checkScript` bestanden hat. Diese Funktion prüft
 * es nicht noch einmal: Die Prüfung gehört vor den Aufruf, weil sie sonst den
 * teuersten Schritt der Kette erst nach dem Bezahlen absichern würde.
 */
export async function speak(script: string): Promise<SpokenAudio> {
  const env = aiEnv()

  const ergebnis = await generateSpeech({
    model: createGoogleGenerativeAI({
      apiKey: env.googleApiKey,
      ...(env.googleBaseUrl ? { baseURL: env.googleBaseUrl } : {})
    }).speech(ttsEnv().model),
    text: script,
    providerOptions: {
      google: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: SPEAKERS.map((speaker) => ({
            speaker,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[speaker] } }
          }))
        }
      }
    }
  })

  // Nachgemessen: Das SDK liefert bereits einen fertigen WAV-Container
  // (RIFF-Header, `audio/wav`), obwohl die Google-API rohes PCM
  // (`audio/l16; rate=24000`) zurückgibt. Der Header muss also nicht selbst
  // geschrieben werden — eine Annahme aus der Planung, die sich beim Messen
  // erledigt hat.
  return {
    bytes: ergebnis.audio.uint8Array,
    format: ergebnis.audio.format,
    mediaType: ergebnis.audio.mediaType
  }
}

/**
 * Sekunden aus der Dateigröße.
 *
 * 24 kHz, 16 Bit, Mono — also 48.000 Bytes je Sekunde. Gemessen an einer
 * echten Ausgabe: 685.484 Bytes ergaben 14,3 Sekunden. Die 44 Bytes
 * WAV-Header fallen dabei nicht ins Gewicht, werden aber abgezogen, damit die
 * Zahl bei sehr kurzen Ausgaben nicht daneben liegt.
 */
export const WAV_BYTES_PER_SECOND = 48_000

export function durationSeconds(bytes: number): number {
  return Math.max(1, Math.round((bytes - 44) / WAV_BYTES_PER_SECOND))
}
