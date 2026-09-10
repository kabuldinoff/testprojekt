/**
 * Ladezustand der Notebook-Übersicht.
 *
 * Die Seite ist eine Server-Komponente und wartet auf die Datenbank, bevor
 * irgendetwas erscheint. Ohne diese Datei sieht der Nutzer in dieser Zeit die
 * vorherige Seite oder nichts — beides wirkt, als hätte der Klick nicht
 * funktioniert.
 *
 * Die Platzhalter haben die Maße der echten Karten. Das ist keine Kosmetik:
 * ein Skelett in anderer Größe erzeugt beim Austausch einen Layout-Sprung, und
 * der zählt bei Lighthouse als CLS.
 *
 * ── Warum diese Datei in einer Route-Gruppe liegt ──────────────────────────
 *
 * Eine `loading.tsx` erzeugt eine Suspense-Grenze für ihren gesamten Teilbaum.
 * Next schickt die Hülle dann sofort los — und mit ihr den HTTP-Status 200.
 * Ein `notFound()`, das später in der Seite fällt, kann den Status nicht mehr
 * ändern; die Seite zeigt dann zwar „nicht gefunden", antwortet aber mit 200.
 *
 * Genau das ist passiert, als diese Datei noch eine Ebene höher lag: der
 * Aufruf eines fremden Notebooks lieferte 200 statt 404. Nachgemessen — ohne
 * die Datei 404, mit ihr 200, bei sonst identischem Code.
 *
 * Die Gruppe `(uebersicht)` ändert die URL nicht (die Seite bleibt `/app`),
 * begrenzt die Suspense-Grenze aber auf die Liste. `/app/[notebookId]` liegt
 * außerhalb und behält seinen 404.
 *
 * Die Detailseite bekommt bewusst keinen eigenen Ladezustand: sie macht genau
 * eine schnelle Abfrage, und ein korrekter Statuscode ist mehr wert als ein
 * Skelett für wenige Millisekunden.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-extrabold tracking-tight">Deine Notebooks</h1>

      <ul
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Notebooks werden geladen"
      >
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-card border border-hairline bg-surface p-4">
            <div className="h-4 w-2/3 rounded bg-surface-2" />
            <div className="mt-2.5 h-3 w-full rounded bg-surface-2" />
            <div className="mt-1.5 h-3 w-4/5 rounded bg-surface-2" />
          </li>
        ))}
      </ul>
    </main>
  )
}
