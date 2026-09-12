'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { safeReturnPath } from '@/lib/routing'
import { siteUrl } from '@/lib/site'
import { createClient } from '@/lib/supabase/server'

import { bestaetigungAngefordert, signUpOutcome } from './messages'

/**
 * Server Actions für Anmeldung, Registrierung und Abmeldung.
 *
 * Als Server Actions und nicht als Client-Fetch: die Formulare funktionieren
 * damit auch ohne JavaScript, und das Session-Cookie wird serverseitig
 * gesetzt, ohne dass ein Token je durch Browser-Code läuft.
 *
 * Rückgabewert ist immer ein Formularzustand statt einer Ausnahme. Ein
 * geworfener Fehler landet als generische Fehlerseite beim Nutzer — hier soll
 * er stattdessen sein Formular mit einer Meldung darüber wiedersehen.
 */

export interface FormState {
  error?: string
  success?: string
}

const credentials = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Bitte E-Mail-Adresse angeben.')
    .pipe(z.email('Das sieht nicht nach einer E-Mail-Adresse aus.')),
  // Supabase verlangt mindestens 6 Zeichen. Acht ist die niedrigste Zahl, die
  // sich noch guten Gewissens vertreten lässt, ohne den Nutzer zu gängeln.
  password: z.string().min(8, 'Mindestens 8 Zeichen.')
})

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    // Bewusst keine Unterscheidung zwischen "Konto gibt es nicht" und
    // "Passwort falsch". Die Unterscheidung wäre freundlicher, verriete aber,
    // welche E-Mail-Adressen registriert sind.
    return { error: 'E-Mail-Adresse oder Passwort stimmt nicht.' }
  }

  revalidatePath('/', 'layout')
  redirect(safeReturnPath(formData.get('weiter')))
}

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      /*
       * Ohne diese Zeile führte der Bestätigungslink auf die Startseite.
       *
       * Supabase hängt den einmaligen `code` an die im Dashboard hinterlegte
       * Site-URL, wenn der Aufruf kein Ziel nennt. Auf `/` gibt es aber
       * niemanden, der ihn einlöst — der Nutzer landete angemeldet-aussehend
       * auf der Marketingseite, mit einem Code in der Adresszeile, der nach
       * kurzer Zeit verfiel. Die Callback-Route war die ganze Zeit gebaut und
       * richtig; sie wurde nur nie aufgerufen.
       *
       * Absolut und nicht relativ: Die Adresse steht in einer E-Mail.
       * `siteUrl()` liefert in Produktion die kanonische Domain und lokal
       * `localhost:3000`, sodass derselbe Weg in beiden Umgebungen gilt.
       *
       * Kein `?weiter=`: Der Callback fällt über `safeReturnPath` ohnehin auf
       * `/app`. Nach dem Tausch ist die Sitzung gültig — den Nutzer dann auf
       * die Anmeldeseite zu schicken, wäre ein Schritt zu viel.
       */
      emailRedirectTo: `${siteUrl()}/auth/callback`
    }
  })

  if (error) {
    // Die Unterscheidung steht in `messages.ts`, mitsamt der Abwägung: Eine
    // bereits vergebene Adresse bekommt **dieselbe** Antwort wie eine neue,
    // alles andere wird benannt.
    const ausgang = signUpOutcome(error.code, error.message, parsed.data.email)
    return ausgang.ok ? { success: ausgang.message } : { error: ausgang.message }
  }

  // Ist die E-Mail-Bestätigung aktiv, kommt ein Nutzerobjekt ohne Session
  // zurück. Ohne diesen Zweig sähe der Nutzer eine leere Seite und wüsste
  // nicht, dass er in sein Postfach schauen muss.
  //
  // Auch der Weg, den Supabase mit eingeschaltetem Enumerationsschutz nimmt:
  // Dort meldet eine vergebene Adresse **keinen** Fehler, sondern liefert ein
  // Nutzerobjekt ohne Identitäten. Beides endet hier, und das ist richtig so.
  if (data.user && !data.session) {
    return { success: bestaetigungAngefordert(parsed.data.email) }
  }

  revalidatePath('/', 'layout')
  redirect('/app')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
