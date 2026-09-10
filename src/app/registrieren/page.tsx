import type { Metadata } from 'next'

import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { signUp } from '@/lib/auth/actions'

export const metadata: Metadata = {
  title: 'Konto anlegen · Notabene',
  robots: { index: false, follow: false }
}

export default function RegistrierenPage() {
  return (
    <AuthShell title="Konto anlegen" subtitle="Kostenlos. Deine Quellen bleiben deine.">
      <AuthForm mode="registrieren" action={signUp} />
    </AuthShell>
  )
}
