/**
 * Welche Zustände eines Audio-Überblicks „läuft gerade" bedeuten.
 *
 * Stand zuerst nur in der Oberfläche. Die Route braucht dieselbe Antwort,
 * seit sie vor dem Verbrauch des Kontingents nachsieht, ob überhaupt Arbeit
 * beginnt — und zwei Kopien derselben Menge sind zwei Orte, an denen ein
 * vierter Zustand vergessen werden kann.
 */
export const LAUFENDE_AUDIO_ZUSTAENDE: ReadonlySet<string> = new Set(['pending', 'processing'])
