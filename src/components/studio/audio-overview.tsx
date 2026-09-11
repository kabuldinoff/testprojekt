'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { PROVIDERS, type ProviderId } from '@/lib/llm/registry'
import { parseScript } from '@/lib/studio/script'

/**
 * Der Audio-Überblick: erzeugen, anhören, mitlesen.
 *
 * ── Warum es hier ein Transkript gibt und nicht nur einen Player ──────────
 *
 * Aus drei Gründen, und nur der erste ist offensichtlich. Man kann Text
 * überfliegen und Audio nicht. Screenreader-Nutzer und Gehörlose bekommen
 * sonst gar nichts. Und drittens ist das Transkript der Fehlerpfad: Schlägt
 * die Vertonung fehl — ein erschöpftes Tageskontingent äußert sich als 429 —,
 * steht der Text trotzdem da (`script_only`), statt eines Ladebalkens, der
 * nie fertig wird.
 */

const POLL_MS = 3000

export interface AudioOverviewItem {
  status: 'pending' | 'processing' | 'ready' | 'script_only' | 'failed'
  script: string | null
  durationSeconds: number | null
  errorMessage: string | null
  /** Signierte Adresse, vom Server erzeugt. Nur bei `ready` gesetzt. */
  audioUrl: string | null
}

const LAEUFT = new Set(['pending', 'processing'])

export function AudioOverview({
  notebookId,
  overview,
  provider,
  hasReadySource
}: {
  notebookId: string
  overview: AudioOverviewItem | null
  provider: ProviderId
  hasReadySource: boolean
}) {
  const router = useRouter()
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const angestossen = useRef(false)

  const status = overview?.status ?? null
  const laeuft = status !== null && LAEUFT.has(status)

  // Solange etwas läuft, die Server-Komponente neu laden — derselbe Weg wie
  // bei den Quellen. Ein eigener Endpunkt wäre ein zweiter Weg zu denselben
  // Daten, auf dem sie veralten können.
  useEffect(() => {
    if (!laeuft) return
    const timer = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [laeuft, router])

  // Steht der Überblick auf `pending`, weil der Reaper einen abgebrochenen
  // Lauf zurückgesetzt hat, stößt ihn der Client erneut an — mit der Sitzung
  // des Nutzers, durch dieselbe geprüfte Route. Der Datenbank-Job kann das
  // nicht: er hat keine Sitzung. Siehe Migration 0011.
  useEffect(() => {
    if (status !== 'pending' || angestossen.current) return
    angestossen.current = true
    void fetch('/api/studio/audio', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notebookId })
    }).catch(() => {})
  }, [status, notebookId])

  const kannVertonen = PROVIDERS[provider].capabilities.tts

  async function erzeugen() {
    setSendet(true)
    setFehler(null)
    angestossen.current = true
    try {
      const antwort = await fetch('/api/studio/audio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notebookId })
      })
      if (!antwort.ok) {
        const koerper = (await antwort.json().catch(() => null)) as { message?: string } | null
        setFehler(koerper?.message ?? 'Der Überblick konnte nicht angefordert werden.')
      } else {
        router.refresh()
      }
    } catch {
      setFehler('Der Überblick konnte nicht angefordert werden.')
    } finally {
      setSendet(false)
    }
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      {/*
        Die Sperre kommt aus `capabilities.tts` in der Registry und nicht aus
        einem Sonderfall hier: Mistral hat keine Sprachausgabe. Der Knopf wird
        deaktiviert und sagt warum — ein Knopf, der nichts tut, ist schlimmer
        als keiner.
      */}
      {!kannVertonen ? (
        <p className="text-sm text-muted-ink">
          Der Audio-Überblick braucht {PROVIDERS.gemini.label}. Aktuell ist{' '}
          {PROVIDERS[provider].label} eingestellt — Sie können oben umschalten.
        </p>
      ) : !hasReadySource ? (
        <p className="text-sm text-muted-ink">
          Sobald eine Quelle verarbeitet ist, lässt sich daraus ein Überblick erzeugen.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="compact" onClick={erzeugen} disabled={sendet || laeuft}>
            {laeuft ? 'Wird erzeugt …' : overview ? 'Neu erzeugen' : 'Audio-Überblick erzeugen'}
          </Button>
          {laeuft ? (
            <span aria-live="polite" className="text-sm text-muted-ink">
              Skript schreiben und vertonen dauert etwa eine Minute.
            </span>
          ) : null}
        </div>
      )}

      {fehler ? (
        <p role="alert" className="mt-3 text-sm text-err">
          {fehler}
        </p>
      ) : null}

      {overview?.status === 'failed' && overview.errorMessage ? (
        <p
          role="alert"
          className="mt-3 rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
        >
          {overview.errorMessage}
        </p>
      ) : null}

      {/*
        Die Meldung bei `script_only` ist bewusst kein Fehler-Rot: Der Nutzer
        hat etwas bekommen, nur nicht alles. Rot hieße „kaputt" und stimmte
        nicht.
      */}
      {overview?.status === 'script_only' && overview.errorMessage ? (
        <p className="mt-3 rounded-control border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          {overview.errorMessage}
        </p>
      ) : null}

      {overview?.audioUrl ? (
        <figure className="mt-4">
          <figcaption className="mb-2 text-xs text-muted-ink">
            Zweistimmiger Überblick
            {overview.durationSeconds ? ` · ${formatDauer(overview.durationSeconds)}` : ''}
          </figcaption>
          {/*
            Das eingebaute Bedienelement des Browsers, nicht ein eigenes.
            Es ist über die Tastatur bedienbar, kennt die Systemlautstärke und
            die Wiedergabegeschwindigkeit — alles Dinge, die eine
            nachgebaute Leiste erst wieder haben müsste.
          */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Das Transkript steht vollständig darunter und ist die Textalternative. */}
          <audio controls preload="metadata" src={overview.audioUrl} className="w-full" />
        </figure>
      ) : null}

      {overview?.script ? (
        <details className="mt-4" open={overview.status === 'script_only'}>
          <summary className="cursor-pointer text-sm font-semibold text-ink">Transkript</summary>
          <ol className="mt-3 flex flex-col gap-2">
            {parseScript(overview.script).map((zeile, i) => (
              <li key={i} className="text-sm leading-relaxed">
                <span className="font-semibold text-brand-600">{zeile.speaker}</span>
                <span className="text-ink"> {zeile.text}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  )
}

function formatDauer(sekunden: number): string {
  const m = Math.floor(sekunden / 60)
  const s = sekunden % 60
  return `${m}:${String(s).padStart(2, '0')} Minuten`
}
