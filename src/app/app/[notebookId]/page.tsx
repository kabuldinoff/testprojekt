import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { NotebookForm } from '@/components/notebook-form'
import { Button } from '@/components/ui/button'
import { deleteNotebook, updateNotebook } from '@/lib/notebooks/actions'
import { createClient } from '@/lib/supabase/server'

const ladeNotebook = cache(async (notebookId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notebooks')
    .select('id, title, emoji, description')
    .eq('id', notebookId)
    .maybeSingle()
  return data
})

export async function generateMetadata({
  params
}: PageProps<'/app/[notebookId]'>): Promise<Metadata> {
  const { notebookId } = await params
  const notebook = await ladeNotebook(notebookId)
  if (!notebook) notFound()
  return { title: `${notebook.title} · Notabene`, robots: { index: false, follow: false } }
}

export default async function NotebookPage({ params }: PageProps<'/app/[notebookId]'>) {
  const { notebookId } = await params
  const notebook = await ladeNotebook(notebookId)

  // 404, nicht 403. Ein 403 würde bestätigen, dass es dieses Notebook gibt —
  // und damit genau die Information preisgeben, die RLS gerade verborgen hat.
  if (!notebook) notFound()

  // Die Action braucht die ID; `bind` reicht sie durch, ohne sie in ein
  // verstecktes Formularfeld zu schreiben, wo der Client sie ändern könnte.
  const update = updateNotebook.bind(null, notebook.id)
  const remove = deleteNotebook.bind(null, notebook.id)

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/app" className="text-sm text-muted-ink hover:text-ink">
        ← Zurück zur Übersicht
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
        {notebook.emoji ? `${notebook.emoji} ` : ''}
        {notebook.title}
      </h1>
      {notebook.description ? (
        <p className="mt-1 text-sm text-muted-ink">{notebook.description}</p>
      ) : null}

      <section className="mt-8 rounded-card border border-hairline bg-surface p-6">
        <h2 className="text-base font-bold">Quellen</h2>
        <p className="mt-1 text-sm text-muted-ink">
          Hochladen, Verarbeiten und Befragen von Quellen kommt in der nächsten Scheibe.
        </p>
      </section>

      <section className="mt-4 rounded-card border border-hairline bg-surface p-6">
        <h2 className="mb-4 text-base font-bold">Einstellungen</h2>
        <NotebookForm
          action={update}
          submitLabel="Speichern"
          defaults={{
            title: notebook.title,
            emoji: notebook.emoji,
            description: notebook.description
          }}
        />
      </section>

      <section className="mt-4 rounded-card border border-hairline bg-surface p-6">
        <h2 className="text-base font-bold text-err">Notebook löschen</h2>
        <p className="mt-1 text-sm text-muted-ink">
          Entfernt das Notebook und alles darin. Das lässt sich nicht rückgängig machen.
        </p>

        {/*
          Bestätigung über <details> statt über confirm(): das funktioniert ohne
          JavaScript, ist mit der Tastatur bedienbar und hält den gefährlichen
          Knopf hinter einem bewussten Schritt. Ein Browser-Dialog wäre schneller
          gebaut und schlechter in allen drei Punkten.
        */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-err">
            Ja, ich möchte löschen
          </summary>
          <form action={remove} className="mt-3">
            <Button type="submit" variant="danger" size="compact">
              „{notebook.title}“ endgültig löschen
            </Button>
          </form>
        </details>
      </section>
    </main>
  )
}
