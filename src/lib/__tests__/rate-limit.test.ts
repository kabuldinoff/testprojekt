/**
 * Prüft die Grenzen — nicht, dass sie existieren, sondern dass sie zueinander
 * passen.
 *
 * Eine Zahl allein lässt sich nicht testen; „40" ist weder richtig noch
 * falsch. Was sich prüfen lässt, sind die Verhältnisse, die die Begründungen
 * in `limits.ts` behaupten — und genau die gehen beim nächsten Nachjustieren
 * verloren, wenn niemand sie festhält.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GRENZEN, ZU_VIELE, type Bucket } from '../rate-limit/limits'

const TOEPFE = Object.keys(GRENZEN) as Bucket[]

/**
 * Kürzer als das ist keine Auskunft, sondern ein Schulterzucken.
 *
 * „Zu viele Anfragen." nennt weder, worum es geht, noch was der Nutzer tun
 * kann. Die Schwelle ist bewusst grob — sie soll keinen Stil erzwingen,
 * sondern verhindern, dass beim schnellen Nachbessern ein Zweiwortsatz
 * stehenbleibt.
 */
const MINDESTLAENGE_MELDUNG = 20

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260912000013_rate_limit.sql'),
  'utf8'
)

describe('die Grenzen', () => {
  it('decken genau die drei teuren Vorgänge ab', () => {
    // Kommt ein vierter Anbieter-Aufruf dazu, soll dieser Test daran erinnern,
    // dass er einen Topf braucht.
    expect(TOEPFE.sort()).toEqual(['audio', 'chat', 'ingest'])
  })

  it.each(TOEPFE)('%s hat eine Grenze, ein Fenster und einen Text', (topf) => {
    const g = GRENZEN[topf]
    expect(g.limit).toBeGreaterThan(0)
    expect(g.window).toMatch(/^\d+ (second|minute|hour|day)s?$/)
    expect(g.message.length).toBeGreaterThan(MINDESTLAENGE_MELDUNG)
  })

  it('die Zahlen stimmen mit der Datenbank überein', () => {
    // **Der wichtigste Test dieser Datei.**
    //
    // Maßgeblich sind die Werte in `consume_rate_limit`: Eine Drosselung,
    // deren Grenze der Aufrufer mitgibt, ist keine — die erste Fassung nahm
    // `p_limit` und `p_window` entgegen und war damit vollständig umgehbar.
    // `limits.ts` ist seitdem ein Spiegel, und ein Spiegel kann schief hängen.
    //
    // Gelesen wird die Migration als Text, nicht als ausgeführtes SQL: Der
    // Test soll ohne Datenbank laufen. Dasselbe Vorgehen wie bei den
    // Design-Tokens, die gegen `globals.css` geprüft werden.
    for (const topf of TOEPFE) {
      const zweig = new RegExp(
        `when '${topf}' then\\s*v_limit := (\\d+); v_window := interval '([^']+)'`
      ).exec(MIGRATION)

      expect(zweig, `kein Zweig für „${topf}" in der Migration`).not.toBeNull()
      expect(Number(zweig![1]), `${topf}: Grenze`).toBe(GRENZEN[topf].limit)
      expect(zweig![2], `${topf}: Fenster`).toBe(GRENZEN[topf].window)
    }
  })

  it('die Migration nimmt Grenze und Fenster nicht als Parameter entgegen', () => {
    // Die Gegenprobe zur Sicherheitslücke selbst. Stünde `p_limit` wieder in
    // der Signatur, wäre die Drosselung erneut umgehbar — und dieser Test
    // bliebe ohne die Zeile hier grün, weil die Werte daneben trotzdem
    // stimmten.
    const signatur = /create function public\.consume_rate_limit\(([^)]*)\)/.exec(MIGRATION)
    expect(signatur).not.toBeNull()
    expect(signatur![1]!.trim()).toBe('p_bucket text')
  })

  it('die Funktionen sind für Clients gesperrt, bis ausdrücklich gewährt', () => {
    // Postgres vergibt `execute` auf einer neuen Funktion standardmäßig an
    // `public`. Ohne Entzug stand `reap_rate_limits` **ohne Token** offen —
    // nachgemessen, bevor es korrigiert wurde.
    for (const fn of ['consume_rate_limit(text)', 'reap_rate_limits()']) {
      expect(MIGRATION, `kein revoke für ${fn}`).toContain(
        `revoke all on function public.${fn} from public, anon, authenticated`
      )
    }
    expect(MIGRATION).toContain(
      'grant execute on function public.consume_rate_limit(text) to authenticated'
    )
  })

  it('Audio ist der knappste Topf und zählt über 24 rollende Stunden', () => {
    // Die Begründung aus `limits.ts`: Das Kontingent der Sprachausgabe zeigt
    // sich erst als 429 vom Anbieter und ist dann für lange Zeit weg. Eine
    // Stundengrenze schützte davor nicht — sechs pro Stunde wären
    // vierundzwanzigmal sechs am Tag.
    expect(GRENZEN.audio.window).toBe('24 hours')
    expect(GRENZEN.audio.limit).toBe(6)
    expect(GRENZEN.audio.limit).toBeLessThan(GRENZEN.chat.limit)
    expect(GRENZEN.audio.limit).toBeLessThan(GRENZEN.ingest.limit)
  })

  it('Quellen und Fragen teilen sich das Stundenfenster', () => {
    // Beide sind Handlungen einer Arbeitssitzung und werden im selben Rhythmus
    // gemessen. Verschiedene Fenster hätten keinen Grund und wären nur eine
    // Zahl mehr, die man beim Nachjustieren übersieht.
    expect(GRENZEN.ingest.window).toBe('1 hour')
    expect(GRENZEN.chat.window).toBe('1 hour')

    // Eine Quelle kostet mehr als eine Frage: Parsen, Zerlegen und Einbetten
    // des ganzen Dokuments gegen ein Embedding für eine Zeile.
    expect(GRENZEN.ingest.limit).toBeLessThan(GRENZEN.chat.limit)
  })
})

describe('die Meldungen', () => {
  it.each(TOEPFE)('%s verspricht keinen Kalendertag', (topf) => {
    // Das Fenster ist rollend: Es beginnt beim ersten Vorgang und endet 24
    // Stunden später, nicht um Mitternacht. „Morgen geht es weiter" stand hier
    // und war damit für jeden falsch, der nach Mitternacht anfängt.
    expect(GRENZEN[topf].message).not.toMatch(/Morgen|Mitternacht|heute/i)
  })

  it.each(TOEPFE)('%s verspricht keine Uhrzeit, die niemand einhalten kann', (topf) => {
    // „In 23 Minuten geht es weiter" wäre eine Zusage über einen Zeitpunkt,
    // den die Anwendung gar nicht kennt: Das Fenster beginnt beim ersten
    // Vorgang, und wann das war, steht nur in der Datenbank. Eine falsche
    // Zeitangabe ist ärgerlicher als gar keine.
    expect(GRENZEN[topf].message).not.toMatch(/\d+\s*(Minute|Sekunde|Stunde)/i)
  })

  it.each(TOEPFE)('%s klingt nicht nach einem Defekt', (topf) => {
    // Der Nutzer hat nichts falsch gemacht und nichts ist kaputt. Worte wie
    // „Fehler" oder „gesperrt" schicken ihn auf die Suche nach einer Ursache,
    // die es nicht gibt.
    expect(GRENZEN[topf].message).not.toMatch(/Fehler|gesperrt|blockiert|verboten/i)
  })

  it('nennt beim Audio-Topf den Ausweg, der bleibt', () => {
    // Ein Überblick, der schon erzeugt wurde, ist weiterhin lesbar. Das zu
    // sagen ist der Unterschied zwischen einer Grenze und einer Sackgasse.
    expect(GRENZEN.audio.message).toMatch(/Transkript/)
  })
})

describe('der Status', () => {
  it('ist 429 und nicht 403', () => {
    // 403 hieße „nie wieder", 429 heißt „jetzt nicht". Ein Client, der beides
    // unterscheidet — und jeder gut gebaute tut das —, versucht es nur im
    // zweiten Fall erneut.
    expect(ZU_VIELE).toBe(429)
  })
})
