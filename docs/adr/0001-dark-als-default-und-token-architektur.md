# 0001 — Dark als Default, und Tokens statt `dark:`-Prefixe

**Datum:** 2026-09-10 · **Status:** angenommen

## Kontext

Das Produkt braucht beide Designs. Die Referenzoberflächen, an denen es sich orientiert, sind
hell; die Marke, aus der die Palette stammt, hat einen ausgeprägten dunklen Verlauf
(`#0E1424 → #1B2640`). Beides gleichwertig zu behandeln klingt fair, führt aber dazu, dass
keines von beiden wirklich entworfen wird.

Dazu kommt die übliche Falle: Sobald Komponenten `dark:`-Prefixe tragen, ist jede Farbe zweimal
im Code, an dreihundert Stellen. Eine vergessene Stelle fällt niemandem auf, bis jemand das
andere Design benutzt.

## Entscheidung

**Dark ist der Default**, auch für Erstbesucher ohne gespeicherte Präferenz. Light ist die
zweite Ausprägung. Konkret heißt das: die Landing Page wird gegen `#0E1424` entworfen und
gemessen, nicht gegen Weiß.

**Farben leben ausschließlich in Tokens.** Zwei Ebenen in `src/app/globals.css`:

1. Semantische Variablen (`--surface`, `--ink`, `--cite-bg`, …), einmal pro Theme gesetzt.
2. `@theme inline`, das `--color-*` darauf mappt. Das `inline` ist der eigentliche Trick — die
   erzeugten Utilities referenzieren die Variable, statt ihren Wert einzubacken. Nur deshalb
   schaltet `bg-canvas` beim Theme-Wechsel überhaupt um.

Komponenten benutzen damit nur noch `bg-surface`, `text-ink`, `border-hairline` — nie einen
Hex-Wert und **keinen einzigen `dark:`-Prefix**.

Es gibt **keine System-Option**. Zwei Zustände statt drei sparen einen Sonderfall im Umschalter,
ohne dass jemandem etwas fehlt.

## Alternativen

**`dark:`-Prefixe in Komponenten.** Der Weg, den Tailwind nahelegt. Verworfen: er verteilt jede
Farbentscheidung über die gesamte Codebasis und macht eine Palettenänderung zu einem Refactoring.

**`@theme` ohne `inline`.** Kürzer, aber die Werte werden in die Utilities eingebacken und sind
zur Laufzeit unveränderlich — Theme-Wechsel funktioniert dann schlicht nicht.

**System-Präferenz als Default.** Ehrlicher gegenüber dem Nutzer, aber es bedeutet, dass die
erste Begegnung mit dem Produkt zufällig hell oder dunkel ist. Für ein Produkt, dessen Anmutung
Teil der Aussage ist, ist das zu viel Zufall. Der Umschalter steht sichtbar im Kopfbereich.

## Konsequenzen

- Die Reihenfolge der Token-Blöcke ist **tragend**: `:root, .dark` muss vor `.light` stehen. Alle
  drei Selektoren haben die Spezifität 0,1,0, bei Gleichstand gewinnt die spätere Regel. Steht
  der `:root`-Block hinten, überstimmt er jedes `.light` — der Umschalter tut sichtbar nichts,
  ohne Fehlermeldung und ohne dass ein Test rot wird. Genau das ist während der Entwicklung
  einmal passiert; `src/lib/__tests__/theme-tokens.test.ts` prüft die Reihenfolge seither.
- Derselbe Test prüft, dass **beide Blöcke exakt dieselben Token-Namen definieren**. Fehlt eines
  im Light-Block, erbt das Element still den dunklen Wert und wird unsichtbar.
- Der Theme-Umschalter ist die **einzige** Stelle, die die Theme-Klasse kennt. Er braucht das,
  weil sein Symbol vom Theme abhängt; gelöst über die zwei Hilfsklassen `.only-dark` /
  `.only-light` in `globals.css` statt über State — Server und Client rendern damit identisches
  Markup, es gibt keinen Hydration-Mismatch und keine zweite Renderrunde.

## Bewusst nicht enthalten

Eine System-Option, ein Übergangseffekt beim Wechsel (`disableTransitionOnChange` ist gesetzt —
ein Farbverlauf über die ganze Seite sieht bei jedem Wechsel billig aus), und pro Komponente
abweichende Paletten.
