'use client'

import { useId } from 'react'

/**
 * Das Symbol eines Notebooks — zum Auswählen, nicht zum Eintippen.
 *
 * ── Warum das vorher ein Textfeld war und warum das nicht ging ────────────
 *
 * Es war eines, mit einem Emoji als Platzhalter. Technisch funktionierte es;
 * beim Benutzen sah es kaputt aus, und zwar aus drei Gründen auf einmal:
 *
 * 1. Ein Emoji als Platzhalter ist von einem gesetzten Wert nicht zu
 *    unterscheiden. Man klickt hinein, versucht ihn zu markieren, nichts
 *    passiert — und schließt daraus, das Feld sei gesperrt.
 * 2. Ein Emoji **tippt** man nicht. Auf dem Mac braucht es
 *    Ctrl+Cmd+Leertaste, auf Windows Win+Punkt. Wer das nicht weiß, tippt
 *    einen Buchstaben und bekommt einen Buchstaben.
 * 3. Das Feld war 96 Pixel breit und trug keinen Hinweis, was hineingehört.
 *
 * Eine Auswahl löst alle drei: Sie zeigt, was möglich ist, braucht keine
 * Tastenkombination und kann nicht leer aussehen, während sie voll ist.
 *
 * ── Warum Radios und nicht Knöpfe mit `aria-pressed` ─────────────────────
 *
 * Weil eine Radiogruppe genau das ist, was hier gemeint ist: **eine** Wahl aus
 * wenigen. Der Browser gibt dafür die Pfeiltastennavigation, die Gruppierung
 * für Screenreader und das Absenden unter einem Namen geschenkt — alles, was
 * eine Knopfleiste von Hand nachbauen müsste. Und das Feld heißt weiterhin
 * `emoji`, die Server Action bleibt unverändert.
 *
 * Die Auswahl ist absichtlich klein. Eine vollständige Emoji-Tafel wäre eine
 * Bibliothek und ein Auswahldialog für eine Zierde.
 */

/**
 * Die Auswahl.
 *
 * Alle acht sind Symbole, die zu Dokumenten und Recherche passen und sich auf
 * kleiner Fläche unterscheiden lassen. Bewusst keine Gesichter: Ein Notebook
 * ist eine Sache, keine Stimmung.
 */
const SYMBOLE: readonly string[] = ['📊', '📈', '📄', '📚', '🗂️', '🔬', '🧭', '💡']

export function EmojiChoice({ defaultValue }: { defaultValue?: string | null }) {
  const name = useId()
  const gewaehlt = defaultValue ?? ''

  /**
   * Ein gespeichertes Symbol, das nicht in der Auswahl steht.
   *
   * **Ohne diesen Zweig wäre die Auswahl ein Datenverlust.** Vor ihr war das
   * Feld ein Textfeld und nahm jedes Emoji an; die Spalte lässt bis zu acht
   * Code Points zu, und solche Werte stehen in der Datenbank. Ist keiner der
   * Knöpfe gewählt, schickt der Browser das Feld **gar nicht** — und aus einem
   * fehlenden Feld wird hier `null`. Das Symbol wäre weg, sobald jemand die
   * Einstellungen öffnet und speichert, ohne es anzufassen. Nachgemessen.
   *
   * Es steht deshalb als zusätzliche, vorausgewählte Möglichkeit da. Wer es
   * behalten will, tut nichts; wer es loswerden will, wählt „ohne".
   */
  const eigenes = gewaehlt.length > 0 && !SYMBOLE.includes(gewaehlt) ? gewaehlt : null

  return (
    <fieldset>
      <legend className="text-sm font-semibold">Symbol</legend>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {/*
          „Ohne" steht vorn und ist die Voreinstellung. Ein Notebook ohne
          Symbol ist der Normalfall, kein Sonderfall — und wer eines gewählt
          hat, muss es wieder loswerden können.
        */}
        <Wahl name={name} wert="" gewaehlt={gewaehlt} label="Ohne Symbol">
          {/*
            `muted-ink`, nicht `faint-ink`: „Ohne" ist vorausgewählt und sitzt
            damit auf `brand-50`. Dort misst `faint-ink` nur 4.04:1 und
            verfehlt AA — in beiden Ausprägungen. Gefunden vom axe-Durchlauf,
            nicht beim Hinsehen. `muted-ink` erreicht 6.00:1 im Dunkeln und
            5.40:1 im Hellen; `contrast.test.ts` hält das Paar seitdem fest.
          */}
          <span aria-hidden className="text-xs font-semibold text-muted-ink">
            ohne
          </span>
        </Wahl>

        {eigenes ? (
          <Wahl name={name} wert={eigenes} gewaehlt={gewaehlt} label={`${eigenes} (eigenes)`}>
            <span aria-hidden className="text-lg leading-none">
              {eigenes}
            </span>
          </Wahl>
        ) : null}

        {SYMBOLE.map((symbol) => (
          <Wahl key={symbol} name={name} wert={symbol} gewaehlt={gewaehlt} label={symbol}>
            <span aria-hidden className="text-lg leading-none">
              {symbol}
            </span>
          </Wahl>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Eine Wahlmöglichkeit.
 *
 * Das Radio liegt **durchsichtig über der ganzen Fläche**, statt `sr-only` in
 * einer Ecke zu sitzen. Beides ist für Screenreader gleichwertig; der
 * Unterschied ist die Klickfläche.
 *
 * Mit `sr-only` ist das Feld ein Punkt von einem Pixel, und ein Zeiger trifft
 * es nie — geklickt wird dann das Label, und alles, was auf das Feld selbst
 * zielt, greift ins Leere. Playwright hat genau das gemeldet: „waiting for
 * element to be visible, enabled and stable", sechsundfünfzig Mal. Ein Test,
 * den man mit `force` ruhigstellt, hätte die Ursache verdeckt statt sie zu
 * zeigen — der Zeiger eines Menschen hat dasselbe Problem.
 *
 * Die Darstellung hängt über `peer-checked` und `peer-focus-visible` am echten
 * Zustand des Feldes, statt ihn in React nachzuhalten — damit kann sie nicht
 * auseinanderlaufen.
 *
 * Der zugängliche Name ist ausgeschrieben („Ohne Symbol", sonst das Zeichen
 * selbst), damit ein Screenreader etwas anzusagen hat.
 */
function Wahl({
  name,
  wert,
  gewaehlt,
  label,
  children
}: {
  name: string
  wert: string
  gewaehlt: string
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="relative block size-10 cursor-pointer">
      <input
        type="radio"
        name="emoji"
        value={wert}
        defaultChecked={gewaehlt === wert}
        aria-label={label}
        // Ein gemeinsamer Name reicht dem Browser zum Gruppieren; `form`
        // bräuchte es nur, wenn die Radios außerhalb des Formulars stünden.
        data-gruppe={name}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
      />
      <span className="grid size-10 place-items-center rounded-control border border-hairline bg-surface transition-colors peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 hover:bg-surface-2">
        {children}
      </span>
    </label>
  )
}
