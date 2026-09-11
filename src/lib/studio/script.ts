/**
 * Das Gesprächsskript für den Audio-Überblick — erzeugen lassen und prüfen.
 *
 * Rein: kein Netz, keine Datenbank. Die Prüfung ist der Grund, warum diese
 * Datei existiert. Sie steht zwischen dem Modell, das den Text schreibt, und
 * der Sprachausgabe, die ihn vorliest — und beide haben eine Abmachung, die
 * nirgends erzwungen wird.
 */

/**
 * Die beiden Stimmen. **Genau zwei, nicht mehr.**
 *
 * Die Multi-Speaker-Schnittstelle von Google nimmt zwei Sprecher entgegen und
 * mehr nicht. Ein Drei-Personen-Format ist also keine Gestaltungsfrage,
 * sondern technisch ausgeschlossen — deshalb steht es hier als Konstante und
 * nicht als Einstellung.
 *
 * Die Namen müssen **zeichengenau** denen in `speakerVoiceConfigs` des
 * TTS-Aufrufs entsprechen. Stimmen sie nicht überein, liest das Modell
 * „Alex:" als Wort vor, statt die Zeile der Stimme zuzuordnen. Das ist der
 * häufigste stille Fehler dieser Schnittstelle: es klingt nach einem
 * schlechten Vorleser, nicht nach einem Konfigurationsfehler. Deshalb kommen
 * die Namen aus dieser einen Quelle.
 */
export const SPEAKERS = ['Alex', 'Sam'] as const

export type Speaker = (typeof SPEAKERS)[number]

/**
 * Obergrenze für das Skript in Zeichen.
 *
 * Gemessen an einer echten Ausgabe: 196 Zeichen Skript ergaben 14,3 Sekunden
 * Audio, also rund 13,7 Zeichen je Sekunde. Drei Minuten sind damit etwa
 * 2.400 Zeichen.
 *
 * Warum überhaupt ein Deckel: Bei 24 kHz, 16 Bit und Mono sind es 2,75 MB je
 * Minute — nachgemessen, nicht geschätzt. Ohne Grenze füllt eine Handvoll
 * Überblicke das Gigabyte des kostenlosen Tarifs. Drei Minuten sind zugleich
 * die Länge, die jemand tatsächlich anhört.
 */
export const MAX_SCRIPT_CHARS = 2400

/** Grob 13,7 Zeichen je Sekunde — für die Anzeige „etwa 2:30 Minuten". */
export const CHARS_PER_SECOND = 13.7

export interface ScriptSource {
  title: string
  /** Die Ausschnitte dieser Quelle, in Dokumentreihenfolge. */
  excerpts: string[]
}

/**
 * Wie viel Quelltext in die Skripterzeugung geht.
 *
 * Reichlich, weil ein Überblick das Ganze überblicken soll — aber nicht
 * unbegrenzt, weil sonst ein einzelnes großes Dokument alle anderen
 * verdrängt. Jede Quelle bekommt denselben Anteil, damit ein Überblick über
 * fünf Quellen nicht faktisch einer über die längste wird.
 */
export const MAX_CONTEXT_CHARS = 30_000

/**
 * Baut den Quelltextblock: jede Quelle mit Titel, gleichmäßig gekürzt.
 *
 * Die Gleichverteilung ist der Punkt. Die naheliegende Variante — alles
 * aneinanderhängen und hinten abschneiden — ergäbe bei einem 200-seitigen PDF
 * und drei Notizen einen Überblick, der die Notizen nie erwähnt. Und niemand
 * sähe warum.
 */
export function buildSourceDigest(sources: ScriptSource[]): string {
  if (sources.length === 0) return ''

  const proQuelle = Math.floor(MAX_CONTEXT_CHARS / sources.length)

  return sources
    .map((quelle) => {
      let text = ''
      for (const ausschnitt of quelle.excerpts) {
        if (text.length + ausschnitt.length > proQuelle) break
        text += ausschnitt + '\n'
      }
      // Reicht schon der erste Ausschnitt über das Budget, wird er
      // abgeschnitten — sonst käme eine Quelle mit sehr langen Abschnitten
      // gar nicht vor.
      if (text.length === 0 && quelle.excerpts[0]) {
        text = quelle.excerpts[0].slice(0, proQuelle)
      }
      return `## ${quelle.title}\n${text.trim()}`
    })
    .join('\n\n')
}

/**
 * Die Anweisung an das Modell.
 *
 * Das Format ist keine Kosmetik: Die Sprachausgabe erkennt die Sprecher
 * ausschließlich an diesen Präfixen. Deshalb steht die Form vor dem Inhalt,
 * und deshalb wird das Ergebnis anschließend geprüft, statt darauf zu
 * vertrauen.
 */
export function scriptPrompt(digest: string): string {
  const [a, b] = SPEAKERS
  return [
    'Schreibe ein kurzes Gespräch zwischen zwei Personen, die den folgenden',
    'Quelltext für jemanden zusammenfassen, der ihn nicht gelesen hat.',
    '',
    'Form — zwingend:',
    `- Jede Zeile beginnt mit exakt "${a}:" oder "${b}:", gefolgt von einem Leerzeichen.`,
    '- Keine anderen Namen, keine Überschriften, keine Regieanweisungen,',
    '  keine Klammern, kein Markdown, keine Aufzählungszeichen.',
    `- Höchstens ${MAX_SCRIPT_CHARS} Zeichen insgesamt.`,
    '',
    'Inhalt:',
    `- ${a} führt durch das Thema, ${b} fragt nach und fasst zusammen.`,
    '- Nur, was im Quelltext steht. Nichts hinzuerfinden.',
    '- Zahlen und Eigennamen genau übernehmen.',
    '- Deutsch, gesprochene Sprache, keine Schachtelsätze.',
    '- Beginne ohne Begrüßung mitten im Thema und ende mit einem Fazit.',
    '',
    'Quelltext:',
    '',
    digest
  ].join('\n')
}

export type ScriptProblem = 'leer' | 'zeile-ohne-sprecher' | 'nur-ein-sprecher' | 'zu-lang'

export const SCRIPT_PROBLEM_MESSAGES: Record<ScriptProblem, string> = {
  leer: 'Das Modell hat kein Skript geliefert.',
  'zeile-ohne-sprecher': 'Das Skript hält die vorgegebene Form nicht ein.',
  'nur-ein-sprecher': 'Das Skript enthält nur eine Stimme.',
  'zu-lang': 'Das Skript ist zu lang für einen Überblick.'
}

export interface ScriptCheck {
  ok: boolean
  problem?: ScriptProblem
  /** Bereinigtes Skript — nur gesetzt, wenn `ok`. */
  script?: string
  /** Geschätzte Länge in Sekunden. */
  seconds?: number
}

/**
 * Räumt auf, was Modelle gerne zusätzlich liefern.
 *
 * Fettdruck um den Namen, eine Überschrift davor, eine Regieanweisung in
 * Klammern. Nichts davon ist ein Fehler des Modells — die Anweisung verbietet
 * es zwar, aber darauf zu vertrauen hieße, das Ergebnis vom Wohlwollen eines
 * Textgenerators abhängig zu machen. Entfernt wird deshalb, was sich sicher
 * entfernen lässt; alles andere fällt durch die Prüfung.
 */
function tidy(raw: string): string {
  return raw
    .replace(/```[a-z]*\n?/gi, '')
    .split('\n')
    .map((zeile) =>
      zeile
        .trim()
        // **Alex:** oder *Alex:* → Alex:
        .replace(/^\*{1,2}([A-Za-zÄÖÜäöü]+)\*{0,2}\s*:\s*\*{0,2}/, '$1: ')
        // Regieanweisungen: (lacht), [Pause]
        .replace(/[([][^)\]]{0,60}[)\]]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter((zeile) => zeile.length > 0)
    .join('\n')
}

/**
 * Prüft, ob das Skript vorgelesen werden kann.
 *
 * Die Prüfung läuft **vor** dem TTS-Aufruf, und das ist ihr ganzer Sinn: Ein
 * Skript mit falschen Präfixen erzeugt kein Fehlerbild, sondern eine
 * Audiodatei, in der jemand „Alex Doppelpunkt" vorliest. Das fällt erst beim
 * Anhören auf — nach dem teuersten Schritt der ganzen Kette.
 */
export function checkScript(raw: string): ScriptCheck {
  const script = tidy(raw)
  if (script.length === 0) return { ok: false, problem: 'leer' }

  const erlaubt = new RegExp(`^(${SPEAKERS.join('|')}): \\S`)
  const gesehen = new Set<string>()

  for (const zeile of script.split('\n')) {
    const treffer = erlaubt.exec(zeile)
    if (!treffer) return { ok: false, problem: 'zeile-ohne-sprecher' }
    gesehen.add(treffer[1]!)
  }

  // Ein Gespräch mit einer Stimme ist ein Vortrag. Die zweite Stimme ist der
  // Grund, warum dieses Format überhaupt gewählt wurde.
  if (gesehen.size < 2) return { ok: false, problem: 'nur-ein-sprecher' }

  if (script.length > MAX_SCRIPT_CHARS) return { ok: false, problem: 'zu-lang' }

  return { ok: true, script, seconds: Math.round(script.length / CHARS_PER_SECOND) }
}

/**
 * Zerlegt ein Skript für die Anzeige als Transkript.
 *
 * Dieselbe Regel wie die Prüfung, damit Anzeige und Vertonung nicht
 * auseinanderlaufen können.
 */
export function parseScript(script: string): Array<{ speaker: string; text: string }> {
  const muster = new RegExp(`^(${SPEAKERS.join('|')}): (.*)$`)
  return script
    .split('\n')
    .map((zeile) => muster.exec(zeile.trim()))
    .filter((t): t is RegExpExecArray => t !== null)
    .map((t) => ({ speaker: t[1]!, text: t[2]! }))
}
