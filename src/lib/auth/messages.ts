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
 * Eine schon vergebene Adresse darf **nicht** als solche gemeldet werden.
 * Sonst wird das Formular zum Abfragedienst: Wer wissen will, ob jemand hier
 * ein Konto hat, tippt dessen Adresse ein und liest die Antwort ab. Dieselbe
 * Überlegung steht schon bei der Anmeldung, wo „Konto gibt es nicht" und
 * „Passwort falsch" bewusst dieselbe Meldung ergeben.
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
 */
export function signUpOutcome(
  code: string | undefined,
  message: string | undefined,
  email: string
): SignUpOutcome {
  const kennung = (code ?? '').toLowerCase()
  const roh = (message ?? '').toLowerCase()

  if (BEREITS_VERGEBEN.has(kennung) || roh.includes('already registered')) {
    // **Dieselbe Meldung wie bei Erfolg, und das ist Absicht.** Der Unterschied
    // wäre die Auskunft, die wir nicht geben wollen. Es wird keine E-Mail
    // verschickt; wer das Konto wirklich besitzt, kommt über „Passwort
    // vergessen" weiter, und wer es nicht besitzt, erfährt nichts.
    return { message: bestaetigungAngefordert(email), ok: true }
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
