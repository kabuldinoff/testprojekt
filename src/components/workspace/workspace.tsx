'use client'

import { useState, type ReactNode } from 'react'

/**
 * Der Arbeitsbereich in drei Ausprägungen — mit **einem** Markup.
 *
 * ── Was sich je Breite ändert ─────────────────────────────────────────────
 *
 *   ≥ 1280px  Drei Spalten nebeneinander: Quellen · Chat · Studio. Die
 *             Umschaltleiste ist ausgeblendet, weil es nichts umzuschalten
 *             gibt.
 *   768–1279  Der Chat bleibt immer stehen, daneben höchstens **ein**
 *             Seitenpanel. Die Leiste wählt, welches.
 *   < 768px   Ein Bereich zur Zeit. Voreinstellung ist der Chat — wer die
 *             Anwendung auf dem Telefon öffnet, will fragen, nicht verwalten.
 *
 * ── Zwei Entscheidungen, die man sonst falsch macht ───────────────────────
 *
 * **Nichts wird ausgehängt.** Umgeschaltet wird über `display: none` in
 * `globals.css`, nicht über bedingtes Rendern. Würde der Chat beim Wechsel
 * auf „Quellen" aus dem Baum fliegen, wäre beim Zurückwechseln das laufende
 * Gespräch weg — `useChat` hält seinen Zustand im Hook, nicht auf dem Server.
 * Auf dem Telefon wäre das der häufigste Handgriff überhaupt: nachsehen,
 * welche Quellen ausgewählt sind, und weiterfragen.
 *
 * **Keine Tab-Semantik.** Naheliegend wären `role="tablist"` und
 * `role="tab"` — sie wären aber nur unter 1280px wahr, und darüber stünde
 * dieselbe Leiste für drei gleichzeitig sichtbare Bereiche. Rollen, die von
 * der Fensterbreite abhängen, muss man im laufenden Betrieb umschreiben.
 * Stattdessen: gewöhnliche Umschaltknöpfe mit `aria-pressed`, die oberhalb
 * von 1280px gar nicht erst dargestellt werden.
 */

export type Bereich = 'quellen' | 'chat' | 'studio'

const BESCHRIFTUNGEN: Array<{ id: Bereich; label: string }> = [
  { id: 'quellen', label: 'Quellen' },
  { id: 'chat', label: 'Chat' },
  { id: 'studio', label: 'Studio' }
]

export function Workspace({
  titel,
  quellen,
  chat,
  studio
}: {
  /** Überschrift des Notebooks. Steht in der Kopfzeile und bleibt auf allen
   *  Breiten sichtbar — läge sie in einer Spalte, verschwände sie auf dem
   *  Telefon, sobald man den Bereich wechselt. */
  titel: ReactNode
  quellen: ReactNode
  chat: ReactNode
  studio: ReactNode
}) {
  const [aktiv, setAktiv] = useState<Bereich>('chat')

  return (
    <div className="workspace">
      <div className="workspace-kopf">
        <div className="min-w-0 flex-1">{titel}</div>

        {/*
          Die Leiste liegt oben und nicht unten am Bildschirmrand: Eine
          Tab-Leiste am unteren Rand kollidiert auf iOS mit der Systemgeste
          und wandert beim Aufziehen der Tastatur mit. Oben bleibt sie dort,
          wo man sie zuletzt gesehen hat.
        */}
        <div className="workspace-umschalter" role="group" aria-label="Bereich auswählen">
          {BESCHRIFTUNGEN.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAktiv(id)}
              aria-pressed={aktiv === id}
              className={[
                'rounded-pill px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                aktiv === id ? 'bg-brand-600 text-on-brand' : 'text-muted-ink hover:text-ink'
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="workspace-spalten">
        <section
          data-bereich="quellen"
          data-aktiv={aktiv === 'quellen'}
          aria-labelledby="abschnitt-quellen"
          className="workspace-seite"
        >
          {quellen}
        </section>

        {/*
          Der Chat ist die mittlere Spalte und unter 1280px immer sichtbar,
          sobald mehr als eine Spalte passt — er ist der Grund, warum jemand
          das Notebook geöffnet hat.
        */}
        <section
          data-bereich="chat"
          data-aktiv={aktiv === 'chat'}
          aria-labelledby="abschnitt-chat"
          className="workspace-mitte"
        >
          {chat}
        </section>

        <section
          data-bereich="studio"
          data-aktiv={aktiv === 'studio'}
          aria-label="Studio"
          className="workspace-seite workspace-seite--rechts"
        >
          {studio}
        </section>
      </div>
    </div>
  )
}
