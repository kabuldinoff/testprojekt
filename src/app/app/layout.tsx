import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Wordmark } from '@/components/wordmark'
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
 *
 * **Die einzige Stelle.** Zuvor stand dasselbe zusätzlich an drei Seiten. Das
 * war nicht nur Wiederholung: Es machte diese Zeile wirkungslos und damit
 * unprüfbar — ein Test konnte nicht zeigen, dass sie etwas tut, weil die
 * Seiten es ohnehin selbst erklärten. Jetzt trägt das Layout es für den
 * ganzen Bereich, auch für jede Seite, die später dazukommt.
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

  // Feste Höhe statt Mindesthöhe, und der Inhalt bekommt den Rest.
  //
  // Der Arbeitsbereich braucht eine **definierte** Höhe, damit seine drei
  // Spalten jeweils für sich scrollen statt die ganze Seite. Der erste Anlauf
  // rechnete sie aus dem Viewport minus einer Kopfzeilenhöhe, die als Token
  // danebenstand — und die Zahl war geraten: 52px im Token, 61px in
  // Wirklichkeit. Die Folge war ein zweiter Scrollbalken auf jeder Breite.
  //
  // Eine nachgemessene Zahl wäre genauso zerbrechlich gewesen; sie hätte nur
  // bis zur nächsten Änderung an der Kopfzeile gehalten. Hier rechnet
  // stattdessen CSS: Die Kopfzeile schrumpft nicht, der Inhalt nimmt den Rest.
  // `min-h-0` ist dabei nicht optional — ohne das wächst ein Flex-Kind über
  // seinen Anteil hinaus, sobald sein Inhalt größer ist.
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-4 border-b border-hairline bg-surface px-5 py-3">
        <Wordmark href="/app" />
        <span className="flex-1" />
        <span className="hidden text-sm text-muted-ink sm:inline">{user.email}</span>
        <ThemeToggle />
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="compact">
            Abmelden
          </Button>
        </form>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
