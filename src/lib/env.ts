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

/**
 * Ob eine übergebene Anbieter-Adresse benutzt werden darf.
 *
 * `GOOGLE_BASE_URL` und `MISTRAL_BASE_URL` lenken die SDK-Aufrufe um — und
 * die SDKs schicken den API-Schlüssel mit. Eine Umgebung, in der eine dieser
 * Variablen versehentlich oder böswillig auf einen fremden Host zeigt, würde
 * also die Schlüssel dorthin ausliefern, während die Anwendung scheinbar
 * normal weiterläuft.
 *
 * Der Zweck der Variablen ist der Test-Stub, und der läuft immer auf dem
 * eigenen Rechner. Erlaubt sind deshalb ausschließlich Loopback-Adressen.
 * Damit kann eine Fehlkonfiguration die Anfragen bestenfalls ins Leere
 * lenken, aber nichts nach außen tragen.
 *
 * Exportiert, weil die Regel ohne Umgebung prüfbar sein soll.
 */
export function isAcceptableProviderBaseUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
}

/**
 * Prüft eine gesetzte Anbieter-Adresse und wirft, wenn sie nach außen zeigt.
 *
 * Wirft statt still zu ignorieren: eine übergangene Einstellung wäre in der
 * Entwicklung eine Stunde Fehlersuche, und im Betrieb möchte man von einer
 * solchen Variablen überhaupt erfahren.
 */
function providerBaseUrl(name: string, value: string | undefined): string | undefined {
  if (!value) return undefined
  if (!isAcceptableProviderBaseUrl(value)) {
    throw new Error(
      `${name} darf nur auf eine Loopback-Adresse zeigen — die Variable existiert für den ` +
        `Test-Stub, und die SDKs schicken den API-Schlüssel an diese Adresse. Gesetzt ist: ${value}`
    )
  }
  return value
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

/**
 * Zugangsdaten und Modell-IDs der AI-Anbieter. Nur auf dem Server.
 *
 * Die Modell-IDs stehen in der Umgebung und nicht im Code, und das ist
 * nachgemessen statt vorsichtshalber: `gemini-2.5-flash` — das ursprünglich
 * vorgesehene Modell — antwortet einem frisch erzeugten Schlüssel mit
 * `404 no longer available to new users`, obwohl es weiterhin in der
 * Modellliste des Kontos steht. Die Liste sagt also nicht, was der eigene
 * Schlüssel benutzen darf; nur der Aufruf sagt es. Ein fest verdrahteter
 * String wäre ein Deploy, eine Variable ist ein Neustart.
 *
 * Bewusst keine `-latest`-Aliasse: die verschieben sich unter einem laufenden
 * Produkt, und dann ändert sich das Antwortverhalten ohne einen Commit.
 */
export function aiEnv() {
  return {
    googleApiKey: required(
      'GOOGLE_GENERATIVE_AI_API_KEY',
      process.env.GOOGLE_GENERATIVE_AI_API_KEY
    ),
    mistralApiKey: required('MISTRAL_API_KEY', process.env.MISTRAL_API_KEY),
    googleChatModel: required('GEMINI_CHAT_MODEL', process.env.GEMINI_CHAT_MODEL),
    mistralChatModel: required('MISTRAL_CHAT_MODEL', process.env.MISTRAL_CHAT_MODEL),

    // Die Naht für die End-to-End-Tests. Im Betrieb nicht gesetzt, dann gilt
    // die Voreinstellung des jeweiligen SDK.
    //
    // Gegen die echten Anbieter zu testen ginge nicht: ein Modell formuliert
    // jedes Mal anders, und dann lässt sich prüfen, dass *irgendetwas* kam —
    // nicht, dass Beleg [1] auf den richtigen Ausschnitt zeigt. Genau das ist
    // aber die Eigenschaft, an der dieses Produkt hängt. Dazu käme, dass
    // jeder CI-Lauf echtes Kontingent verbrauchte und echte Schlüssel in
    // einem öffentlichen Repo lägen. Siehe scripts/ai-stub.mjs.
    googleBaseUrl: providerBaseUrl('GOOGLE_BASE_URL', process.env.GOOGLE_BASE_URL),
    mistralBaseUrl: providerBaseUrl('MISTRAL_BASE_URL', process.env.MISTRAL_BASE_URL)
  } as const
}
