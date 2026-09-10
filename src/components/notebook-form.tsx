'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import type { FormState } from '@/lib/notebooks/actions'
import { DESCRIPTION_MAX, EMOJI_MAX, TITLE_MAX } from '@/lib/notebooks/schema'

/**
 * Ein Formular für Anlegen und Umbenennen.
 *
 * Dieselbe Überlegung wie bei `auth-form.tsx`: die beiden unterscheiden sich in
 * Knopftext und Vorbelegung, nicht in Struktur, Validierung oder
 * Barrierefreiheit. Zwei Komponenten hätten geheißen, jede Korrektur an der
 * aria-Verdrahtung zweimal zu machen.
 *
 * `useActionState` liefert `pending`: der Knopf ist während des Absendens
 * deaktiviert. Ohne das klickt man zweimal und legt zwei Notebooks an.
 */
export function NotebookForm({
  action,
  submitLabel,
  defaults
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>
  submitLabel: string
  defaults?: { title?: string; emoji?: string | null; description?: string | null }
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          <Field
            label="Symbol"
            name="emoji"
            defaultValue={defaults?.emoji ?? ''}
            maxLength={EMOJI_MAX * 2}
            placeholder="📊"
            autoComplete="off"
          />
        </div>
        <div className="flex-1">
          <Field
            label="Titel"
            name="title"
            defaultValue={defaults?.title ?? ''}
            required
            maxLength={TITLE_MAX}
            placeholder="Quartalsanalyse Q3"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notebook-description" className="text-sm font-semibold">
          Beschreibung <span className="font-normal text-faint-ink">(optional)</span>
        </label>
        <textarea
          id="notebook-description"
          name="description"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          defaultValue={defaults?.description ?? ''}
          placeholder="Worum geht es in diesem Notebook?"
          className="w-full rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint-ink"
        />
      </div>

      {state.error ? <Notice tone="err">{state.error}</Notice> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Einen Moment …' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
