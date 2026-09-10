import type { Metadata } from 'next'

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
      <h1 className="text-2xl font-extrabold tracking-tight">Deine Notebooks</h1>

      {error ? (
        <p className="mt-6 rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err">
          Die Notebooks konnten nicht geladen werden. Bitte die Seite neu laden.
        </p>
      ) : notebooks && notebooks.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((notebook) => (
            <li key={notebook.id} className="rounded-card border border-hairline bg-surface p-4">
              <p className="font-bold">
                {notebook.emoji ? `${notebook.emoji} ` : ''}
                {notebook.title}
              </p>
              {notebook.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-ink">{notebook.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        // Der Leerzustand ist kein Nachtrag: er ist der erste Bildschirm, den
        // jeder neue Nutzer sieht.
        <div className="mt-6 rounded-card border border-hairline bg-surface p-8 text-center">
          <p className="text-3xl" aria-hidden>
            📄
          </p>
          <p className="mt-3 font-bold">Noch keine Notebooks</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-ink">
            Ein Notebook bündelt deine Quellen zu einem Thema. Anlegen und Quellen hinzufügen kommt
            als Nächstes.
          </p>
        </div>
      )}
    </main>
  )
}
