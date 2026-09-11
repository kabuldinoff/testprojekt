/**
 * Die Form der Nachrichten zwischen Route und Oberfläche.
 *
 * Steht in `src/lib/`, weil beide Seiten sie brauchen und keine der Seite der
 * anderen gehören soll: die Route schreibt den Beleg-Teil in den Strom, die
 * Komponente liest ihn. Wären die Typen in der Komponente, importierte die
 * Route aus dem Client-Code.
 */
import type { UIMessage } from 'ai'

import type { Citation } from './citations'

/**
 * Die Ausschnitte, die dem Modell vorlagen — ohne die Passage selbst wäre ein
 * Klick auf `[1]` nur eine Zahl.
 *
 * Dieselbe Form wie `Citation`, und das ist Absicht: die Oberfläche stellt
 * live und nach dem Neuladen dasselbe dar, ohne zwei Zweige.
 */
export type StreamedSource = Citation

/**
 * Der Nachrichtentyp dieses Chats.
 *
 * Die Belege reisen als eigener Datenteil (`data-sources`) im selben Strom
 * wie der Text und werden **vor** dem ersten Zeichen geschrieben. Dadurch
 * kann `[1]` schon während des Strömens als anklickbarer Beleg erscheinen,
 * statt am Ende nachzuspringen.
 */
export type NotabeneMessage = UIMessage<never, { sources: StreamedSource[] }>

/** Holt die Belege aus einer Nachricht — oder eine leere Liste. */
export function sourcesOf(message: NotabeneMessage): StreamedSource[] {
  for (const part of message.parts) {
    if (part.type === 'data-sources') return part.data
  }
  return []
}

/** Fügt die Textteile einer Nachricht zusammen. */
export function textOf(message: NotabeneMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

/** Eine Nachricht, wie sie in der Datenbank steht. */
export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
}

/**
 * Übersetzt eine gespeicherte Nachricht in die Form, die `useChat` erwartet.
 *
 * Die Belege reisen im selben Datenteil wie bei einer frisch geströmten
 * Antwort. Dadurch stellt die Oberfläche beide Fälle mit demselben Code dar —
 * es gibt keinen „alte Nachricht"-Zweig, der veralten könnte.
 *
 * Steht hier und nicht in der Komponente, weil die Umwandlung ohne I/O
 * entscheidbar ist: eine reine Funktion mit einem Test daneben. In der
 * Komponente wäre sie nur über einen gerenderten Baum prüfbar.
 */
export function storedToUi(m: StoredMessage): NotabeneMessage {
  return {
    id: m.id,
    role: m.role,
    parts:
      m.role === 'assistant'
        ? [
            { type: 'data-sources', data: m.citations },
            { type: 'text', text: m.content }
          ]
        : [{ type: 'text', text: m.content }]
  }
}
