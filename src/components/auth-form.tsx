'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import type { FormState } from '@/lib/auth/actions'

/**
 * Ein Formular für Anmeldung und Registrierung.
 *
 * Beide unterscheiden sich in Überschrift, Knopftext und Fußzeile — nicht in
 * Struktur, Validierung, Fehlerdarstellung oder Barrierefreiheit. Zwei
 * getrennte Komponenten hätten bedeutet, jede Korrektur an der
 * aria-Verdrahtung zweimal zu machen und beim zweiten Mal zu vergessen.
 *
 * `useActionState` liefert `pending` mit: der Knopf ist während des Absendens
 * deaktiviert und sagt, dass etwas passiert. Ohne das klickt der Nutzer
 * zweimal, und bei der Registrierung entsteht der zweite Versuch als Fehler.
 */
export function AuthForm({
  mode,
  action,
  next
}: {
  mode: 'anmelden' | 'registrieren'
  action: (previous: FormState, formData: FormData) => Promise<FormState>
  next?: string | undefined
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {})
  const isSignUp = mode === 'registrieren'

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="weiter" value={next} /> : null}

      <Field
        label="E-Mail-Adresse"
        name="email"
        type="email"
        // Ohne autoComplete bietet der Passwortmanager nichts an, und der
        // Nutzer tippt eine Adresse, die er längst gespeichert hat.
        autoComplete="email"
        required
        placeholder="du@beispiel.de"
      />

      <Field
        label="Passwort"
        name="password"
        type="password"
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
        required
        minLength={8}
        hint={isSignUp ? 'Mindestens 8 Zeichen.' : undefined}
      />

      {state.error ? <Notice tone="err">{state.error}</Notice> : null}
      {state.success ? <Notice tone="ok">{state.success}</Notice> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Einen Moment …' : isSignUp ? 'Konto anlegen' : 'Anmelden'}
      </Button>

      <p className="text-center text-sm text-muted-ink">
        {isSignUp ? (
          <>
            Schon ein Konto?{' '}
            <Link href="/anmelden" className="font-semibold text-brand-600 hover:underline">
              Anmelden
            </Link>
          </>
        ) : (
          <>
            Noch kein Konto?{' '}
            <Link href="/registrieren" className="font-semibold text-brand-600 hover:underline">
              Konto anlegen
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
