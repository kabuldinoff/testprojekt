import type { SupabaseClient } from '@supabase/supabase-js'

import { GRENZEN, type Bucket } from './limits'

/**
 * Verbraucht einen Vorgang aus einem Topf und meldet, ob er erlaubt war.
 *
 * Die eigentliche Arbeit macht `consume_rate_limit` in der Datenbank
 * (Migration 0013) — atomar, und über eine Tabelle, an die der Aufrufer selbst
 * nicht herankommt. Hier steht nur die Übersetzung in etwas, womit eine Route
 * antworten kann.
 *
 * **Der RLS-Client, nicht der Secret-Key-Client.** Die Funktion liest die
 * Nutzer-ID aus dem Token; mit dem Secret Key gäbe es keines, `auth.uid()`
 * wäre null und jeder Aufruf würde abgelehnt. Das ist kein Zufall, sondern der
 * Grund, warum die Funktion keine Nutzer-ID als Argument nimmt.
 */
export interface Entscheidung {
  erlaubt: boolean
  message?: string
}

export async function verbrauche(supabase: SupabaseClient, bucket: Bucket): Promise<Entscheidung> {
  // **Nur der Topfname.** Grenze und Fenster stehen in der Datenbankfunktion.
  //
  // Die erste Fassung reichte beides durch, und das machte die Drosselung
  // wirkungslos: Derselbe Nutzer kann die Funktion über PostgREST direkt
  // aufrufen und `p_window => '0 seconds'` mitgeben — das Fenster gilt sofort
  // als abgelaufen, der Zähler springt auf eins, und der Aufruf der Route
  // findet einen frischen Topf vor. Nachgemessen: bei Grenze 3 fünfmal `true`.
  const { data, error } = await supabase.rpc('consume_rate_limit', { p_bucket: bucket })

  if (error) {
    // **Durchlassen, nicht sperren.**
    //
    // Die Abwägung: Ist der Zähler kaputt, kostet Durchlassen im schlimmsten
    // Fall Kontingent — Sperren kostet das Produkt. Eine Drosselung ist eine
    // Schutzmaßnahme gegen Übermaß, keine Zugriffskontrolle; sie darf nicht zur
    // Ursache eines Ausfalls werden, den sie verhindern sollte.
    //
    // Still bleibt es trotzdem nicht: Ohne diese Zeile liefe die Anwendung
    // ungedrosselt weiter und niemand wüsste es.
    console.error('[rate-limit] Zähler nicht erreichbar', bucket, error)
    return { erlaubt: true }
  }

  return data === true ? { erlaubt: true } : { erlaubt: false, message: GRENZEN[bucket].message }
}
