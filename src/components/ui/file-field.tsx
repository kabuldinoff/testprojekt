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
 * `sr-only` statt `display: none` oder `hidden`: Ein verstecktes Feld ist nicht
 * fokussierbar, und damit wäre das Formular mit der Tastatur nicht mehr
 * bedienbar. `focus-within` am Label zeigt den Fokus dann dort, wo der Nutzer
 * hinschaut — am Knopf und nicht an einem unsichtbaren Punkt daneben.
 */
export function FileField({
  label,
  hint,
  error,
  inputRef,
  onChange,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'className' | 'ref'> & {
  label: string
  hint?: string
  /**
   * Die Fehlermeldung, falls eine ansteht.
   *
   * Sie wird hier **nicht angezeigt** — das tut der Aufrufer über `Notice`,
   * damit alle Fehler des Formulars an einer Stelle stehen. Gebraucht wird sie
   * für die Verknüpfung: `aria-describedby` und `aria-invalid`. Ohne die liest
   * ein Screenreader das Feld als in Ordnung vor, während darüber „Bitte eine
   * Datei auswählen" steht.
   */
  error?: string | undefined
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
            aria-invalid={error ? true : undefined}
            // Hinweis und Fehler zusammen, in dieser Reihenfolge: Ein
            // Screenreader liest sie beim Betreten des Feldes hintereinander
            // vor, und was gerade schiefging, gehört ans Ende.
            aria-describedby={
              [error ? `${id}-fehler` : null, hint ? hintId : null]
                .filter(Boolean)
                .join(' ')
                .trim() || undefined
            }
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

      {/*
        Der Fehlertext steht beim Aufrufer, damit das Formular eine einzige
        Fehlerstelle hat. Hier steht er nur noch einmal für Screenreader, an
        das Feld gebunden — sichtbar ist er nicht, doppelt vorgelesen wird er
        deshalb auch nicht: `Notice` trägt `role="alert"` und wird beim
        Erscheinen angesagt, dieser Text beim Betreten des Feldes.
      */}
      {error ? (
        <span id={`${id}-fehler`} className="sr-only">
          {error}
        </span>
      ) : null}
    </div>
  )
}
