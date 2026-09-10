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
