import Link from 'next/link'
import type { ReactNode } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'

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
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight">
            Notabene
          </Link>
          <ThemeToggle />
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
