/**
 * Die zwei Anbieter, die dieses Produkt kennt — als Daten, nicht als
 * Architektur.
 *
 * Bei zwei Einträgen wäre ein Adapter-Interface mit Factory und
 * Plugin-Auflösung mehr Code als die Sache selbst. Was hier steht, ist ein
 * typisierter Record: die Oberfläche liest daraus ihre Auswahl, die
 * Fähigkeiten steuern, was anklickbar ist, und der Datenfluss-Text ist die
 * Aussage, die der Nutzer über seine Daten bekommt.
 *
 * Was diese Datei bewusst *nicht* tut: Modelle instanziieren. Das passiert in
 * `chat.ts` und `tts.ts`, damit die Registry ohne Schlüssel importierbar
 * bleibt — die Oberfläche braucht die Beschriftungen, nicht die Zugangsdaten.
 */

/**
 * Die Kennungen sind zugleich der in der Datenbank gespeicherte Wert — die
 * Prüfbedingung auf `notebooks.chat_provider` lässt genau diese beiden zu.
 * Deshalb `gemini` und nicht `google`: die Datenbank ist die ältere Festlegung,
 * und eine Umbenennung wäre eine Migration für nichts. Der Firmenname steht im
 * Label und im Datenfluss-Text, wo der Nutzer ihn braucht.
 */
export const PROVIDER_IDS = ['gemini', 'mistral'] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

/**
 * Der Standard. Google, weil nur dieser Anbieter die zweistimmige
 * Sprachausgabe für den Audio-Überblick kann — mit Mistral als Standard wäre
 * das auffälligste Merkmal des Produkts beim ersten Öffnen abgeschaltet.
 */
export const DEFAULT_PROVIDER: ProviderId = 'gemini'

export interface Provider {
  id: ProviderId
  label: string
  /** Kurz genug für die Zeile unter dem Namen in der Auswahl. */
  hint: string
  capabilities: {
    /** Zweistimmige Sprachausgabe. Nur Google kann das. */
    tts: boolean
  }
  /**
   * Was mit den Daten des Nutzers geschieht, in seinen Worten.
   *
   * Diese Sätze sind kein Marketing, sondern die Beschreibung des tatsächlich
   * gebauten Datenflusses. Ändert sich der Fluss, muss sich dieser Text mit
   * ändern — sonst steht hier eine Unwahrheit, und das ist schlimmer als
   * gar keine Angabe.
   */
  dataFlow: string
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    hint: 'Antworten und Audio-Überblick',
    capabilities: { tts: true },
    dataFlow:
      'Ihre Quellen werden in der EU indexiert (Mistral). Für Antworten und den ' +
      'Audio-Überblick werden die jeweils passenden Ausschnitte an Google übertragen. ' +
      'Google nutzt Daten aus dem kostenlosen Kontingent zur Produktverbesserung.'
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    hint: 'Vollständig in der EU',
    capabilities: { tts: false },
    dataFlow:
      'Vollständig in der EU. Indexierung und Antworten laufen über Mistral, ' +
      'keine Daten verlassen die EU. Der Audio-Überblick ist in dieser ' +
      'Einstellung nicht verfügbar.'
  }
}

/**
 * Die Indexierung ist an einen Anbieter gebunden und **nicht** umschaltbar.
 *
 * Das ist keine Bequemlichkeit, sondern Mathematik: Embeddings verschiedener
 * Modelle liegen in verschiedenen Vektorräumen. Ein Wechsel machte jeden
 * gespeicherten Vektor unvergleichbar und verlangte, sämtliche Quellen neu zu
 * verarbeiten. Deshalb steht die Wahl hier fest — und deshalb fällt sie auf
 * die EU, denn dies ist der einzige Schritt, der **jede Quelle vollständig**
 * durch einen Anbieter schickt. Der Chat sieht nur Ausschnitte.
 */
export const EMBEDDING_PROVIDER: ProviderId = 'mistral'

/** Prüft einen aus der Datenbank oder vom Client kommenden Wert. */
export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)
}

/** Fällt auf den Standard zurück, statt bei einem unbekannten Wert zu scheitern. */
export function providerOrDefault(value: unknown): Provider {
  return PROVIDERS[isProviderId(value) ? value : DEFAULT_PROVIDER]
}
