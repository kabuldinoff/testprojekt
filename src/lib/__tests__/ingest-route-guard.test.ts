/**
 * Prüft die eine Route, die den Secret-Key-Client erreichen darf.
 *
 * `admin-client-isolation.test.ts` hält fest, **dass** diese Datei die
 * Ausnahme ist. Was es nicht prüfen kann: ob die Bedingung, unter der die
 * Ausnahme gilt, überhaupt eingehalten wird. Dort standen zwei Zusicherungen
 * der Form „irgendwo im Quelltext steht `getUser()`" — die bleiben grün, wenn
 * die Besitzprüfung entfernt oder nach dem Worker aufgerufen wird.
 *
 * Hier wird stattdessen die Route ausgeführt und beobachtet, was sie tut:
 * ohne Anmeldung und bei fremder Quelle darf `ingestSource` **nicht**
 * aufgerufen werden.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ingestSource = vi.fn()
const getUser = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/sources/ingest', () => ({ ingestSource }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })
  })
}))

// `after` läuft im Test sofort statt nach der Antwort. Anders ließe sich nicht
// beobachten, ob der Worker aufgerufen wurde.
vi.mock('next/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('next/server')>()
  return { ...original, after: (fn: () => unknown) => void fn() }
})

const { POST } = await import('@/app/api/sources/[sourceId]/ingest/route')

const SOURCE_ID = '11111111-1111-1111-1111-111111111111'

function call() {
  return POST(
    new Request('http://localhost/api/sources/x/ingest', { method: 'POST' }) as never,
    {
      params: Promise.resolve({ sourceId: SOURCE_ID })
    } as never
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('die Ingest-Route', () => {
  it('lehnt ohne Anmeldung ab und ruft den Worker nicht', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const response = await call()

    expect(response.status).toBe(401)
    expect(ingestSource).not.toHaveBeenCalled()
  })

  it('antwortet bei fremder Quelle mit 404 und ruft den Worker nicht', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'nutzer' } } })
    // Die Abfrage läuft über den RLS-Client: eine fremde Quelle findet die
    // Policy nicht, es kommt also nichts zurück.
    maybeSingle.mockResolvedValue({ data: null })

    const response = await call()

    // 404 und nicht 403 — ein 403 bestätigte, dass es die Quelle gibt.
    expect(response.status).toBe(404)
    // Das ist die Zusicherung, die die Ausnahme im Import-Graph-Test trägt:
    // der Worker mit erhöhten Rechten wird nur nach bestandener Prüfung
    // erreicht.
    expect(ingestSource).not.toHaveBeenCalled()
  })

  it('ruft den Worker erst nach bestandener Prüfung', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'nutzer' } } })
    maybeSingle.mockResolvedValue({ data: { id: SOURCE_ID } })

    const response = await call()

    expect(response.status).toBe(202)
    expect(ingestSource).toHaveBeenCalledExactlyOnceWith(SOURCE_ID)
  })

  it('meldet einen Fehler im Worker, ohne die Antwort zu ändern', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'nutzer' } } })
    maybeSingle.mockResolvedValue({ data: { id: SOURCE_ID } })
    ingestSource.mockRejectedValue(new Error('kaputt'))
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Die Antwort ist längst raus, wenn after() läuft. Ein Fehler darf sie
    // nicht mehr verändern — aber er darf auch nicht spurlos verschwinden.
    const response = await call()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(response.status).toBe(202)
    expect(fehler).toHaveBeenCalled()
    fehler.mockRestore()
  })
})
