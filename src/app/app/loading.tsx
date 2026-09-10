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
