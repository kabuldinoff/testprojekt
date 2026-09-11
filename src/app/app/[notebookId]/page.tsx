/**
 * Detailseite eines Notebooks: Kopf, Einstellungen, Löschen.
 *
 * Bewusst ohne `loading.tsx`: eine Suspense-Grenze über dieser Route würde den
 * Status auf 200 festlegen, bevor `notFound()` fällt — der Aufruf eines
 * fremden Notebooks antwortete dann mit 200 statt 404. Die eine Abfrage hier
 * ist schnell genug, dass ein Skelett den korrekten Statuscode nicht aufwiegt.
 *
 * Die Seite lädt drei Dinge in einem Rutsch: das Notebook, seine Quellen und
 * den Gesprächsverlauf. Der Verlauf geht als Ausgangszustand an den Chat —
 * damit gibt es eine einzige Wahrheit für „welche Nachrichten existieren",
 * statt eines zweiten Zustands für alte Nachrichten.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { ChatPanel } from '@/components/chat/chat-panel'
import { ProviderSwitch } from '@/components/chat/provider-switch'
import { NotesPanel, type NoteItem } from '@/components/notes/notes-panel'
import { AudioOverview, type AudioOverviewItem } from '@/components/studio/audio-overview'
import { NotebookDelete } from '@/components/notebook-delete'
import type { StoredMessage } from '@/lib/chat/ui'
import { providerOrDefault } from '@/lib/llm/registry'
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
    .select('id, title, emoji, description, chat_provider')
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
  const { data: sourceRows, error: sourcesError } = await supabase
    .from('sources')
    .select('id, title, kind, status, error_message, page_count, char_count')
    .eq('notebook_id', notebook.id)
    .order('created_at', { ascending: true })

  // Denselben Fehler hatte ich eine Funktion weiter oben schon einmal
  // gemacht: den `error` wegwerfen und `?? []` schreiben. Dann wird aus einer
  // gescheiterten Abfrage „Noch keine Quellen" — der Nutzer glaubt, seine
  // Dokumente seien weg.
  const sources: SourceItem[] = sourceRows ?? []

  // Der Verlauf. Aufsteigend, weil ein Gespräch von oben nach unten gelesen
  // wird — die Umkehrung wäre ein Sortierschritt im Client für nichts.
  const { data: messageRows, error: messagesError } = await supabase
    .from('messages')
    .select('id, role, content, citations')
    .eq('notebook_id', notebook.id)
    .order('created_at', { ascending: true })

  const history: StoredMessage[] = (messageRows ?? []) as StoredMessage[]

  const { data: noteRows, error: notesError } = await supabase
    .from('notes')
    .select('id, title, content, origin, citations')
    .eq('notebook_id', notebook.id)
    .order('updated_at', { ascending: false })

  const notes: NoteItem[] = (noteRows ?? []) as NoteItem[]

  // Der Audio-Überblick. `maybeSingle`, weil es höchstens einen je Notebook
  // gibt — das erzwingt die Eindeutigkeitsbedingung in Migration 0011.
  const { data: overviewRow } = await supabase
    .from('audio_overviews')
    .select('status, script, duration_seconds, error_message, storage_path')
    .eq('notebook_id', notebook.id)
    .maybeSingle<{
      status: AudioOverviewItem['status']
      script: string | null
      duration_seconds: number | null
      error_message: string | null
      storage_path: string | null
    }>()

  // Die Adresse wird hier signiert und nicht im Client geholt: Der Bucket ist
  // privat, und eine Function darf die Datei nicht durchreichen — Vercel
  // begrenzt Antwortkörper auf 4,5 MB, ein dreiminütiger Überblick ist rund
  // 8 MB groß. Eine Stunde Gültigkeit reicht für das Anhören und ist kurz
  // genug, dass eine weitergegebene Adresse nicht dauerhaft trägt.
  let audioUrl: string | null = null
  if (overviewRow?.status === 'ready' && overviewRow.storage_path) {
    const { data: signed } = await supabase.storage
      .from('audio')
      .createSignedUrl(overviewRow.storage_path, 3600)
    audioUrl = signed?.signedUrl ?? null
  }

  const overview: AudioOverviewItem | null = overviewRow
    ? {
        status: overviewRow.status,
        script: overviewRow.script,
        durationSeconds: overviewRow.duration_seconds,
        errorMessage: overviewRow.error_message,
        audioUrl
      }
    : null

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

      {/*
        `aria-labelledby` macht aus dem <section> eine benannte Landmarke. Ohne
        zugänglichen Namen hat ein <section> überhaupt keine Rolle — für die
        Navigation per Screenreader ist es dann ein <div>. Nebeneffekt, der
        beim Testen half: die Abschnitte werden adressierbar, statt dass ein
        `getByLabel('Titel')` quer über die Seite greift.
      */}
      <section className="mt-8 flex flex-col gap-4" aria-labelledby="abschnitt-quellen">
        <h2 id="abschnitt-quellen" className="text-base font-bold">
          Quellen
        </h2>
        {sourcesError ? (
          <p
            role="alert"
            className="rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
          >
            Die Quellen konnten nicht geladen werden. Bitte die Seite neu laden.
          </p>
        ) : (
          <SourceList sources={sources} />
        )}
        <AddSource notebookId={notebook.id} />
      </section>

      <section className="mt-8 flex flex-col gap-4" aria-labelledby="abschnitt-chat">
        <h2 id="abschnitt-chat" className="text-base font-bold">
          Chat
        </h2>
        <ProviderSwitch
          notebookId={notebook.id}
          current={providerOrDefault(notebook.chat_provider).id}
        />
        {messagesError ? (
          <p
            role="alert"
            className="rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
          >
            Der bisherige Verlauf konnte nicht geladen werden. Bitte die Seite neu laden.
          </p>
        ) : (
          <ChatPanel
            notebookId={notebook.id}
            sources={sources.map((s) => ({ id: s.id, title: s.title, status: s.status }))}
            history={history}
          />
        )}
      </section>

      <section className="mt-8 flex flex-col gap-4" aria-labelledby="abschnitt-studio">
        <h2 id="abschnitt-studio" className="text-base font-bold">
          Studio
        </h2>
        <AudioOverview
          notebookId={notebook.id}
          overview={overview}
          provider={providerOrDefault(notebook.chat_provider).id}
          hasReadySource={sources.some((s) => s.status === 'ready')}
        />
      </section>

      <section className="mt-8 flex flex-col gap-4" aria-labelledby="abschnitt-notizen">
        <h2 id="abschnitt-notizen" className="text-base font-bold">
          Notizen
        </h2>
        {notesError ? (
          <p
            role="alert"
            className="rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
          >
            Die Notizen konnten nicht geladen werden. Bitte die Seite neu laden.
          </p>
        ) : (
          <NotesPanel notebookId={notebook.id} notes={notes} />
        )}
      </section>

      <section
        className="mt-8 rounded-card border border-hairline bg-surface p-6"
        aria-labelledby="abschnitt-einstellungen"
      >
        <h2 id="abschnitt-einstellungen" className="mb-4 text-base font-bold">
          Einstellungen
        </h2>
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
