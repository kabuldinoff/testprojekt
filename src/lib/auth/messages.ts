/**
 * Was der Nutzer nach einer Registrierung liest — rein, ohne I/O.
 *
 * ── Warum das eine eigene Datei ist ───────────────────────────────────────
 *
 * Weil hier zwei Dinge zusammenkommen, die man einzeln leicht falsch macht:
 * Ehrlichkeit gegenüber dem Nutzer und Verschwiegenheit gegenüber einem
 * Fremden. Die Abwägung gehört an eine Stelle, wo man sie lesen und prüfen
 * kann, und nicht in eine Kette von `if`s in einer Server Action.
 *
 * ── Die Abwägung ─────────────────────────────────────────────────────────
 *
 * Eine schon vergebene Adresse wird **nicht als solche benannt**. Sonst wird
 * das Formular zum Abfragedienst: Wer wissen will, ob jemand hier ein Konto
 * hat, tippt dessen Adresse ein und liest die Antwort ab. Dieselbe Überlegung
 * steht schon bei der Anmeldung, wo „Konto gibt es nicht" und „Passwort
 * falsch" bewusst dieselbe Meldung ergeben.
 *
 * ── Was sich geändert hat, als die Bestätigung abgeschaltet wurde ─────────
 *
 * Vorher gab dieser Zweig **dieselbe** Antwort wie eine gelungene
 * Registrierung: „Wir haben eine Bestätigung geschickt." Beide Fälle sahen
 * damit gleich aus, und das war die stärkste Form von Verschwiegenheit.
 *
 * Ohne Bestätigungsmail geht das nicht mehr, und zwar nicht aus Nachlässigkeit:
 * Eine gelungene Registrierung **meldet jetzt sofort an** und springt in den
 * Arbeitsbereich. Eine vergebene Adresse kann das nicht — die beiden Ausgänge
 * sind von außen zwangsläufig verschieden. Wer weiter „Bestätigung geschickt"
 * anzeigte, würde nicht schweigen, sondern lügen: Es kommt keine Mail, und der
 * Nutzer wartet auf etwas, das es nicht gibt.
 *
 * Geblieben ist deshalb die schwächere, aber ehrliche Form: Die Meldung
 * **behauptet nicht**, dass es das Konto gibt, und nennt trotzdem den einzigen
 * Weg, der weiterhilft.
 *
 * Alles andere darf und soll benannt werden. Die vorige Fassung gab für
 * **jeden** Fehler „Registrierung nicht möglich. Bitte später erneut
 * versuchen." zurück — auch für das E-Mail-Kontingent, das projektweit bei
 * zwei Nachrichten pro Stunde liegt. Gemessen: Nach zwei Registrierungen war
 * auch eine völlig neue Adresse blockiert, und der Nutzer erfuhr weder den
 * Grund noch, dass Warten hilft.
 */

/** Was die Registrierung dem Nutzer antwortet. */
export interface SignUpOutcome {
  /** Anzuzeigende Meldung. */
  message: string
  /** Ob sie als Erfolg dargestellt wird — siehe `bereitsVergeben`. */
  ok: boolean
}

/**
 * Der Text, der nach einer angenommenen Registrierung erscheint.
 *
 * Er nennt die eingegebene Adresse. Das ist kein Schmuck: Wer sich vertippt
 * hat, sucht sonst in einem Postfach, in das nie etwas geschickt wurde — und
 * die Adresse steht nach dem Absenden nirgends mehr, weil React das Formular
 * zurücksetzt.
 */
export function bestaetigungAngefordert(email: string): string {
  return `Fast geschafft — wir haben eine Bestätigung an ${email} geschickt. Öffne den Link darin, dann geht es direkt weiter.`
}

/**
 * Fehlercodes, die GoTrue zurückgibt und die wir unterscheiden.
 *
 * Nachgemessen gegen den lokalen Stack und gegen Produktion, nicht aus der
 * Dokumentation abgeschrieben — lokal antwortet dieselbe Situation mit einem
 * anderen Code als in Produktion.
 */
const BEREITS_VERGEBEN = new Set(['user_already_exists', 'email_exists'])
const KONTINGENT = new Set(['over_email_send_rate_limit', 'over_request_rate_limit'])

/**
 * Übersetzt einen Registrierungsfehler in das, was der Nutzer sieht.
 *
 * `code` ist `error.code` aus dem Supabase-Client, `message` die Rohmeldung —
 * sie wird nur als Rückfallebene für die Erkennung benutzt, **nie** angezeigt:
 * Sie ist englisch, technisch und kann sich zwischen zwei GoTrue-Versionen
 * ändern.
 *
 * Nimmt die Adresse **nicht** entgegen, seit keine Meldung sie mehr nennt. Eine
 * Adresse neben „kein Konto möglich" liest sich wie eine Bestätigung, auch wenn
 * der Satz das Gegenteil sagt. Genannt wird sie nur im Erfolgsfall, und dafür
 * gibt es `bestaetigungAngefordert`.
 */
export function signUpOutcome(
  code: string | undefined,
  message: string | undefined
): SignUpOutcome {
  const kennung = (code ?? '').toLowerCase()
  const roh = (message ?? '').toLowerCase()

  if (BEREITS_VERGEBEN.has(kennung) || roh.includes('already registered')) {
    // Nennt weder „vergeben" noch „existiert" — und schickt trotzdem dorthin,
    // wo es weitergeht. Wer das Konto besitzt, weiß nach diesem Satz, was zu
    // tun ist; wer es nicht besitzt, hat keine Bestätigung bekommen, sondern
    // eine Möglichkeit vorgehalten.
    return {
      message:
        'Mit dieser Adresse lässt sich gerade kein Konto anlegen. Hast du schon eines? Dann melde dich an.',
      ok: false
    }
  }

  if (KONTINGENT.has(kennung) || roh.includes('rate limit')) {
    // Die Grenze liegt projektweit bei zwei E-Mails pro Stunde (Supabase Free,
    // eingebauter Mailer) und greift auch für eine bislang unbekannte Adresse.
    // Ohne diesen Zweig sieht ein zweiter Besucher innerhalb derselben Stunde
    // „Registrierung nicht möglich" und hat keinen Anhaltspunkt, dass Warten
    // hilft.
    return {
      message:
        'Im Moment lassen sich keine Bestätigungs-E-Mails verschicken — das Kontingent ist für diese Stunde erschöpft. Bitte später erneut versuchen.',
      ok: false
    }
  }

  if (kennung === 'weak_password' || roh.includes('password')) {
    return { message: 'Dieses Passwort ist zu schwach. Bitte ein längeres wählen.', ok: false }
  }

  return { message: 'Registrierung nicht möglich. Bitte später erneut versuchen.', ok: false }
}
