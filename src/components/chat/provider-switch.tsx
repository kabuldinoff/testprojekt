'use client'

import { unstable_rethrow } from 'next/navigation'
import { useId, useState, useTransition } from 'react'

import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '@/lib/llm/registry'
import { setChatProvider } from '@/lib/notebooks/actions'

/**
 * Anbieterwahl mit der Wahrheit darunter.
 *
 * Die zwei Teile gehören zusammen und sind deshalb eine Komponente: Die Wahl
 * ohne die Folge wäre eine Einstellung, deren Bedeutung niemand kennt. Der
 * Datenfluss-Text stammt aus `registry.ts` und beschreibt den tatsächlich
 * gebauten Weg — ändert sich der Weg, muss sich dieser Text mit ändern, sonst
 * steht dort eine Unwahrheit.
 *
 * Als Radiogruppe und nicht als `<select>`: es sind zwei Optionen, deren
 * Unterschied erklärt werden muss. In einer Auswahlliste sieht man immer nur
 * eine davon, und die Begründung passt in kein Listenelement.
 */
export function ProviderSwitch({
  notebookId,
  current
}: {
  notebookId: string
  current: ProviderId
}) {
  // Die Auswahl wird sofort angezeigt, bevor der Server geantwortet hat. Ohne
  // das fühlt sich ein Radioknopf kaputt an — man drückt, und nichts passiert,
  // bis die Server Action zurückkommt.
  const [gewaehlt, setGewaehlt] = useState<ProviderId>(current)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, starte] = useTransition()
  const gruppe = useId()

  /**
   * Nimmt die optimistische Anzeige zurück.
   *
   * Eine Anzeige, die eine Einstellung behauptet, die nicht gespeichert wurde,
   * ist schlimmer als die Fehlermeldung allein: Der Nutzer glaubte dann, seine
   * Daten gingen einen anderen Weg.
   */
  function zuruecksetzen(vorher: ProviderId, meldung: string) {
    setGewaehlt(vorher)
    setFehler(meldung)
  }

  function waehlen(id: ProviderId) {
    if (id === gewaehlt) return
    const vorher = gewaehlt
    setGewaehlt(id)
    setFehler(null)

    starte(async () => {
      try {
        const ergebnis = await setChatProvider(notebookId, id)
        if (ergebnis.error) zuruecksetzen(vorher, ergebnis.error)
      } catch (fehler) {
        // `unstable_rethrow` lässt die Kontrollfluss-Ausnahmen des Frameworks
        // durch — vor allem das `redirect('/anmelden')` aus der Action, wenn
        // die Sitzung abgelaufen ist. Würde dieser catch sie schlucken, bliebe
        // der Nutzer auf einer Seite stehen, die ihm eine Einstellung anzeigt,
        // während er gar nicht mehr angemeldet ist.
        unstable_rethrow(fehler)

        // Alles andere ist ein echter Fehlschlag: Netz weg, Server weg. Ohne
        // diesen Zweig bliebe die optimistische Auswahl stehen und behauptete
        // einen Datenweg, den es nicht gibt.
        zuruecksetzen(
          vorher,
          'Der Anbieter konnte nicht gewechselt werden. Bitte erneut versuchen.'
        )
      }
    })
  }

  const aktiv = PROVIDERS[gewaehlt]

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <fieldset disabled={laeuft}>
        <legend className="text-sm font-bold">Antwortmodell</legend>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {PROVIDER_IDS.map((id) => {
            const p = PROVIDERS[id]
            const ausgewaehlt = gewaehlt === id
            return (
              <label
                key={id}
                className={[
                  'flex flex-1 cursor-pointer items-start gap-3 rounded-control border px-3 py-2',
                  'transition-colors focus-within:outline-2 focus-within:outline-offset-2',
                  'focus-within:outline-brand-600',
                  ausgewaehlt
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-hairline hover:border-brand-600'
                ].join(' ')}
              >
                <input
                  type="radio"
                  name={gruppe}
                  value={id}
                  checked={ausgewaehlt}
                  onChange={() => waehlen(id)}
                  className="mt-1 size-4 accent-[var(--brand-600)]"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{p.label}</span>
                  <span className="block text-xs text-muted-ink">{p.hint}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/*
        Der Datenfluss-Text steht unter der Wahl und nicht in einem Tooltip:
        er ist die Begründung für die Wahl, keine Fußnote. `aria-live`, weil er
        sich beim Umschalten ändert, ohne dass der Fokus ihn erreicht — ein
        Screenreader bekäme die Änderung sonst nicht mit.
      */}
      <p
        aria-live="polite"
        className="mt-3 rounded-control border border-hairline bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted-ink"
      >
        {aktiv.dataFlow}
      </p>

      {fehler ? (
        <p role="alert" className="mt-2 text-xs text-err">
          {fehler}
        </p>
      ) : null}
    </div>
  )
}
