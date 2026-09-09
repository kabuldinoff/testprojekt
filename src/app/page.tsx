import { ThemeToggle } from '@/components/theme-toggle'

/**
 * Platzhalter-Startseite für das Fundament.
 *
 * Die echte Landing Page entsteht in einer eigenen Scheibe (statisch, JSON-LD,
 * sitemap, OG-Bild). Diese Seite hat einen einzigen Zweck: sie beweist, dass
 * die Design-Tokens, die selbst gehosteten Schriften und der Theme-Umschalter
 * zusammen funktionieren — in beiden Modi und ohne hellen Blitz beim Laden.
 */
export default function Home() {
  return (
    <main className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
        <span className="font-bold tracking-tight">Notabene</span>
        <span className="flex-1" />
        <ThemeToggle />
      </header>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          Deine Quellen, <span className="font-serif italic text-muted-ink">verstanden</span>
        </h1>
        <p className="mt-4 max-w-prose text-muted-ink">
          Lade Dokumente hoch und stelle Fragen. Jede Antwort ist belegt — mit einem Klick zur
          exakten Stelle in der Quelle.
        </p>

        <div className="mt-10 rounded-card border border-hairline bg-surface p-5">
          <p className="text-sm font-semibold">Fundament steht</p>
          <p className="mt-1 text-sm text-muted-ink">
            Tokens, Schriften und Theme-Umschalter sind verdrahtet. Quellen, Chat und Studio folgen
            in den nächsten Scheiben.
          </p>
        </div>
      </section>
    </main>
  )
}
