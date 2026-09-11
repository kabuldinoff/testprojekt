'use client'

import { useActionState, useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Citation } from '@/lib/chat/citations'
import { createNote, deleteNote, updateNote, type NoteState } from '@/lib/notes/actions'
import { NOTE_CONTENT_MAX, NOTE_TITLE_MAX } from '@/lib/notes/schema'

/**
 * Notizen eines Notebooks: anlegen, ändern, löschen.
 *
 * Eine Notiz ist das einzige Objekt hier, das der Nutzer selbst schreibt und
 * später überarbeitet — anders als der Gesprächsverlauf, wo nachträgliches
 * Ändern die Belegkraft zerstörte. Deshalb hat `notes` als einzige Tabelle
 * Policies für alle vier Operationen.
 */

export interface NoteItem {
  id: string
  title: string
  content: string
  origin: string
  citations: Citation[]
}

export function NotesPanel({ notebookId, notes }: { notebookId: string; notes: NoteItem[] }) {
  const [offen, setOffen] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 ? (
        <p className="rounded-control border border-hairline bg-surface-2 px-4 py-3 text-sm text-muted-ink">
          Noch keine Notizen. Schreiben Sie eine, oder übernehmen Sie eine Antwort aus dem Chat.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Note notebookId={notebookId} note={note} />
            </li>
          ))}
        </ul>
      )}

      {offen ? (
        <NoteForm
          notebookId={notebookId}
          onDone={() => setOffen(false)}
          submitLabel="Notiz anlegen"
        />
      ) : (
        <Button type="button" variant="secondary" size="compact" onClick={() => setOffen(true)}>
          Notiz schreiben
        </Button>
      )}
    </div>
  )
}

function Note({ notebookId, note }: { notebookId: string; note: NoteItem }) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [loeschStatus, loeschen, loeschtGerade] = useActionState<NoteState, FormData>(
    deleteNote.bind(null, notebookId, note.id),
    {}
  )

  if (bearbeiten) {
    return (
      <NoteForm
        notebookId={notebookId}
        note={note}
        onDone={() => setBearbeiten(false)}
        submitLabel="Speichern"
      />
    )
  }

  return (
    <article className="rounded-card border border-hairline bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">{note.title}</h3>
        {/*
          Herkunft sichtbar: eine übernommene Antwort ist etwas anderes als ein
          selbst geschriebener Gedanke, und nach einer Woche weiß das niemand
          mehr aus dem Text allein.
        */}
        {note.origin === 'chat' ? (
          <span className="shrink-0 rounded-pill bg-cite-bg px-2 py-0.5 text-xs text-cite-fg">
            aus dem Chat
          </span>
        ) : null}
      </header>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{note.content}</p>

      {note.citations.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-hairline pt-2">
          {note.citations.map((c) => (
            <li key={c.n} className="text-xs text-muted-ink">
              [{c.n}] {c.sourceTitle}
              {c.pageNumber === null ? '' : `, Seite ${c.pageNumber}`}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button type="button" variant="ghost" size="compact" onClick={() => setBearbeiten(true)}>
          Bearbeiten
        </Button>
        <form action={loeschen}>
          <Button type="submit" variant="danger" size="compact" disabled={loeschtGerade}>
            {loeschtGerade ? 'Löscht …' : 'Löschen'}
          </Button>
        </form>
      </div>

      {loeschStatus.error ? (
        <p role="alert" className="mt-2 text-xs text-err">
          {loeschStatus.error}
        </p>
      ) : null}
    </article>
  )
}

function NoteForm({
  notebookId,
  note,
  onDone,
  submitLabel
}: {
  notebookId: string
  note?: NoteItem
  onDone: () => void
  submitLabel: string
}) {
  const titelId = useId()
  const inhaltId = useId()

  const action = note
    ? updateNote.bind(null, notebookId, note.id)
    : createNote.bind(null, notebookId)

  const [status, absenden, laeuft] = useActionState<NoteState, FormData>(action, {})

  // Schließen, sobald die Action gemeldet hat, dass es geklappt hat — und
  // nicht beim Klick auf „Speichern": sonst klappte das Formular auch dann zu,
  // wenn das Speichern fehlschlug, und die Eingabe wäre verloren.
  //
  // `status.ok` und nicht „kein Fehler": `useActionState` startet mit einem
  // leeren Objekt, und „noch nichts getan" wäre sonst dasselbe wie
  // „erfolgreich fertig" — das Formular schlösse sich beim ersten Rendern.
  useEffect(() => {
    if (status.ok) onDone()
  }, [status.ok, onDone])

  return (
    <form
      action={absenden}
      className="flex flex-col gap-3 rounded-card border border-hairline bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={titelId} className="text-xs font-semibold text-muted-ink">
          Titel
        </label>
        <input
          id={titelId}
          name="title"
          // Nach einer abgelehnten Eingabe die Rohwerte, sonst der
          // gespeicherte Stand. React setzt das Formular nach der Action
          // zurück — ohne das wäre die Eingabe genau dann weg, wenn der
          // Nutzer sie noch braucht.
          defaultValue={status.values?.title ?? note?.title ?? ''}
          maxLength={NOTE_TITLE_MAX}
          required
          className="rounded-control border border-hairline bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={inhaltId} className="text-xs font-semibold text-muted-ink">
          Inhalt
        </label>
        <textarea
          id={inhaltId}
          name="content"
          rows={5}
          defaultValue={status.values?.content ?? note?.content ?? ''}
          maxLength={NOTE_CONTENT_MAX}
          required
          className="resize-y rounded-control border border-hairline bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        />
      </div>

      {status.error ? (
        <p role="alert" className="text-xs text-err">
          {status.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="compact" disabled={laeuft}>
          {laeuft ? 'Speichert …' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="compact" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  )
}
