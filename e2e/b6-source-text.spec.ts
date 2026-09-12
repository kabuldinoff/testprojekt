import { expect, test, type Page } from '@playwright/test'

import { asService, uniqueEmail } from './lib/supabase'

/**
 * b6 — Den Quelltext nachlesen und eine Quelle wieder entfernen.
 *
 * Zwei Dinge, die sich gegenseitig bedingen: Wer eine Quelle versehentlich
 * doppelt anlegt, braucht einen Weg zurück — und wer einem Beleg nicht traut,
 * will nachsehen können, was drumherum steht.
 *
 * ── Was hier die eigentliche Zusicherung ist ──────────────────────────────
 *
 * Nicht „ein Dialog geht auf". Sondern: **der zusammengesetzte Text enthält
 * jeden Satz genau einmal**, und die Markierung sitzt an der Stelle, auf die
 * der Beleg zeigt. Die Abschnitte überlappen einander; naiv aneinandergehängt
 * stünde jeder zweite Satz doppelt da, und das sähe auf einem Bildschirmfoto
 * völlig in Ordnung aus.
 */

const PASSWORD = 'test-passwort-1234'

/** Trägt den Beleg — derselbe Kernsatz wie in b3, damit der Stub ihn zitiert. */
const KERNSATZ =
  'Die Marge im Dienstleistungssegment stieg von 18,2 auf 21,4 Prozent im dritten Quartal.'

/**
 * Durchnummerierte Sätze — jeder genau einmal, jeder unterscheidbar.
 *
 * Die Zahl ist nachgemessen und kein Gefühl: Mit 90 Sätzen sind es 8167
 * Zeichen, daraus macht `chunkDocument` **8 Abschnitte mit je 180 Zeichen
 * Überlappung**, und 14 dieser Sätze stehen dadurch in zwei Abschnitten
 * zugleich.
 *
 * Die erste Fassung dieses Tests hatte 1760 Zeichen. Das liegt unter
 * `MAX_CHARS`, es entstand ein einziger Abschnitt, und es gab gar nichts zu
 * überlappen — der Test blieb grün, als ich das Abziehen der Überlappung
 * versuchsweise ausbaute. Er prüfte nichts. Deshalb steht die Herleitung hier
 * und nicht nur die Zahl.
 */
const SAETZE = Array.from(
  { length: 90 },
  (_, i) =>
    `Feststellung Nummer ${i} betrifft ausschliesslich das Geschaeftsfeld mit der Kennziffer ${i}.`
)

/**
 * Der Kernsatz steht in der **Mitte**, nicht am Anfang.
 *
 * Auch das ist erkauft: Zuerst stand er vorn, und damit war der zitierte
 * Abschnitt immer Nummer 0. Ein Betrachter, der stumpf die erste Fundstelle
 * markiert, träfe dann zufällig das Richtige — die Gegenprobe blieb grün,
 * obwohl die Markierung nachweislich falsch verdrahtet war.
 */
const INHALT = [...SAETZE.slice(0, 45), KERNSATZ, ...SAETZE.slice(45)].join(' ')

async function notebookMitQuelle(page: Page, quellenTitel = 'Quartalsbericht') {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('quelltext'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Quelltext-Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)
  const notebookId = page.url().split('/').pop()!

  const panel = page.getByRole('region', { name: 'Quelle hinzufügen' })
  await panel.getByRole('tab', { name: 'Text' }).click()
  await panel.getByLabel('Titel').fill(quellenTitel)
  await panel.getByLabel('Inhalt').fill(INHALT)
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()

  await expect(page.getByRole('listitem').filter({ hasText: quellenTitel })).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 30_000 }
  )

  return notebookId
}

const dialog = (page: Page) => page.getByRole('dialog')

/** Leerraum vereinheitlichen — `innerText` bricht anders um als der Quelltext. */
const normal = (s: string) => s.replace(/\s+/g, ' ').trim()

test('der Titel einer bereiten Quelle öffnet ihren Text', async ({ page }) => {
  await notebookMitQuelle(page)

  await page.getByRole('button', { name: 'Quartalsbericht' }).click()

  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page)).toContainText(KERNSATZ)
  await expect(dialog(page)).toContainText(SAETZE.at(-1)!)
})

test('der zusammengesetzte Text enthält jeden Satz genau einmal', async ({ page }) => {
  await notebookMitQuelle(page)
  await page.getByRole('button', { name: 'Quartalsbericht' }).click()
  await expect(dialog(page)).toContainText(SAETZE.at(-1)!)

  // Der Kern der Scheibe. Die acht Abschnitte überlappen einander um je 180
  // Zeichen; ohne Abzug stünden vierzehn dieser Sätze zweimal da, und nichts
  // an der Anzeige verriete es.
  //
  // Geprüft werden **alle** Sätze und nicht einer: Welche in einer
  // Überlappung landen, hängt an den Trennstellen, und die verschieben sich,
  // sobald jemand `TARGET_CHARS` anfasst. Ein Test, der einen einzelnen Satz
  // heraussucht, prüft dann unter Umständen den falschen.
  const text = (await dialog(page).innerText()).replace(/\s+/g, ' ')
  const doppelte = SAETZE.filter((satz) => text.split(satz).length - 1 !== 1)
  expect(doppelte, `nicht genau einmal enthalten: ${doppelte.slice(0, 3).join(' | ')}`).toEqual([])
})

test('ein Beleg führt an seine Stelle im Dokument — markiert', async ({ page }) => {
  await notebookMitQuelle(page)

  await page.getByLabel('Frage an die ausgewählten Quellen').fill('Wie war die Marge?')
  await page.getByRole('button', { name: 'Fragen' }).click()

  const beleg = page.getByRole('button', { name: /^Beleg 1: Quartalsbericht/ })
  await expect(beleg).toBeVisible({ timeout: 30_000 })
  await beleg.click()

  // Die Passage, die der Beleg behauptet — aus der Nachricht, nicht aus dem
  // Dokument.
  const ausschnitt = normal(await page.locator('figure blockquote').first().innerText())
  expect(ausschnitt).toContain(KERNSATZ)

  await page.getByRole('button', { name: 'Im Dokument anzeigen' }).click()
  await expect(dialog(page)).toBeVisible()

  // Die Markierung ist ein <mark> und nicht bloß eingefärbter Text: Sie
  // bedeutet „für den aktuellen Zweck von Belang" und wird angesagt.
  const marke = dialog(page).locator('mark')
  await expect(marke).toHaveCount(1)

  // Und jetzt die eigentliche Zusicherung: Markiert ist **genau** das, was der
  // Beleg behauptet — nicht bloß irgendetwas, das den Kernsatz enthält.
  //
  // Die erste Fassung prüfte nur `toContainText(KERNSATZ)`. Sie blieb grün,
  // als ich die Markierung fest auf die erste Fundstelle verdrahtete: Der
  // Kernsatz stand damals am Dokumentanfang, und „die erste" war zufällig die
  // richtige. Ein Vergleich mit dem Ausschnitt kann nicht zufällig stimmen.
  expect(normal(await marke.innerText())).toBe(ausschnitt)
})

test('Escape schließt den Betrachter', async ({ page }) => {
  await notebookMitQuelle(page)
  await page.getByRole('button', { name: 'Quartalsbericht' }).click()
  await expect(dialog(page)).toBeVisible()

  // Das native <dialog> bringt das mit. Der Test hält fest, dass es auch
  // wirklich modal geöffnet wurde — mit dem `open`-Attribut statt
  // `showModal()` täte Escape nichts.
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
})

test('eine noch nicht verarbeitete Quelle bietet keinen Betrachter an', async ({ page }) => {
  // Ein Knopf, der einen leeren Dialog öffnet, wäre ein Angebot, das sein
  // Versprechen bricht: Die Abschnitte entstehen erst am Ende der
  // Verarbeitung.
  await notebookMitQuelle(page)

  const panel = page.getByRole('region', { name: 'Quelle hinzufügen' })
  await panel.getByRole('tab', { name: 'Adresse' }).click()
  await panel.getByLabel('Adresse der Webseite').fill('http://127.0.0.1/intern')
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()

  const gescheitert = page.getByRole('listitem').filter({ hasText: '127.0.0.1' })
  await expect(gescheitert).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
  await expect(gescheitert.getByRole('button', { name: /127\.0\.0\.1/ })).toHaveCount(0)
})

test('eine Quelle lässt sich entfernen, und es braucht zwei Schritte', async ({ page }) => {
  await notebookMitQuelle(page)
  const eintrag = page.getByRole('listitem').filter({ hasText: 'Quartalsbericht' })

  // Der gefährliche Knopf liegt hinter einem bewussten Schritt — wie beim
  // Notebook. Vorher ist er nicht da.
  await expect(eintrag.getByRole('button', { name: /entfernen$/ })).toBeHidden()

  await eintrag.getByText('Entfernen', { exact: true }).click()
  await eintrag.getByRole('button', { name: '„Quartalsbericht“ entfernen' }).click()

  await expect(eintrag).toHaveCount(0)
  await expect(page.getByText('Noch keine Quellen')).toBeVisible()
})

test('nach dem Entfernen ist auch der Text weg — nicht nur die Karte', async ({ page }) => {
  await notebookMitQuelle(page)

  const eintrag = page.getByRole('listitem').filter({ hasText: 'Quartalsbericht' })
  const sourceId = await eintrag.getAttribute('data-source-id')
  expect(sourceId).toBeTruthy()

  // Gegenprobe vorher: Die Route liefert den Text noch.
  const vorher = await page.request.get(`/api/sources/${sourceId}/text`)
  expect(vorher.status()).toBe(200)

  await eintrag.getByText('Entfernen', { exact: true }).click()
  await eintrag.getByRole('button', { name: '„Quartalsbericht“ entfernen' }).click()
  await expect(eintrag).toHaveCount(0)

  // Und danach nicht mehr. Ohne diesen Aufruf bewiese der Test nur, dass eine
  // Zeile aus einer Liste verschwindet — die Abschnitte könnten weiterleben.
  const nachher = await page.request.get(`/api/sources/${sourceId}/text`)
  expect(nachher.status()).toBe(404)
})

test('mit der Quelle verschwindet auch ihre Datei im Storage', async ({ page, playwright }) => {
  // Der Teil, den niemand sieht und den deshalb nur ein Test findet. Bliebe
  // die Datei liegen, zählte sie weiter gegen das 1-GB-Kontingent, und nichts
  // in der Oberfläche wiese darauf hin.
  //
  // Nachgesehen wird mit dem Secret Key, nicht mit dem Token des Nutzers: Eine
  // Policy, die die Datei bloß verbirgt, sähe sonst genauso aus wie eine
  // gelöschte.
  await notebookMitQuelle(page)
  const eintrag = page.getByRole('listitem').filter({ hasText: 'Quartalsbericht' })
  const sourceId = await eintrag.getAttribute('data-source-id')

  const api = await playwright.request.newContext()
  const dienst = asService(api)

  // Den Pfad aus der Zeile holen, solange es sie noch gibt. Er lautet
  // `<nutzer>/<notebook>/<quelle>`; die Nutzer-ID steht nirgends in der
  // Oberfläche, und sie zu erraten wäre der Anfang eines brüchigen Tests.
  const zeile = await dienst.get(`sources?id=eq.${sourceId}&select=storage_path`)
  expect(zeile.ok(), await zeile.text()).toBe(true)
  const pfad = ((await zeile.json()) as Array<{ storage_path: string }>)[0]!.storage_path
  const ordner = pfad.slice(0, pfad.lastIndexOf('/'))
  const dateiname = pfad.slice(pfad.lastIndexOf('/') + 1)

  // Gegenprobe zuerst: Ohne sie bewiese der Test unten auch dann nichts, wenn
  // die Datei nie angelegt worden wäre.
  expect(await dienst.storageNames('sources', ordner)).toContain(dateiname)

  await eintrag.getByText('Entfernen', { exact: true }).click()
  await eintrag.getByRole('button', { name: '„Quartalsbericht“ entfernen' }).click()
  await expect(eintrag).toHaveCount(0)

  expect(
    await dienst.storageNames('sources', ordner),
    `Datei ${pfad} liegt noch im Bucket`
  ).not.toContain(dateiname)

  await api.dispose()
})

test('eine gelöschte Quelle nimmt ihre Belege nicht mit', async ({ page }) => {
  // Die Zusicherung, die den Kommentar in `citations.ts` trägt: Die Passage
  // ist in der Nachricht gespeichert, nicht nachgeladen. Eine Antwort bleibt
  // deshalb lesbar, auch wenn ihre Quelle verschwindet.
  await notebookMitQuelle(page)

  await page.getByLabel('Frage an die ausgewählten Quellen').fill('Wie war die Marge?')
  await page.getByRole('button', { name: 'Fragen' }).click()
  const beleg = page.getByRole('button', { name: /^Beleg 1: Quartalsbericht/ })
  await expect(beleg).toBeVisible({ timeout: 30_000 })

  const eintrag = page.getByRole('listitem').filter({ hasText: 'Quartalsbericht' })
  await eintrag.getByText('Entfernen', { exact: true }).click()
  await eintrag.getByRole('button', { name: '„Quartalsbericht“ entfernen' }).click()
  await expect(eintrag).toHaveCount(0)

  await page.reload()
  const belegDanach = page.getByRole('button', { name: /^Beleg 1: Quartalsbericht/ })
  await expect(belegDanach).toBeVisible()
  await belegDanach.click()
  await expect(page.getByText(KERNSATZ)).toBeVisible()
})
