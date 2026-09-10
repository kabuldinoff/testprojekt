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

/**
 * Ob eine Supabase-URL verschlüsselt genug ist, um Zugangsdaten darüber zu
 * schicken.
 *
 * Über diese Adresse gehen Passwörter bei Anmeldung und Registrierung. Eine
 * versehentlich auf `http://` konfigurierte Produktionsumgebung würde sie im
 * Klartext übertragen, und niemandem fiele es auf — die App funktioniert ja.
 *
 * Die Ausnahme ist der lokale Stack: der läuft ohne TLS auf 127.0.0.1, und
 * dort gibt es kein Netz, auf dem jemand mithören könnte. `localhost` und
 * `127.0.0.1` sind deshalb erlaubt, `http://` auf allem anderen nicht.
 *
 * Exportiert, weil die Regel ohne Umgebung testbar sein soll.
 */
export function isAcceptableSupabaseUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  if (url.protocol !== 'http:') return false
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
}

/** Im Browser und auf dem Server verfügbar. Enthält nichts Geheimes. */
export function publicEnv() {
  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)

  if (!isAcceptableSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL muss https:// sein (Ausnahme: localhost). Gesetzt ist: ${supabaseUrl}`
    )
  }

  return {
    supabaseUrl,
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
