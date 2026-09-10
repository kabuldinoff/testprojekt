'use client'

import { useTheme } from 'next-themes'

/**
 * Umschalter Dark/Light.
 *
 * Das eigentliche Problem hier ist Hydration: welches Theme aktiv ist, steht im
 * localStorage des Browsers und ist auf dem Server unbekannt. Rendert der
 * Server ein anderes Symbol als der Client, verwirft React den Baum.
 *
 * Der übliche Ausweg — ein `mounted`-Flag aus einem useEffect — ist unter
 * React 19 ein Anti-Pattern (`react-hooks/set-state-in-effect`) und erzeugt
 * eine zusätzliche Renderrunde nur für ein Icon.
 *
 * Stattdessen: beide Symbole werden immer gerendert, und CSS entscheidet
 * anhand der Theme-Klasse am <html>, welches sichtbar ist. Server und Client
 * erzeugen damit identisches Markup, es gibt keinen State, keinen Effect und
 * keine zweite Renderrunde — und das richtige Symbol steht schon vor der
 * Hydration da. Die beiden Hilfsklassen liegen in globals.css; das ist die
 * einzige Stelle im Projekt, die auf die Theme-Klasse zugreift.
 *
 * `resolvedTheme` wird ausschließlich im Klick-Handler gelesen, nie beim
 * Rendern — dort ist es längst definiert und kann keinen Mismatch auslösen.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="grid size-9 place-items-center rounded-control text-muted-ink transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label="Design umschalten"
    >
      <span aria-hidden className="only-dark text-base">
        ☾
      </span>
      <span aria-hidden className="only-light text-base">
        ☀
      </span>
    </button>
  )
}
