/**
 * Supabase im Browser.
 *
 * Benutzt den Publishable Key. Der ist kein Geheimnis — er ist eine Adresse,
 * und er ist exakt so sicher wie die RLS-Policies dahinter. Genau deshalb hat
 * jede Tabelle in diesem Projekt echte Policies und nicht bloß "RLS an".
 *
 * Was diese Datei NICHT tut: privilegierte Zugriffe. Dafür gibt es
 * `admin.ts`, und ein Unit-Test stellt sicher, dass der von hier aus nie
 * erreichbar wird.
 */
import { createBrowserClient } from '@supabase/ssr'

import { publicEnv } from '@/lib/env'

export function createClient() {
  const env = publicEnv()
  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey)
}
