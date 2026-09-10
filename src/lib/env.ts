/**
 * Zugriff auf die Umgebungsvariablen — an genau einer Stelle und mit einem
 * Fehler, der sagt, was fehlt.
 *
 * Ohne das äußert sich eine vergessene Variable als `undefined` tief in einer
 * Supabase-Bibliothek, meist als "Invalid URL" oder als stiller 401. Diese
 * Datei macht daraus eine Meldung, die den Namen der Variablen nennt.
 *
 * Beides sind Funktionen, keine Konstanten. Eine Konstante würde beim Import
 * ausgewertet — und damit jeden Build zum Scheitern bringen, der die Werte gar
 * nicht braucht. Genau das passiert in CI: dort läuft `next build`, ohne dass
 * Supabase-Zugangsdaten gesetzt sind.
 *
 * Die NEXT_PUBLIC_-Werte stehen bewusst als vollständige Literale da und
 * werden nicht dynamisch nachgeschlagen: Next ersetzt sie zur Build-Zeit im
 * Bundle, und das funktioniert nur bei einem exakten statischen Zugriff —
 * auch innerhalb einer Funktion.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Umgebungsvariable ${name} fehlt. Lege .env.local an (Vorlage: .env.example) und trage sie ein.`
    )
  }
  return value
}

/** Im Browser und auf dem Server verfügbar. Enthält nichts Geheimes. */
export function publicEnv() {
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  } as const
}

/** Nur auf dem Server. Umgeht RLS — siehe src/lib/supabase/admin.ts. */
export function serverEnv() {
  return {
    supabaseSecretKey: required('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY)
  } as const
}
