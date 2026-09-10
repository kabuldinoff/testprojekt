import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '@/lib/env'

/**
 * Frischt bei jedem Request das Session-Cookie auf und schützt den
 * App-Bereich.
 *
 * Warum überhaupt Middleware: Supabase-Sessions laufen nach einer Stunde ab
 * und werden über einen Refresh-Token erneuert. Server-Komponenten können
 * keine Cookies schreiben — ohne diese Stelle würde die Sitzung mitten in der
 * Nutzung stillschweigend ungültig, und der Nutzer stünde plötzlich vor der
 * Anmeldeseite.
 *
 * Warum der Zugriffsschutz hier UND in den Server-Komponenten sitzt: die
 * Middleware ist Bequemlichkeit, keine Sicherheitsgrenze. Sie leitet um, damit
 * niemand eine leere Seite sieht. Die tatsächliche Grenze ist RLS in der
 * Datenbank — selbst wenn diese Datei fehlerhaft wäre, käme kein fremdes
 * Notebook heraus.
 */

/** Bereiche, die eine Anmeldung voraussetzen. */
const PROTECTED_PREFIX = '/app'

/** Seiten, die einem angemeldeten Nutzer nichts mehr nützen. */
const AUTH_ROUTES = ['/anmelden', '/registrieren']

export async function middleware(request: NextRequest) {
  // Die Antwort wird hier angelegt und unten zurückgegeben, weil
  // createServerClient die aufgefrischten Cookies genau auf dieses Objekt
  // schreibt. Ein neu erzeugtes Response-Objekt am Ende würde sie verlieren —
  // ein Fehler, der sich als "Nutzer wird alle paar Minuten abgemeldet" zeigt.
  let response = NextResponse.next({ request })
  const env = publicEnv()

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      }
    }
  })

  // getUser() und nicht getSession(): getSession liest das Cookie nur aus und
  // vertraut ihm. getUser fragt den Auth-Server und prüft die Signatur. Für
  // eine Weiche, die über Zugriff entscheidet, ist das der Unterschied
  // zwischen einer Prüfung und einer Vermutung.
  const {
    data: { user }
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && pathname.startsWith(PROTECTED_PREFIX)) {
    const url = request.nextUrl.clone()
    url.pathname = '/anmelden'
    // Damit landet der Nutzer nach der Anmeldung dort, wo er hinwollte,
    // statt auf einer generischen Startseite.
    url.searchParams.set('weiter', pathname)
    return NextResponse.redirect(url)
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Statische Dateien und Bilder ausnehmen: sie brauchen keine Session, und
  // jeder Middleware-Durchlauf kostet eine Auth-Server-Abfrage.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']
}
