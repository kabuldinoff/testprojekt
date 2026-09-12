import type { APIRequestContext } from '@playwright/test'

/**
 * Direkter Zugriff auf die Supabase-API im Test — bewusst an der Oberfläche
 * vorbei.
 *
 * Der Isolationstest muss beweisen, dass ein zweiter Nutzer die Daten des
 * ersten auch dann nicht bekommt, wenn er die Oberfläche gar nicht benutzt.
 * Ein Test, der nur klickt, zeigt nur, dass die Oberfläche nichts anzeigt —
 * das ist eine viel schwächere Aussage.
 *
 * Die Zugangsdaten kommen aus der Umgebung, die scripts/e2e.mjs aus dem
 * laufenden lokalen Stack liest. Läuft der nicht, bricht das Skript vorher ab.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export interface TestUser {
  email: string
  password: string
  accessToken: string
  userId: string
}

/** Eindeutige Adresse pro Lauf, damit Tests sich nicht gegenseitig stören. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@beispiel.test`
}

/** Legt ein Konto direkt über die Auth-API an und meldet es an. */
export async function createUser(request: APIRequestContext, prefix: string): Promise<TestUser> {
  const email = uniqueEmail(prefix)
  const password = 'test-passwort-1234'

  const response = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    data: { email, password }
  })

  if (!response.ok()) {
    throw new Error(`Konto anlegen fehlgeschlagen (${response.status()}): ${await response.text()}`)
  }

  const body = (await response.json()) as {
    access_token?: string
    user?: { id: string }
  }

  if (!body.access_token || !body.user) {
    throw new Error(
      'Die Registrierung lieferte keine Session. Steht enable_confirmations im lokalen Stack auf true?'
    )
  }

  return { email, password, accessToken: body.access_token, userId: body.user.id }
}

/**
 * Schaut mit dem Secret Key nach, an RLS vorbei.
 *
 * Nur für **Aufräum-Prüfungen** gedacht, und dort unverzichtbar: Ob eine Datei
 * gelöscht wurde, lässt sich mit dem Token des Nutzers gar nicht feststellen.
 * Eine Policy, die sie verbirgt, sähe aus wie eine Datei, die es nicht mehr
 * gibt — der Test wäre grün, und das Speicherkontingent liefe trotzdem voll.
 *
 * Für alles andere gilt weiter `asUser`: Ein Test, der mit erhöhten Rechten
 * prüft, prüft nicht das, was der Nutzer erlebt.
 */
export function asService(request: APIRequestContext) {
  const key = process.env.SUPABASE_SECRET_KEY ?? ''
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  return {
    get: (path: string) => request.get(`${SUPABASE_URL}/rest/v1/${path}`, { headers }),

    /**
     * Die Dateinamen unmittelbar unter einem Präfix.
     *
     * Die Storage-API listet **nicht** rekursiv: Auf einer Ebene mit
     * Unterordnern kämen die Ordnernamen zurück, nicht die Dateien darin. Der
     * Aufrufer übergibt deshalb den vollen Ordner, nicht die Wurzel.
     */
    storageNames: async (bucket: string, prefix: string) => {
      const antwort = await request.post(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: { prefix, limit: 100 }
      })
      if (!antwort.ok()) {
        throw new Error(
          `Storage-Liste fehlgeschlagen (${antwort.status()}): ${await antwort.text()}`
        )
      }
      return ((await antwort.json()) as Array<{ name: string }>).map((e) => e.name)
    }
  }
}

/** Ruft PostgREST als bestimmter Nutzer auf — genau das, was ein Angreifer täte. */
export function asUser(request: APIRequestContext, user: TestUser) {
  const headers = {
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${user.accessToken}`,
    'Content-Type': 'application/json'
  }

  return {
    get: (path: string) => request.get(`${SUPABASE_URL}/rest/v1/${path}`, { headers }),
    post: (path: string, data: unknown) =>
      request.post(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { ...headers, Prefer: 'return=representation' },
        data
      }),
    patch: (path: string, data: unknown) =>
      request.patch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { ...headers, Prefer: 'return=representation' },
        data
      }),
    delete: (path: string) => request.delete(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
  }
}
