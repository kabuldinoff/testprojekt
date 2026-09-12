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
import { Workspace } from '@/components/workspace/workspace'
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
/**
 * Gültigkeit der signierten Audio-Adresse.
 *
 * Eine Stunde: lang genug, dass ein Überblick zu Ende gehört werden kann —
 * auch mit Pausen und Zurückspringen —, und kurz genug, dass eine
 * weitergegebene Adresse nicht dauerhaft trägt. Die Seite wird bei jedem
 * Aufruf serverseitig gerendert, eine neue Adresse kostet also nichts.
 */
const AUDIO_URL_TTL_SECONDS = 3600

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
  // `robots` steht nicht hier: Das Layout unter src/app/app/ setzt es für
  // den ganzen Bereich. Vier Seiten, die dasselbe erklären, sind vier
  // Gelegenheiten, es bei der fünften zu vergessen.
  return { title }
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
  const { data: overviewRow, error: overviewError } = await supabase
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
  // 8 MiB groß.
  let audioUrl: string | null = null
  let signierFehler = false
  if (overviewRow?.status === 'ready' && overviewRow.storage_path) {
    const { data: signed, error: signError } = await supabase.storage
      .from('audio')
      .createSignedUrl(overviewRow.storage_path, AUDIO_URL_TTL_SECONDS)

    // Ein fehlgeschlagenes Signieren still zu übergehen ergäbe einen fertigen
    // Überblick ohne Player und ohne Erklärung — der Nutzer sähe ein
    // Transkript und fragte sich, wo das Audio ist.
    signierFehler = signError !== null || !signed?.signedUrl
    audioUrl = signed?.signedUrl ?? null
  }

  const overview: AudioOverviewItem | null = overviewRow
    ? {
        status: overviewRow.status,
        script: overviewRow.script,
        durationSeconds: overviewRow.duration_seconds,
        errorMessage: overviewRow.error_message,
        audioUrl,
        loadProblem: signierFehler ? 'signatur' : null
      }
    : null

  // Die Action braucht die ID; `bind` reicht sie durch, ohne sie in ein
  // verstecktes Formularfeld zu schreiben, wo der Client sie ändern könnte.
  const update = updateNotebook.bind(null, notebook.id)
  const remove = deleteNotebook.bind(null, notebook.id)

  return (
    <Workspace
      titel={
        <div className="min-w-0">
          <h1
            className="truncate text-base font-bold tracking-tight"
            aria-describedby={notebook.description ? 'notebook-summary' : undefined}
          >
            {notebook.emoji ? `${notebook.emoji} ` : ''}
            {notebook.title}
          </h1>
          {notebook.description ? (
            <p id="notebook-summary" className="truncate text-xs text-muted-ink">
              {notebook.description}
            </p>
          ) : null}
        </div>
      }
      quellen={
        <>
          <h2 id="abschnitt-quellen" className="mb-3 text-sm font-bold">
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

          <div className="mt-4">
            <AddSource notebookId={notebook.id} />
          </div>

          {/*
            Einstellungen und Löschen stehen am Fuß der Quellenspalte und
            nicht im Chat: Es sind Verwaltungsaufgaben, und diese Spalte ist
            die, in der verwaltet wird. Zugeklappt, weil sie selten gebraucht
            werden und sonst die Quellen nach oben drängen.
          */}
          <details className="mt-6 border-t border-hairline pt-4">
            <summary className="cursor-pointer text-sm font-bold">Einstellungen</summary>

            <div className="mt-4">
              <NotebookForm
                action={update}
                submitLabel="Speichern"
                titleLabel="Notebook-Titel"
                defaults={{
                  title: notebook.title,
                  emoji: notebook.emoji,
                  description: notebook.description
                }}
              />
            </div>

            <div className="mt-6 border-t border-hairline pt-4">
              <h3 className="text-sm font-bold text-err">Notebook löschen</h3>
              <p className="mt-1 text-xs text-muted-ink">
                Entfernt das Notebook und alles darin. Das lässt sich nicht rückgängig machen.
              </p>
              <NotebookDelete action={remove} title={notebook.title} />
            </div>
          </details>

          <Link
            href="/app"
            className="mt-6 rounded-control text-sm text-muted-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            ← Alle Notebooks
          </Link>
        </>
      }
      chat={
        <>
          <h2 id="abschnitt-chat" className="sr-only">
            Chat
          </h2>
          <ProviderSwitch
            notebookId={notebook.id}
            current={providerOrDefault(notebook.chat_provider).id}
          />
          <div className="mt-4 flex-1">
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
          </div>
        </>
      }
      studio={
        <>
          {/*
            Zwei benannte Bereiche in einer Spalte, nicht einer mit zwei
            Überschriften: „Audio-Überblick" und „Notizen" sind verschiedene
            Dinge, und wer per Landmarken navigiert, springt sonst mitten in
            den einen und muss sich zum anderen durchlesen.
          */}
          <h2 id="abschnitt-studio" className="mb-3 text-sm font-bold">
            Audio-Überblick
          </h2>
          <AudioOverview
            notebookId={notebook.id}
            overview={overview}
            loadFailed={overviewError !== null}
            provider={providerOrDefault(notebook.chat_provider).id}
            hasReadySource={sources.some((s) => s.status === 'ready')}
          />

          <section className="mt-8" aria-labelledby="abschnitt-notizen">
            <h2 id="abschnitt-notizen" className="mb-3 text-sm font-bold">
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
        </>
      }
    />
  )
}
