/**
 * Räumt auf, was die End-to-End-Suite anlegt.
 *
 * ── Warum das nötig ist ───────────────────────────────────────────────────
 *
 * Jeder Testlauf registriert Dutzende Konten — `uniqueEmail()` vergibt pro
 * Lauf frische Adressen unter `@beispiel.test`, damit sich zwei Läufe nicht
 * ins Gehege kommen. Aufgeräumt hat sie nie jemand.
 *
 * Nachgezählt nach zwei Tagen Entwicklung: **1494 Konten, 1071 Notebooks und
 * 837 Storage-Dateien** im lokalen Stack. Davon gehörte genau eines einem
 * Menschen. Das ist nicht nur Ballast — es macht die Zahlen im Studio
 * unbrauchbar und führt beim Nachsehen zuverlässig in die Irre.
 *
 * ── Warum über die Konten und nicht über die Tabellen ────────────────────
 *
 * Ein gelöschtes Konto nimmt per `on delete cascade` alles mit: Notebooks,
 * Quellen, Abschnitte, Notizen, Nachrichten, Überblicke. Tabelle für Tabelle
 * aufzuräumen hieße, diese Kette ein zweites Mal von Hand zu pflegen.
 *
 * Die Dateien im Storage gehen **nicht** mit — der hängt nicht am Schema.
 * Deshalb werden sie vorher eingesammelt, entlang derselben Nutzer-ID, die der
 * erste Abschnitt jedes Pfades ist.
 */

const TESTDOMAIN = '@beispiel.test'

async function json(url, options) {
  const antwort = await fetch(url, options)
  if (!antwort.ok) throw new Error(`${antwort.status} ${await antwort.text()}`)
  return antwort.status === 204 ? null : antwort.json()
}

/**
 * Entfernt alle Konten der Testdomain samt ihrer Dateien.
 *
 * Wirft nie. Ein fehlgeschlagenes Aufräumen darf einen grünen Testlauf nicht
 * nachträglich rot färben — es ist Hygiene, keine Zusicherung.
 */
export async function raeumeTestkonten({ apiUrl, secretKey }) {
  try {
    const kopf = { apikey: secretKey, Authorization: `Bearer ${secretKey}` }

    const konten = []
    for (let seite = 1; seite <= 30; seite++) {
      const { users } = await json(`${apiUrl}/auth/v1/admin/users?per_page=200&page=${seite}`, {
        headers: kopf
      })
      if (!users?.length) break
      konten.push(...users)
    }

    const weg = konten.filter((k) => k.email?.endsWith(TESTDOMAIN))
    if (weg.length === 0) return

    // Erst die Dateien. Die Pfade beginnen mit der Nutzer-ID, ein Präfix
    // genügt also — und `list` ist nicht rekursiv, deshalb zwei Ebenen.
    //
    // **Wessen Dateien nicht weggehen, dessen Konto bleibt stehen.**
    //
    // Die erste Fassung verschluckte Fehler beim Auflisten und beim Löschen
    // und entfernte das Konto trotzdem. Damit wäre die Nutzer-ID weg gewesen —
    // und genau sie ist der erste Abschnitt jedes Pfades. Die Dateien wären
    // unauffindbar geworden, ausgelöst vom Aufräumlauf selbst. Dieselbe Falle,
    // gegen die diese Scheibe angetreten ist, nur eine Ebene höher.
    //
    // Ein stehengebliebenes Konto kostet dagegen nichts: Der nächste Lauf
    // nimmt es wieder mit.
    const ids = new Set(weg.map((k) => k.id))
    const gestrandet = new Set()

    for (const bucket of ['sources', 'audio']) {
      for (const nutzer of ids) {
        try {
          const pfade = []
          const oberste = await json(`${apiUrl}/storage/v1/object/list/${bucket}`, {
            method: 'POST',
            headers: { ...kopf, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: nutzer, limit: 1000 })
          })

          for (const eintrag of oberste ?? []) {
            if (eintrag.id) {
              pfade.push(`${nutzer}/${eintrag.name}`)
              continue
            }
            const tiefer = await json(`${apiUrl}/storage/v1/object/list/${bucket}`, {
              method: 'POST',
              headers: { ...kopf, 'Content-Type': 'application/json' },
              body: JSON.stringify({ prefix: `${nutzer}/${eintrag.name}`, limit: 1000 })
            })
            for (const datei of tiefer ?? []) pfade.push(`${nutzer}/${eintrag.name}/${datei.name}`)
          }

          if (pfade.length > 0) {
            await json(`${apiUrl}/storage/v1/object/${bucket}`, {
              method: 'DELETE',
              headers: { ...kopf, 'Content-Type': 'application/json' },
              body: JSON.stringify({ prefixes: pfade })
            })
          }
        } catch (fehler) {
          gestrandet.add(nutzer)
          console.warn(`  ${bucket}: Dateien von ${nutzer} bleiben liegen — ${fehler.message}`)
        }
      }
    }

    // Dann die Konten — aber nur die, deren Dateien wirklich weg sind.
    // Parallel, aber gedeckelt: Der lokale GoTrue ist kein Lastprüfstand, und
    // tausend gleichzeitige Anfragen bringen ihm nichts.
    const liste = [...ids].filter((id) => !gestrandet.has(id))
    const GLEICHZEITIG = 12
    for (let i = 0; i < liste.length; i += GLEICHZEITIG) {
      await Promise.all(
        liste
          .slice(i, i + GLEICHZEITIG)
          .map((id) =>
            fetch(`${apiUrl}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: kopf }).catch(
              () => {}
            )
          )
      )
    }

    console.log(`\n  Aufgeräumt: ${liste.length} Testkonten samt ihrer Daten und Dateien.`)
    if (gestrandet.size > 0) {
      console.warn(
        `  ${gestrandet.size} Konten behalten, weil ihre Dateien nicht weggingen:\n` +
          [...gestrandet].map((id) => `    ${id}`).join('\n') +
          `\n  Der nächste Lauf versucht es erneut.`
      )
    }
  } catch (fehler) {
    console.warn('\n  Aufräumen der Testkonten übersprungen:', fehler.message)
  }
}
