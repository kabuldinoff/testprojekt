/**
 * Die Symbole des Produkts — von Hand, ohne Bibliothek.
 *
 * Es sind zwei. Eine Icon-Bibliothek brächte tausend mit, von denen 998 im
 * Bundle lägen, damit zwei gezeichnet werden; das ist genau die Abwägung, die
 * CLAUDE.md unter YAGNI meint. Kommt eine dritte dazu, steht sie hier daneben.
 *
 * Beide sind `aria-hidden` und tragen **keinen** eigenen Titel: Sie sitzen
 * ausschließlich in Schaltflächen, deren zugänglicher Name aus `aria-label`
 * kommt. Ein zusätzlicher Titel im SVG ergäbe eine zweite Ansage für dieselbe
 * Schaltfläche.
 *
 * `currentColor` statt einer Farbe, damit sie dieselbe Tinte erben wie der
 * Knopf, in dem sie stehen — sonst wäre jedes Symbol ein Sonderfall der
 * Theme-Umschaltung.
 */

const STRICH = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

/**
 * `richtung` ist die Richtung, in die sich die **Spalte** bewegt — nicht die
 * Seite, auf der der Knopf sitzt.
 *
 * Der Unterschied ist der ganze Zweck der Prop: Der naheliegende Fehler ist,
 * den Pfeil nach der Position des Knopfes zu setzen. Dann zeigt er beim
 * Einklappen und beim Ausklappen gleich, und der Nutzer erfährt aus dem Zeichen
 * nichts über das, was passieren wird.
 */
export function Chevron({ richtung }: { richtung: 'links' | 'rechts' }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" {...STRICH}>
      <path d={richtung === 'links' ? 'M12.5 4 7 10l5.5 6' : 'M7.5 4 13 10l-5.5 6'} />
    </svg>
  )
}

/**
 * Nach oben und nicht nach rechts.
 *
 * Rechts hieße „weiter" — der nächste Schritt in einer Abfolge. Nach oben
 * heißt „hinauf in den Verlauf", und genau dorthin geht die Frage: Sie
 * erscheint über dem Eingabefeld. Das Zeichen beschreibt damit die Bewegung,
 * die der Nutzer gleich sieht.
 */
export function PfeilHoch() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true" {...STRICH}>
      <path d="M10 16V4.5M4.5 10 10 4.5l5.5 5.5" />
    </svg>
  )
}
