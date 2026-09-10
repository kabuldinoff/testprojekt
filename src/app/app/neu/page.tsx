import type { Metadata } from 'next'
import Link from 'next/link'

import { NotebookForm } from '@/components/notebook-form'
import { createNotebook } from '@/lib/notebooks/actions'

export const metadata: Metadata = {
  title: 'Neues Notebook · Notabene',
  robots: { index: false, follow: false }
}

/**
 * Anlegen als eigene Seite und nicht als Dialog.
 *
 * Ein Dialog bräuchte JavaScript, um überhaupt aufzugehen. Diese Seite ist ein
 * gewöhnliches Formular: sie funktioniert ohne JS, hat eine eigene URL zum
 * Verlinken, und der Zurück-Knopf tut das Erwartete. Für einen Schritt, der
 * genau einmal pro Notebook vorkommt, ist das der bessere Handel.
 */
export default function NeuesNotebookPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link href="/app" className="text-sm text-muted-ink hover:text-ink">
        ← Zurück zur Übersicht
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Neues Notebook</h1>
      <p className="mt-1 mb-6 text-sm text-muted-ink">
        Ein Notebook bündelt Quellen zu einem Thema. Quellen kommen im nächsten Schritt dazu.
      </p>

      <div className="rounded-card border border-hairline bg-surface p-6">
        <NotebookForm action={createNotebook} submitLabel="Notebook anlegen" />
      </div>
    </main>
  )
}
