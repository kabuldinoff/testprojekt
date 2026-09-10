'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ReactNode } from 'react'

/**
 * Hüllt die App in next-themes. Setzt die Theme-Klasse per Inline-Script noch
 * vor der Hydration — deshalb gibt es beim Laden keinen hellen Blitz.
 *
 * Bewusst NICHT enthalten: eine System-Option. Das Produkt ist auf Dark hin
 * entworfen und wird auch in Dark gemessen; Light ist die zweite Ausprägung.
 * Zwei Zustände statt drei sparen einen Sonderfall im Umschalter, ohne dass
 * jemandem etwas fehlt (YAGNI).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      themes={['dark', 'light']}
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
