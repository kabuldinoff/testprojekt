/**
 * Supabase in Server-Komponenten und Route Handlern.
 *
 * Ebenfalls der Publishable Key, aber zusätzlich mit dem Session-Cookie des
 * angemeldeten Nutzers. Damit gilt für jede Abfrage über diesen Client dessen
 * eigene Identität — RLS bleibt also die Grenze, auch auf dem Server.
 *
 * Das ist die bewusste Alternative zu einem ORM mit erhöhten Rechten: dort
 * wandert die Autorisierung zurück in die Anwendung, und jede neue Route ist
 * eine neue Gelegenheit, sie zu vergessen.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { publicEnv } from '@/lib/env'

export async function createClient() {
  const cookieStore = await cookies()
  const env = publicEnv()

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Aus einer Server-Komponente heraus lassen sich keine Cookies
          // setzen — Next erlaubt das nur in Route Handlern und Server
          // Actions. Das ist kein Fehler: die Middleware hat die Session in
          // diesem Request bereits aufgefrischt, dieser Aufruf wäre nur eine
          // Wiederholung. Deshalb schlucken wir genau hier, und nur hier.
        }
      }
    }
  })
}
