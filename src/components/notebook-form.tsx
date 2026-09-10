/**
 * Ein Formular für Anlegen und Umbenennen eines Notebooks.
 *
 * Bewusst eines statt zweier: die beiden Fälle unterscheiden sich in Knopftext
 * und Vorbelegung, nicht in Struktur, Validierung oder Barrierefreiheit.
 */
'use client'

import { useActionState, useId } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import type { FormState } from '@/lib/notebooks/actions'
import { DESCRIPTION_MAX, EMOJI_MAX, TITLE_MAX } from '@/lib/notebooks/schema'

/**
 * `maxLength` zählt UTF-16-Einheiten, `EMOJI_MAX` zählt Code Points. Ein
 * Code Point außerhalb der Basic Multilingual Plane belegt zwei Einheiten, und
 * genau dort liegen die Emoji. Der Faktor gibt dem Browser-Limit denselben
 * Spielraum, den die serverseitige Prüfung in Code Points erlaubt — sonst
 * schnitte das Feld eine Flaggen-Sequenz beim Tippen ab, obwohl sie gültig ist.
 */
const EMOJI_MAX_UTF16_UNITS = EMOJI_MAX * 2

/** Drei Zeilen zeigen eine typische Beschreibung ganz, ohne die Seite zu dehnen. */
const DESCRIPTION_ROWS = 3

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
  // useId statt einer festen Zeichenkette: eine feste ID kollidiert, sobald
  // irgendwo sonst auf der Seite dieselbe steht — dann zeigt das Label auf das
  // falsche Element und das Feld verliert seinen zugänglichen Namen. Genau das
  // ist hier passiert, als die Detailseite ihre Beschreibung mit derselben ID
  // versah.
  const descriptionId = useId()

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          <Field
            label="Symbol"
            name="emoji"
            defaultValue={defaults?.emoji ?? ''}
            maxLength={EMOJI_MAX_UTF16_UNITS}
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
        <label htmlFor={descriptionId} className="text-sm font-semibold">
          Beschreibung <span className="font-normal text-faint-ink">(optional)</span>
        </label>
        <textarea
          id={descriptionId}
          name="description"
          rows={DESCRIPTION_ROWS}
          maxLength={DESCRIPTION_MAX}
          defaultValue={defaults?.description ?? ''}
          placeholder="Worum geht es in diesem Notebook?"
          className="w-full rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-faint-ink sm:text-sm"
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
