import type { ReactNode } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Wordmark } from '@/components/wordmark'

/**
 * Rahmen für Anmeldung und Registrierung: zentrierte Karte auf dem
 * Verlaufshintergrund aus dem Design-Canvas.
 */
export function AuthShell({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6 py-12 [background-image:var(--glow)] [background-repeat:no-repeat]">
      <div className="w-full max-w-sm">
        {/*
          Das Zeichen steht mittig über der Karte, der Umschalter rechts.
          Beide in derselben Zeile mit `justify-between` zu setzen hieße: Das
          Zeichen rutscht nach links und sitzt nicht mehr über der Mitte der
          Karte darunter. Deshalb liegt der Umschalter absolut, und das Zeichen
          zentriert sich im vollen Platz.
        */}
        <div className="relative mb-8 flex h-9 items-center justify-center">
          <Wordmark href="/" />
          <div className="absolute right-0">
            <ThemeToggle />
          </div>
        </div>

        <div className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-ink">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  )
}
