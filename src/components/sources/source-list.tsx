'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { anyPending, needsTrigger, statusView } from '@/lib/sources/status'

/**
 * Liste der Quellen mit ihrem Verarbeitungszustand.
 *
 * ── Warum der Client die Wiederaufnahme übernimmt ─────────────────────────
 *
 * Der `pg_cron`-Reaper setzt eine hängengebliebene Quelle auf `pending`
 * zurück, stößt sie aber nicht selbst an: die Ingest-Route verlangt eine
 * angemeldete Sitzung, und ein Datenbank-Job hat keine. Ihm eine zu geben
 * hieße, ein zweites Geheimnis einzuführen, das die Datenbank kennt.
 *
 * Stattdessen macht es diese Komponente — mit der Sitzung des Nutzers, durch
 * dieselbe geprüfte Route wie beim ersten Mal. Der Preis: hat niemand das
 * Notebook offen, wartet die Quelle. Wer sie sehen will, öffnet das Notebook
 * ohnehin. Siehe supabase/migrations/…_ingest_reaper.sql.
 *
 * Abgefragt wird über `router.refresh()`, nicht über einen eigenen Endpunkt:
 * die Server-Komponente lädt neu und liefert denselben Zustand wie beim
 * ersten Rendern. Ein zweiter Weg zu denselben Daten wäre ein zweiter Weg,
 * auf dem sie veralten können.
 */

const POLL_MS = 2000

/** Nicht öfter als das denselben Anstoß wiederholen. */
const RETRIGGER_MS = 30_000

export interface SourceItem {
  id: string
  title: string
  kind: string
  status: string
  error_message: string | null
  page_count: number | null
  char_count: number | null
}

const TONE_CLASSES = {
  wait: 'bg-surface-2 text-muted-ink',
  work: 'bg-brand-50 text-brand-600',
  // Gold, Stelle 2 von 3 der Gold-Disziplin aus CLAUDE.md.
  ready: 'bg-accent-soft text-accent-ink border border-accent',
  err: 'bg-err-soft text-err'
} as const

export function SourceList({ sources }: { sources: SourceItem[] }) {
  const router = useRouter()
  const lastTriggered = useRef<Map<string, number>>(new Map())

  const offen = anyPending(sources.map((s) => s.status))

  useEffect(() => {
    if (!offen) return

    const tick = async () => {
      const now = Date.now()
      for (const source of sources) {
        if (!needsTrigger(source.status)) continue
        // Ein `pending`, das schon angestoßen wurde, darf nicht bei jedem
        // Durchlauf erneut angestoßen werden — jeder Aufruf kostet eine
        // Function-Ausführung, und die Übernahme scheitert ohnehin am Lease.
        const last = lastTriggered.current.get(source.id) ?? 0
        if (now - last < RETRIGGER_MS) continue

        lastTriggered.current.set(source.id, now)
        await fetch(`/api/sources/${source.id}/ingest`, { method: 'POST' }).catch(() => {
          // Ein fehlgeschlagener Anstoß ist kein Grund, die Abfrage zu
          // beenden — der nächste Durchlauf versucht es wieder.
        })
      }
      router.refresh()
    }

    const timer = setInterval(() => void tick(), POLL_MS)
    return () => clearInterval(timer)
  }, [offen, sources, router])

  if (sources.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-8 text-center">
        <p className="text-3xl" aria-hidden>
          📄
        </p>
        <p className="mt-3 font-bold">Noch keine Quellen</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-ink">
          Lade ein PDF hoch, füge eine Adresse ein oder kopiere Text hinein. Danach kannst du Fragen
          dazu stellen.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2" aria-busy={offen}>
      {sources.map((source) => {
        const view = statusView(source.status)
        return (
          <li
            key={source.id}
            className="rounded-card border border-hairline bg-surface p-4"
            data-status={source.status}
            data-source-id={source.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{source.title}</p>
                <p className="mt-0.5 text-xs text-faint-ink">
                  {source.kind.toUpperCase()}
                  {source.page_count ? ` · ${source.page_count} Seiten` : ''}
                  {source.char_count
                    ? ` · ${source.char_count.toLocaleString('de-DE')} Zeichen`
                    : ''}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-bold ${TONE_CLASSES[view.tone]}`}
              >
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {view.label}
              </span>
            </div>

            {source.error_message ? (
              // Der Fehler nennt den Grund. Nie „Etwas ist schiefgelaufen“ —
              // bei einem gescannten PDF ist die Ursache erklärbar, und der
              // Nutzer kann etwas anderes hochladen.
              <p className="mt-2 text-sm text-err">{source.error_message}</p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
