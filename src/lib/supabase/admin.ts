/**
 * Supabase mit dem Secret Key — umgeht RLS vollständig.
 *
 * ⚠️ Diese Datei darf ausschließlich aus dem Ingestion-Worker importiert
 * werden, und erst nachdem die aufrufende Route den Besitz der betroffenen
 * Ressource über den RLS-Client (`server.ts`) verifiziert hat.
 *
 * Der Grund, warum es sie überhaupt gibt: die Verarbeitung einer Quelle läuft
 * nach der Antwort weiter, außerhalb des Request-Kontexts. Dort existiert kein
 * Session-Cookie mehr, also auch keine Identität, an der RLS ansetzen könnte.
 *
 * Diese Regel wird nicht durch Disziplin gehalten, sondern durch einen Test:
 * `src/lib/__tests__/admin-client-isolation.test.ts` folgt dem Import-Graph
 * und schlägt fehl, sobald diese Datei aus `src/app/(app)/**` erreichbar wird.
 *
 * Der Funktionsname sagt die Bedingung mit, damit sie an der Aufrufstelle im
 * Diff sichtbar ist und nicht nur hier im Kommentar steht.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { publicEnv, serverEnv } from '@/lib/env'

export function createAdminClientAfterOwnershipCheck() {
  return createSupabaseClient(publicEnv().supabaseUrl, serverEnv().supabaseSecretKey, {
    auth: {
      // Kein Cookie, keine Session, kein Token-Refresh: dieser Client hat
      // keine Identität und soll auch keine bekommen.
      persistSession: false,
      autoRefreshToken: false
    }
  })
}
