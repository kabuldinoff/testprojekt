/**
 * Prüft, womit `signUp` den Auth-Server tatsächlich aufruft.
 *
 * ── Warum das nicht der End-to-End-Test erledigt ──────────────────────────
 *
 * Weil der lokale Stack an dieser Stelle **anders konfiguriert ist als
 * Produktion**: `enable_confirmations = false` in `supabase/config.toml`. Eine
 * Registrierung liefert lokal sofort eine Sitzung, es wird keine E-Mail
 * verschickt, und der Bestätigungsweg existiert dort gar nicht. Umschalten
 * ginge, würde aber jeden anderen End-to-End-Test unbrauchbar machen — sie
 * legen alle Konten an und erwarten eine gültige Sitzung.
 *
 * Der Fehler, den dieser Test verhindert, war real: `signUp` nannte kein Ziel,
 * Supabase hängte den Code an die Site-URL, der Nutzer landete auf der
 * Startseite, und der Code verfiel ungenutzt. Die Callback-Route war gebaut
 * und richtig — sie wurde nur nie aufgerufen. Sichtbar war das ausschließlich
 * in Produktion.
 *
 * Deshalb hier: beobachten, was die Action dem Client übergibt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signUp = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signUp } })
}))

// `revalidatePath` und `redirect` gehören zum Framework und haben hier nichts
// zu tun — der Erfolgsfall mit Sitzung wird in diesem Test nicht durchlaufen.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('redirect')
  }
}))

const { signUp: signUpAction } = await import('@/lib/auth/actions')

function formular(email = 'person@beispiel.test', passwort = 'test-passwort-1234') {
  const daten = new FormData()
  daten.set('email', email)
  daten.set('password', passwort)
  return daten
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SITE_URL = 'https://notabene.example'
})

describe('signUp · das Ziel des Bestätigungslinks', () => {
  it('nennt die Callback-Route, absolut', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null })

    await signUpAction({}, formular())

    const [argumente] = signUp.mock.calls[0] as [{ options?: { emailRedirectTo?: string } }]
    // Absolut, weil die Adresse in einer E-Mail steht — relativ hätte dort
    // keinen Bezugspunkt.
    expect(argumente.options?.emailRedirectTo).toBe('https://notabene.example/auth/callback')
  })

  it('folgt der Umgebung, statt eine Domain einzubacken', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vorschau.example'
    signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null })

    await signUpAction({}, formular())

    const [argumente] = signUp.mock.calls[0] as [{ options?: { emailRedirectTo?: string } }]
    expect(argumente.options?.emailRedirectTo).toBe('https://vorschau.example/auth/callback')
  })
})

describe('signUp · was der Nutzer zurückbekommt', () => {
  it('der Erfolgsfall nennt die eingegebene Adresse', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null })

    const zustand = await signUpAction({}, formular('tippfehler@beispiel.test'))

    expect(zustand.success).toContain('tippfehler@beispiel.test')
    expect(zustand.error).toBeUndefined()
  })

  it('eine vergebene Adresse verspricht keine Mail', async () => {
    // Der Fehler, den die abgeschaltete Bestätigung erzeugt hat: Dieser Zweig
    // gab „Wir haben eine Bestätigung geschickt" zurück — dieselbe Antwort wie
    // bei Erfolg, und damit die stärkste Verschwiegenheit. Ohne Mailversand
    // ist derselbe Satz eine Lüge, und der Nutzer wartet auf etwas, das nicht
    // kommt.
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'User already registered' }
    })

    const zustand = await signUpAction({}, formular('bekannt@beispiel.test'))

    expect(zustand.success).toBeUndefined()
    expect(zustand.error).toMatch(/melde dich an/i)
    expect(zustand.error).not.toMatch(/Bestätigung/i)
  })

  it('das erschöpfte Kontingent wird als Fehler benannt', async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }
    })

    const zustand = await signUpAction({}, formular())

    expect(zustand.error).toMatch(/Kontingent/)
    expect(zustand.success).toBeUndefined()
  })

  it('eine ungültige Eingabe erreicht den Auth-Server gar nicht', async () => {
    const zustand = await signUpAction({}, formular('kein-mail', 'kurz'))

    expect(zustand.error).toBeTruthy()
    expect(signUp).not.toHaveBeenCalled()
  })
})
