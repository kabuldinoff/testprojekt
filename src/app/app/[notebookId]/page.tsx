/**
 * Detailseite eines Notebooks: Kopf, Einstellungen, Löschen.
 *
 * Bewusst ohne `loading.tsx`: eine Suspense-Grenze über dieser Route würde den
 * Status auf 200 festlegen, bevor `notFound()` fällt — der Aufruf eines
 * fremden Notebooks antwortete dann mit 200 statt 404. Die eine Abfrage hier
 * ist schnell genug, dass ein Skelett den korrekten Statuscode nicht aufwiegt.
 *
 * Der Platz für Quellen ist vorgesehen, aber noch leer; er kommt mit der
 * Ingestion-Scheibe.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { NotebookDelete } from '@/components/notebook-delete'
import { AddSource } from '@/components/sources/add-source'
import { SourceList, type SourceItem } from '@/components/sources/source-list'
import { NotebookForm } from '@/components/notebook-form'
import { deleteNotebook, updateNotebook } from '@/lib/notebooks/actions'
import { createClient } from '@/lib/supabase/server'

/**
 * Lädt ein Notebook — oder unterscheidet sauber, warum nicht.
 *
 * `cache()` von React, damit `generateMetadata` und die Seite dieselbe Abfrage
 * teilen statt zweimal in die Datenbank zu gehen.
 *
 * Der Rückgabewert trennt zwei Fälle, die sich sonst gleich anfühlen und
 * grundverschieden sind: **nicht vorhanden** (oder nicht meins — RLS liefert
 * beides als leeres Ergebnis) führt zu 404. Ein **Fehler** der Abfrage —
 * Netz weg, Datenbank pausiert — darf nicht als 404 erscheinen: der Nutzer
 * bekäme „gibt es nicht" für etwas, das es sehr wohl gibt, und würde es nie
 * wieder aufrufen.
 */
const loadNotebook = cache(async (notebookId: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notebooks')
    .select('id, title, emoji, description')
    .eq('id', notebookId)
    .maybeSingle()

  if (error) return { status: 'error' as const }
  if (!data) return { status: 'missing' as const }
  return { status: 'ok' as const, notebook: data }
})

export async function generateMetadata({
  params
}: PageProps<'/app/[notebookId]'>): Promise<Metadata> {
  const { notebookId } = await params
  const result = await loadNotebook(notebookId)

  // Kein notFound() hier: über den Statuscode entscheidet die Seite. Bei einem
  // Abfragefehler wäre ein 404 aus den Metadaten schlicht falsch.
  const title = result.status === 'ok' ? `${result.notebook.title} · Notabene` : 'Notabene'
  return { title, robots: { index: false, follow: false } }
}

export default async function NotebookPage({ params }: PageProps<'/app/[notebookId]'>) {
  const { notebookId } = await params
  const result = await loadNotebook(notebookId)

  // Ein Abfragefehler ist kein 404. Der Nutzer bekommt eine Meldung, die den
  // Grund nennt und eine Handlung anbietet, statt „gibt es nicht" für etwas,
  // das es gibt.
  if (result.status === 'error') {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/app" className="text-sm text-muted-ink hover:text-ink">
          ← Zurück zur Übersicht
        </Link>
        <p
          role="alert"
          className="mt-6 rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
        >
          Dieses Notebook konnte nicht geladen werden. Bitte die Seite neu laden.
        </p>
      </main>
    )
  }

  // 404, nicht 403. Ein 403 würde bestätigen, dass es dieses Notebook gibt —
  // und damit genau die Information preisgeben, die RLS gerade verborgen hat.
  if (result.status === 'missing') notFound()

  const notebook = result.notebook

  // Kein notebook_id-Filter nötig für die Sicherheit — die Policy setzt ihn.
  // Er steht hier trotzdem, weil sonst alle Quellen aller eigenen Notebooks
  // zurückkämen: RLS entscheidet über Zugriff, nicht über Relevanz.
  const supabase = await createClient()
  const { data: sourceRows } = await supabase
    .from('sources')
    .select('id, title, kind, status, error_message, page_count, char_count')
    .eq('notebook_id', notebook.id)
    .order('created_at', { ascending: true })

  const sources: SourceItem[] = sourceRows ?? []

  // Die Action braucht die ID; `bind` reicht sie durch, ohne sie in ein
  // verstecktes Formularfeld zu schreiben, wo der Client sie ändern könnte.
  const update = updateNotebook.bind(null, notebook.id)
  const remove = deleteNotebook.bind(null, notebook.id)

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/app" className="text-sm text-muted-ink hover:text-ink">
        ← Zurück zur Übersicht
      </Link>

      {/*
        aria-describedby verknüpft die Beschreibung mit der Überschrift. Ein
        Screenreader liest sie damit zusammen vor, statt sie als losen Absatz
        zu behandeln — und Tests können sie über die zugängliche Beschreibung
        finden, statt über die Elementhierarchie.
      */}
      <h1
        className="mt-4 text-2xl font-extrabold tracking-tight"
        aria-describedby={notebook.description ? 'notebook-summary' : undefined}
      >
        {notebook.emoji ? `${notebook.emoji} ` : ''}
        {notebook.title}
      </h1>
      {notebook.description ? (
        <p id="notebook-summary" className="mt-1 text-sm text-muted-ink">
          {notebook.description}
        </p>
      ) : null}

      <section className="mt-8 flex flex-col gap-4">
        <h2 className="text-base font-bold">Quellen</h2>
        <SourceList sources={sources} />
        <AddSource notebookId={notebook.id} />
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

        <NotebookDelete action={remove} title={notebook.title} />
      </section>
    </main>
  )
}
