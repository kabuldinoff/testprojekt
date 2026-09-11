import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth/actions'
import { createClient } from '@/lib/supabase/server'

/**
 * Alles unter /app trägt `noindex`.
 *
 * `robots.txt` bittet Crawler bereits, hier nicht zu suchen — aber eine Bitte
 * greift nur, wenn sie gelesen wird, und sie gilt nicht für eine Adresse, die
 * jemand direkt verlinkt hat. Dieser Kopf wirkt auch dann.
 *
 * Die eigentliche Grenze ist keines von beidem: Ein Crawler bekommt hier
 * ohnehin nur die Weiterleitung zur Anmeldung zu sehen. Die Kette aus
 * Middleware, Layout-Prüfung und RLS entscheidet über Zugriff; diese Zeile
 * entscheidet nur darüber, ob die Anmeldeseite als Suchtreffer auftaucht.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false }
}

/**
 * Rahmen des angemeldeten Bereichs.
 *
 * Die Prüfung hier ist die zweite von drei Ebenen: die Middleware leitet um,
 * damit niemand eine leere Seite sieht; dieses Layout stellt sicher, dass eine
 * Server-Komponente nie ohne Nutzer rendert; und RLS in der Datenbank ist die
 * eigentliche Grenze. Fiele eine der ersten beiden aus, käme trotzdem kein
 * fremdes Notebook heraus.
 *
 * getUser() statt getSession(): getSession liest nur das Cookie und vertraut
 * ihm, getUser prüft die Signatur beim Auth-Server.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) redirect('/anmelden')

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex items-center gap-4 border-b border-hairline bg-surface px-5 py-3">
        <Link href="/app" className="font-bold tracking-tight">
          Notabene
        </Link>
        <span className="flex-1" />
        <span className="hidden text-sm text-muted-ink sm:inline">{user.email}</span>
        <ThemeToggle />
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="compact">
            Abmelden
          </Button>
        </form>
      </header>
      {children}
    </div>
  )
}
