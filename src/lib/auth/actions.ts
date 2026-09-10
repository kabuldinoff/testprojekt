'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { safeReturnPath } from '@/lib/routing'
import { createClient } from '@/lib/supabase/server'

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
  const { data, error } = await supabase.auth.signUp(parsed.data)

  if (error) {
    return { error: 'Registrierung nicht möglich. Bitte später erneut versuchen.' }
  }

  // Ist die E-Mail-Bestätigung aktiv, kommt ein Nutzerobjekt ohne Session
  // zurück. Ohne diesen Zweig sähe der Nutzer eine leere Seite und wüsste
  // nicht, dass er in sein Postfach schauen muss.
  if (data.user && !data.session) {
    return { success: 'Fast geschafft — bestätige die Adresse über den Link in deiner E-Mail.' }
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
