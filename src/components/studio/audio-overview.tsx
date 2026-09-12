'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { PROVIDERS, type ProviderId } from '@/lib/llm/registry'
import { formatDuration } from '@/lib/studio/format'
import { parseScript } from '@/lib/studio/script'
import { LAUFENDE_AUDIO_ZUSTAENDE } from '@/lib/studio/status'

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

/**
 * Wie oft nachgefragt wird, solange etwas läuft.
 *
 * Drei Sekunden sind der Kompromiss zwischen zwei Ärgernissen: Ein längerer
 * Abstand lässt einen fertigen Überblick sekundenlang als „wird erzeugt"
 * dastehen; ein kürzerer erzeugt bei einem Lauf von rund einer Minute
 * dutzende Serveranfragen, die jedes Mal die ganze Seite neu rendern.
 *
 * Bei etwa einer Minute Laufzeit sind das ungefähr zwanzig Anfragen — genug,
 * dass die Anzeige zügig umspringt, wenig genug, dass es nicht auffällt.
 */
const POLL_MS = 3000

export interface AudioOverviewItem {
  status: 'pending' | 'processing' | 'ready' | 'script_only' | 'failed'
  script: string | null
  durationSeconds: number | null
  errorMessage: string | null
  /** Signierte Adresse, vom Server erzeugt. Nur bei `ready` gesetzt. */
  audioUrl: string | null
  /** Gesetzt, wenn der Überblick da ist, aber nicht ausgeliefert werden kann. */
  loadProblem: 'signatur' | null
}

const LAEUFT = LAUFENDE_AUDIO_ZUSTAENDE

export function AudioOverview({
  notebookId,
  overview,
  provider,
  hasReadySource,
  loadFailed
}: {
  notebookId: string
  overview: AudioOverviewItem | null
  provider: ProviderId
  hasReadySource: boolean
  /** Die Abfrage selbst ist gescheitert — nicht zu verwechseln mit „es gibt keinen". */
  loadFailed: boolean
}) {
  const router = useRouter()
  const [fehler, setFehler] = useState<string | null>(null)
  const [neustartFehler, setNeustartFehler] = useState(false)
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

    // Scheitert das Anstoßen, muss es sichtbar werden. Sonst bleibt der
    // Überblick auf `pending`, die Oberfläche fragt weiter nach, und der
    // Knopf ist deaktiviert, weil „läuft" — der Nutzer sitzt vor einem
    // Ladebalken ohne jede Handlungsmöglichkeit.
    void (async () => {
      try {
        const antwort = await fetch('/api/studio/audio', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notebookId })
        })
        // 409 heißt „läuft schon" und ist hier kein Problem, sondern der
        // Normalfall bei zwei offenen Tabs.
        if (!antwort.ok && antwort.status !== 409) {
          setNeustartFehler(true)
        }
      } catch {
        setNeustartFehler(true)
      }
    })()
  }, [status, notebookId])

  const kannVertonen = PROVIDERS[provider].capabilities.tts

  async function erzeugen() {
    setSendet(true)
    setFehler(null)
    setNeustartFehler(false)
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
          <Button
            type="button"
            size="compact"
            onClick={erzeugen}
            disabled={sendet || (laeuft && !neustartFehler)}
          >
            {laeuft ? 'Wird erzeugt …' : overview ? 'Neu erzeugen' : 'Audio-Überblick erzeugen'}
          </Button>
          {laeuft && !neustartFehler ? (
            <span aria-live="polite" className="text-sm text-muted-ink">
              Skript schreiben und vertonen dauert etwa eine Minute.
            </span>
          ) : null}
        </div>
      )}

      {loadFailed ? (
        <p
          role="alert"
          className="mt-3 rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
        >
          Der Stand des Überblicks konnte nicht geladen werden. Bitte die Seite neu laden.
        </p>
      ) : null}

      {overview?.loadProblem === 'signatur' ? (
        <p
          role="alert"
          className="mt-3 rounded-control border border-err/30 bg-err-soft px-4 py-3 text-sm text-err"
        >
          Der Überblick ist fertig, die Audiodatei ließ sich aber nicht ausliefern. Das Transkript
          steht unten; ein Neuladen der Seite behebt es meist.
        </p>
      ) : null}

      {neustartFehler ? (
        <p role="alert" className="mt-3 text-sm text-err">
          Der Überblick konnte nicht fortgesetzt werden. Bitte erneut versuchen.
        </p>
      ) : null}

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
            {overview.durationSeconds
              ? ` · ${formatDuration(overview.durationSeconds)} Minuten`
              : ''}
          </figcaption>
          {/*
            Das eingebaute Bedienelement des Browsers, nicht ein eigenes.
            Es ist über die Tastatur bedienbar, kennt die Systemlautstärke und
            die Wiedergabegeschwindigkeit — alles Dinge, die eine
            nachgebaute Leiste erst wieder haben müsste.
          */}
          {/*
            Ohne <track>: Eine WebVTT-Spur wäre die formale Textalternative,
            aber das Transkript steht vollständig und sprecherweise darunter —
            lesbar, durchsuchbar und kopierbar. Untertitel zu einer reinen
            Audiodatei ohne Bild hätten dagegen keine Fläche, auf der sie
            erschienen.
          */}
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
