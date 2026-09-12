/**
 * Prüft die Abwägung zwischen Ehrlichkeit und Verschwiegenheit.
 *
 * Der wichtigste Test hier ist der, der **Gleichheit** verlangt: Eine bereits
 * vergebene Adresse muss dieselbe Antwort erzeugen wie eine neue. Sobald sich
 * die beiden unterscheiden — im Text, im Zustand, in der Länge —, ist das
 * Formular ein Abfragedienst für die Frage „hat diese Person hier ein Konto".
 */
import { describe, expect, it } from 'vitest'

import { bestaetigungAngefordert, signUpOutcome } from '../auth/messages'

const MAIL = 'person@beispiel.test'

describe('signUpOutcome · Verschwiegenheit', () => {
  it('eine vergebene Adresse ist von einer neuen nicht zu unterscheiden', () => {
    const neu = { message: bestaetigungAngefordert(MAIL), ok: true }

    for (const code of ['user_already_exists', 'email_exists']) {
      expect(signUpOutcome(code, undefined, MAIL), `Code ${code}`).toEqual(neu)
    }
  })

  it('auch wenn nur die Rohmeldung es verrät', () => {
    // GoTrue liefert nicht in jeder Version einen Code. Ohne diese Rückfallebene
    // fiele der Fall in den allgemeinen Zweig — und der sagt „nicht möglich",
    // was den Unterschied wieder sichtbar machte.
    expect(signUpOutcome(undefined, 'User already registered', MAIL)).toEqual({
      message: bestaetigungAngefordert(MAIL),
      ok: true
    })
  })

  it('keine Meldung nennt das Wort „vergeben", „existiert" oder „registriert"', () => {
    const verraeterisch = /vergeben|existiert|bereits|registriert/i
    for (const code of ['user_already_exists', 'email_exists', 'over_email_send_rate_limit', 'x']) {
      expect(signUpOutcome(code, undefined, MAIL).message, code).not.toMatch(verraeterisch)
    }
  })
})

describe('signUpOutcome · Ehrlichkeit', () => {
  it('das erschöpfte E-Mail-Kontingent wird benannt', () => {
    // Der Fall, der diese Datei ausgelöst hat: Die Grenze liegt projektweit bei
    // zwei Nachrichten pro Stunde und trifft auch eine völlig neue Adresse.
    const { message, ok } = signUpOutcome('over_email_send_rate_limit', undefined, MAIL)
    expect(ok).toBe(false)
    expect(message).toMatch(/Kontingent/)
    expect(message).toMatch(/später/)
  })

  it('erkennt das Kontingent auch an der Rohmeldung', () => {
    expect(signUpOutcome(undefined, 'email rate limit exceeded', MAIL).message).toMatch(
      /Kontingent/
    )
  })

  it('ein schwaches Passwort sagt, was zu tun ist', () => {
    expect(signUpOutcome('weak_password', undefined, MAIL).message).toMatch(/längeres/)
  })

  it('alles Unbekannte bleibt allgemein', () => {
    const { message, ok } = signUpOutcome('etwas_ganz_neues', 'boom', MAIL)
    expect(ok).toBe(false)
    expect(message).toBe('Registrierung nicht möglich. Bitte später erneut versuchen.')
  })

  it('die Rohmeldung wird nie durchgereicht', () => {
    // Sie ist englisch, technisch und kann sich zwischen zwei GoTrue-Versionen
    // ändern. Ein Nutzer soll nie „over_email_send_rate_limit" lesen.
    const roh = 'For security purposes, you can only request this after 59 seconds.'
    expect(signUpOutcome('over_email_send_rate_limit', roh, MAIL).message).not.toContain(roh)
  })
})

describe('bestaetigungAngefordert', () => {
  it('nennt die eingegebene Adresse', () => {
    // Wer sich vertippt hat, sucht sonst in einem Postfach, in das nie etwas
    // geschickt wurde — und die Adresse steht nach dem Absenden nirgends mehr,
    // weil React das Formular zurücksetzt.
    expect(bestaetigungAngefordert(MAIL)).toContain(MAIL)
  })
})
