import { NextResponse, type NextRequest } from 'next/server'

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

  // Dieselbe Prüfung wie in den Server Actions: nur interne Pfade. Ein
  // Weiterleitungsziel aus der URL ist sonst ein offener Redirect, und
  // ausgerechnet nach einer Anmeldung ist das eine gute Phishing-Bühne.
  const raw = searchParams.get('weiter') ?? '/app'
  const next = /^\/(?!\/)/.test(raw) ? raw : '/app'

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
