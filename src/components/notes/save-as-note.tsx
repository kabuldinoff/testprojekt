'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import type { Citation } from '@/lib/chat/citations'
import { saveAnswerAsNote } from '@/lib/notes/actions'

/**
 * Übernimmt eine Antwort als Notiz.
 *
 * Der Titel wird nicht erfragt, sondern aus der Antwort abgeleitet
 * (`titleFromAnswer`). Ein Dialog zwischen „behalten" und „behalten" wäre eine
 * Hürde an der falschen Stelle — wer den Titel ändern will, tut das danach in
 * der Notizliste.
 *
 * Die Belege reisen mit. Eine übernommene Antwort ohne ihre Herkunft wäre eine
 * Behauptung, und genau das soll dieses Produkt nicht erzeugen.
 */
export function SaveAsNote({
  notebookId,
  content,
  citations
}: {
  notebookId: string
  content: string
  citations: Citation[]
}) {
  const [zustand, setZustand] = useState<'bereit' | 'gespeichert' | 'fehler'>('bereit')
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, starte] = useTransition()

  function speichern() {
    starte(async () => {
      const ergebnis = await saveAnswerAsNote(notebookId, content, citations)
      if (ergebnis.error) {
        setZustand('fehler')
        setMeldung(ergebnis.error)
      } else {
        setZustand('gespeichert')
        setMeldung(null)
      }
    })
  }

  // Nach dem Speichern kein Knopf mehr, sondern eine Bestätigung. Ein Knopf,
  // der nach dem Drücken unverändert dasteht, lädt zum zweiten Drücken ein —
  // und dann liegt die Antwort zweimal in der Liste.
  if (zustand === 'gespeichert') {
    return (
      <p role="status" className="mt-3 text-xs text-ok">
        Als Notiz gespeichert.
      </p>
    )
  }

  return (
    <div className="mt-3">
      <Button type="button" variant="ghost" size="compact" onClick={speichern} disabled={laeuft}>
        {laeuft ? 'Speichert …' : 'Als Notiz speichern'}
      </Button>
      {meldung ? (
        <p role="alert" className="mt-1 text-xs text-err">
          {meldung}
        </p>
      ) : null}
    </div>
  )
}
