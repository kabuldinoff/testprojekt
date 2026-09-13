'use client'

import { useId, useState, type ChangeEvent, type ComponentProps, type Ref } from 'react'

/**
 * Ein Dateifeld, dessen Beschriftung uns gehört.
 *
 * ── Warum nicht einfach `<input type="file">` ─────────────────────────────
 *
 * Weil der Browser neben den Knopf einen Text schreibt, den man weder ändern
 * noch abschneiden kann und der je nach Browser und Sprache anders lautet:
 * „Keine ausgewählt", „No file chosen", „Aucun fichier choisi". In der
 * Quellenspalte passte er nicht und wurde zu „Kein…wählt" — ein Wort, das es
 * nicht gibt, mitten im Formular.
 *
 * `::file-selector-button` gestaltet nur den **Knopf**. An den Text daneben
 * kommt CSS nicht heran; er ist Teil des Shadow-DOM und in keinem Browser
 * ansprechbar. Die einzige Lösung ist, ihn gar nicht erst zu zeigen.
 *
 * ── Wie das hier funktioniert ────────────────────────────────────────────
 *
 * Das echte Feld bleibt im Formular und behält seinen Namen, seine
 * Validierung und seinen `accept`-Filter — es wird nur unsichtbar. Sichtbar
 * sind ein `<label>`, das wie ein Knopf aussieht, und unser eigener Text.
 *
 * `sr-only` statt `display: none` oder `hidden`: Ein verstecktes Feld ist
 * nicht fokussierbar, und damit wäre das Formular mit der Tastatur nicht mehr
 * bedienbar. So bleibt es in der Tabulatorreihenfolge, und `focus-within` am
 * Label zeigt den Fokus dort, wo der Nutzer hinschaut.
 */
export function FileField({
  label,
  hint,
  inputRef,
  onChange,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'className' | 'ref'> & {
  label: string
  hint?: string
  inputRef?: Ref<HTMLInputElement>
}) {
  const id = useId()
  const hintId = `${id}-hinweis`
  const [dateiname, setDateiname] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-semibold">
        {label}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="cursor-pointer rounded-control border border-hairline bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600"
        >
          <input
            {...props}
            id={id}
            type="file"
            ref={inputRef}
            aria-labelledby={`${id}-label`}
            aria-describedby={hint ? hintId : undefined}
            className="sr-only"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setDateiname(event.target.files?.[0]?.name ?? null)
              onChange?.(event)
            }}
          />
          Datei auswählen
        </label>

        {/*
          `min-w-0` und `truncate`: Ein langer Dateiname darf die Spalte nicht
          sprengen. Abgeschnitten wird am Ende und mit Auslassungszeichen —
          anders als beim Browser, der mitten im Wort kappt.

          Der volle Name steht im `title`, damit er beim Überfahren lesbar
          bleibt.
        */}
        <span
          className="min-w-0 flex-1 truncate text-sm text-faint-ink"
          title={dateiname ?? undefined}
        >
          {dateiname ?? 'Keine Datei gewählt'}
        </span>
      </div>

      {hint ? (
        <p id={hintId} className="text-xs text-faint-ink">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
