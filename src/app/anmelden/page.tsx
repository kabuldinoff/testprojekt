import type { Metadata } from 'next'

import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { signIn } from '@/lib/auth/actions'

export const metadata: Metadata = {
  title: 'Anmelden · Notabene',
  // Anmeldeseiten gehören nicht in den Index: sie bringen keinem Suchenden
  // etwas und verwässern nur, wofür die Startseite gefunden werden soll.
  robots: { index: false, follow: false }
}

export default async function AnmeldenPage({ searchParams }: PageProps<'/anmelden'>) {
  const { weiter } = await searchParams
  const next = typeof weiter === 'string' ? weiter : undefined

  return (
    <AuthShell
      title="Willkommen zurück"
      subtitle="Melde dich an, um zu deinen Notebooks zu kommen."
    >
      <AuthForm mode="anmelden" action={signIn} next={next} />
    </AuthShell>
  )
}
