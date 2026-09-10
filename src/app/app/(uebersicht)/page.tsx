/**
 * Übersicht aller Notebooks des angemeldeten Nutzers.
 *
 * Liegt in der Route-Gruppe `(uebersicht)`, damit die `loading.tsx` daneben
 * nur diese Seite umspannt und nicht `/app/[notebookId]` — dort würde die
 * Suspense-Grenze den 404 in einen 200 verwandeln. Die Gruppe ändert die URL
 * nicht; die Seite bleibt `/app`.
 *
 * Die Abfrage filtert bewusst NICHT nach `owner_id`: das erledigt die
 * RLS-Policy. Ein fremdes Notebook kann hier nicht auftauchen, selbst wenn
 * diese Datei falsch wäre.
 */
import type { Metadata } from 'next'
import Link from 'next/link'

import { buttonClasses } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Notebooks · Notabene',
  // Der gesamte App-Bereich bleibt aus dem Index. Er ist ohnehin nur
  // angemeldet erreichbar; ein Crawler bekäme die Anmeldeseite zu sehen und
  // würde sie als Duplikat der echten Startseite werten.
  robots: { index: false, follow: false }
}

export default async function AppPage() {
  const supabase = await createClient()

  // Läuft über den RLS-Client: die Abfrage hat keinen owner_id-Filter, weil
  // die Policy ihn setzt. Ein fremdes Notebook kann hier nicht auftauchen,
  // selbst wenn diese Zeile falsch wäre.
  const { data: notebooks, error } = await supabase
    .from('notebooks')
    .select('id, title, emoji, description, updated_at')
    .order('updated_at', { ascending: false })

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Deine Notebooks</h1>
        <span className="flex-1" />
        {notebooks && notebooks.length > 0 ? (
          <Link href="/app/neu" className={buttonClasses()}>
            Neues Notebook
          </Link>
        ) : null}
      </div>

      {error ? (
        // Fehler nennen den Grund und bieten genau eine Handlung an. Nie
        // „Etwas ist schiefgelaufen“.
        <p
          role="alert"
          className="mt-6 rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
        >
          Die Notebooks konnten nicht geladen werden. Bitte die Seite neu laden.
        </p>
      ) : notebooks && notebooks.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((notebook) => (
            <li key={notebook.id}>
              <Link
                href={`/app/${notebook.id}`}
                className="block h-full rounded-card border border-hairline bg-surface p-4 transition-colors hover:border-brand-600"
              >
                <p className="font-bold">
                  {notebook.emoji ? `${notebook.emoji} ` : ''}
                  {notebook.title}
                </p>
                {notebook.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-ink">{notebook.description}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        // Der Leerzustand ist kein Nachtrag: er ist der erste Bildschirm, den
        // jeder neue Nutzer sieht, und deshalb trägt er hier die einzige
        // Handlung — kein zweiter Knopf oben, der mit ihm konkurriert.
        <div className="mt-6 rounded-card border border-hairline bg-surface p-8 text-center">
          <p className="text-3xl" aria-hidden>
            📄
          </p>
          <p className="mt-3 font-bold">Noch keine Notebooks</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-ink">
            Ein Notebook bündelt deine Quellen zu einem Thema. Lege eines an, um loszulegen.
          </p>
          <div className="mt-5">
            <Link href="/app/neu" className={buttonClasses()}>
              Erstes Notebook anlegen
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
