'use client'

import { useRef, useState, type ReactNode } from 'react'

import { Chevron } from '@/components/ui/icons'

/**
 * Der Arbeitsbereich in drei Ausprägungen — mit **einem** Markup.
 *
 * ── Was sich je Breite ändert ─────────────────────────────────────────────
 *
 *   ≥ 1280px  Drei Spalten nebeneinander: Quellen · Chat · Studio. Die
 *             Umschaltleiste ist ausgeblendet, weil es nichts umzuschalten
 *             gibt — dafür lässt sich jede Seitenspalte einklappen und der
 *             Chat nimmt den Platz.
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
 *
 * **Zwei Zustände, aber nie gleichzeitig wirksam.** `data-aktiv` entscheidet
 * unterhalb von 1280px, `data-offen` ausschließlich darüber; jedes gilt nur
 * in seiner Media Query. Beide gleichzeitig anzuwenden hieße, einen Bereich
 * verstecken zu können, den die Umschaltleiste daneben als aktiv anzeigt.
 * Deshalb behält jede Breite genau ein Kriterium.
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

  // Welche Seitenspalte auf Desktop ausgeklappt ist. Bewusst nicht gespeichert:
  // Es ist eine Einstellung für einen Moment — „jetzt gerade brauche ich mehr
  // Platz für die Antwort" —, keine Vorliebe. Eine über Tage nachwirkende
  // leere Spalte wäre die unangenehmere Überraschung.
  const [offen, setOffen] = useState<Record<'quellen' | 'studio', boolean>>({
    quellen: true,
    studio: true
  })

  const chatRef = useRef<HTMLElement>(null)

  /**
   * Springt zum Chat.
   *
   * Der Grund: In der Dokumentreihenfolge steht die Quellenspalte vor dem
   * Chat. Wer mit der Tastatur arbeitet, tabbt sich sonst durch Quellenliste,
   * Hinzufügen-Formular und Einstellungen, bevor er zum Eingabefeld kommt —
   * bei jedem Seitenaufruf.
   *
   * Als Knopf und nicht als Sprungmarke: Unterhalb von 1280px kann der Chat
   * gerade ausgeblendet sein, und ein `href="#…"` auf ein Element mit
   * `display: none` bewirkt nichts. Der Knopf schaltet erst um und setzt dann
   * den Fokus.
   */
  function zumChat() {
    setAktiv('chat')
    // Nach dem Zustandswechsel, damit das Ziel sichtbar ist.
    requestAnimationFrame(() => chatRef.current?.focus())
  }

  return (
    <div className="workspace">
      {/*
        Sichtbar nur mit Tastaturfokus. Ein immer sichtbarer Sprunglink wäre
        für die Mehrheit Lärm, ein unsichtbarer für die Minderheit unbrauchbar
        — `sr-only` mit `focus:not-sr-only` ist der übliche Kompromiss.

        **Jede** Gestaltung steht hinter `focus:`, auch Polsterung und Farbe.
        Der erste Anlauf schrieb `px-4 py-2` ohne Präfix daneben, und das
        Element war ohne Fokus 32 Pixel breit statt einen: `sr-only` setzt
        `padding: 0`, und die Polsterungsklasse steht im erzeugten Stylesheet
        dahinter. Tailwind v4 löst solche Konflikte über die Reihenfolge im
        Stylesheet, nicht über die im class-Attribut — dieselbe Falle, die im
        Kommentar von `ui/button.tsx` beschrieben ist.
      */}
      <button
        type="button"
        onClick={zumChat}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-control focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-brand"
      >
        Zum Chat springen
      </button>

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

        {/*
          Nur auf Desktop sichtbar (`.workspace-klapper` in globals.css).
          `aria-pressed` beschreibt den Knopf, nicht die Spalte: gedrückt heißt
          eingeklappt. Der Pfeil zeigt dabei in die Richtung, in die sich die
          Spalte bewegt — bei der linken also nach links, wenn sie weichen soll.
        */}
        <div className="workspace-klapper" role="group" aria-label="Spalten einklappen">
          <Klapper
            seite="links"
            offen={offen.quellen}
            label="Quellenspalte"
            onToggle={() => setOffen((v) => ({ ...v, quellen: !v.quellen }))}
          />
          <Klapper
            seite="rechts"
            offen={offen.studio}
            label="Studiospalte"
            onToggle={() => setOffen((v) => ({ ...v, studio: !v.studio }))}
          />
        </div>
      </div>

      <div className="workspace-spalten">
        <section
          data-bereich="quellen"
          data-aktiv={aktiv === 'quellen'}
          data-offen={offen.quellen}
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
          ref={chatRef}
          // -1: nicht in der Tabulatorreihenfolge, aber per Skript
          // fokussierbar. Sonst landete der Sprunglink auf einem Element, das
          // den Fokus gar nicht annehmen kann.
          tabIndex={-1}
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
          data-offen={offen.studio}
          aria-label="Studio"
          className="workspace-seite workspace-seite--rechts"
        >
          {studio}
        </section>
      </div>
    </div>
  )
}

/**
 * Ein Klappknopf für eine Seitenspalte.
 *
 * Der zugängliche Name sagt, was passiert, nicht was ist — „Quellenspalte
 * einklappen" statt „Quellenspalte". Ein Symbolknopf ohne Text hat sonst
 * keinen Namen, und „Chevron" wäre keiner.
 */
function Klapper({
  seite,
  offen,
  label,
  onToggle
}: {
  seite: 'links' | 'rechts'
  offen: boolean
  label: string
  onToggle: () => void
}) {
  // Ausgeklappt weist der Pfeil nach außen (die Spalte weicht dorthin),
  // eingeklappt nach innen (sie käme von dort zurück).
  const richtung = offen === (seite === 'links') ? 'links' : 'rechts'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!offen}
      aria-label={`${label} ${offen ? 'einklappen' : 'ausklappen'}`}
      className="rounded-control p-1.5 text-muted-ink transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <Chevron richtung={richtung} />
    </button>
  )
}
