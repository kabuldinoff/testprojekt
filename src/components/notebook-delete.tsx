'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import type { FormState } from '@/lib/notebooks/actions'

/**
 * Löschen mit Bestätigung und sichtbarem Fehlerfall.
 *
 * Die Bestätigung ist ein `<details>` und kein `confirm()`: sie funktioniert
 * ohne JavaScript, ist mit der Tastatur bedienbar, und der gefährliche Knopf
 * bleibt hinter einem bewussten Schritt.
 *
 * `useActionState` ist trotzdem nötig — nicht für die Bestätigung, sondern für
 * den Fehlerfall. Schlägt das Löschen fehl, muss der Nutzer das erfahren; ohne
 * State landete er in der Übersicht, sähe sein Notebook weiterhin und wüsste
 * nicht, warum. Formulare mit `useActionState` bleiben dabei progressiv
 * verbessert: ohne JavaScript läuft die Action trotzdem, nur ohne `pending`.
 */
export function NotebookDelete({
  action,
  title
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>
  title: string
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {})

  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-semibold text-err">
        Ja, ich möchte löschen
      </summary>

      <form action={formAction} className="mt-3 flex flex-col gap-3">
        {state.error ? <Notice tone="err">{state.error}</Notice> : null}
        <div>
          <Button type="submit" variant="danger" size="compact" disabled={pending}>
            {pending ? 'Wird gelöscht …' : `„${title}“ endgültig löschen`}
          </Button>
        </div>
      </form>
    </details>
  )
}
