import { NextResponse, type NextRequest } from 'next/server'

import { safeReturnPath } from '@/lib/routing'
import { createClient } from '@/lib/supabase/server'

/**
 * Landepunkt für E-Mail-Bestätigung und Magic Link.
 *
 * Supabase schickt den Nutzer mit einem einmaligen `code` hierher; der wird
 * gegen eine Session getauscht und als Cookie gesetzt. Das muss ein Route
 * Handler sein und keine Server-Komponente — nur hier lassen sich Cookies
 * schreiben.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  // Dieselbe Prüfung wie in den Server Actions — und genau deshalb dieselbe
  // Funktion. Zwei Kopien bedeuten, dass eine davon beim nächsten Fund nicht
  // mitkorrigiert wird, und ein offener Redirect nach der Anmeldung ist eine
  // gute Phishing-Bühne.
  const next = safeReturnPath(searchParams.get('weiter'))

  if (!code) {
    return NextResponse.redirect(`${origin}/anmelden?fehler=kein-code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Abgelaufen oder schon benutzt. Der Nutzer bekommt keine Sackgasse,
    // sondern die Anmeldeseite mit einem Hinweis.
    return NextResponse.redirect(`${origin}/anmelden?fehler=link-ungueltig`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
