import { expect, test, type Page } from '@playwright/test'

import { asUser, createUser, uniqueEmail } from './lib/supabase'

/**
 * b3 — Chat mit Belegen.
 *
 * Hier wird das Produkt zum ersten Mal echt: eine Frage, eine Antwort, und
 * ein Beleg, der auf eine Stelle im Dokument zeigt.
 *
 * ── Warum gegen einen Stub und nicht gegen ein echtes Modell ──────────────
 *
 * Ein echtes Modell formuliert jedes Mal anders. Prüfbar wäre dann nur, dass
 * *irgendetwas* kam — nicht, dass Beleg [1] auf den richtigen Ausschnitt
 * zeigt. Genau das ist aber die Zusicherung, um die es geht. Der Stub in
 * `scripts/ai-stub.mjs` antwortet stattdessen aus dem Kontext, den er
 * bekommen hat: die Antwort enthält den Anfang von Ausschnitt 1. Damit wird
 * die Zuordnung überprüfbar statt plausibel.
 *
 * Zwei Stichwörter steuern die unangenehmen Pfade: „ERFINDE" lässt den Stub
 * mit [9] belegen, obwohl es so viele Ausschnitte nicht gibt, und
 * „OHNE BELEG" liefert eine Antwort ganz ohne Nummer.
 */

const PASSWORD = 'test-passwort-1234'

/** Der Satz, der den Beleg trägt. Er steht so in keiner anderen Quelle. */
const KERNSATZ =
  'Die Marge im Dienstleistungssegment stieg von 18,2 auf 21,4 Prozent im dritten Quartal.'

async function notebookMitQuelle(page: Page, quellenTitel = 'Quartalsbericht') {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('chat'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Chat-Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)
  const notebookId = page.url().split('/').pop()!

  const panel = page.getByRole('region', { name: 'Quelle hinzufügen' })
  await panel.getByRole('tab', { name: 'Text' }).click()
  await panel.getByLabel('Titel').fill(quellenTitel)
  await panel
    .getByLabel('Inhalt')
    .fill(KERNSATZ + ' Die Personalkosten blieben dabei unverändert. '.repeat(30))
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()

  await expect(page.getByRole('listitem').filter({ hasText: quellenTitel })).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 30_000 }
  )

  return notebookId
}

const frageFeld = (page: Page) => page.getByLabel('Frage an die ausgewählten Quellen')

async function fragen(page: Page, frage: string) {
  await frageFeld(page).fill(frage)
  await page.getByRole('button', { name: 'Fragen' }).click()
}

test('eine Frage bekommt eine Antwort mit anklickbarem Beleg', async ({ page }) => {
  await notebookMitQuelle(page)

  await fragen(page, 'Wie hat sich die Marge entwickelt?')

  // Der Beleg ist eine echte Schaltfläche mit zugänglichem Namen — „1" allein
  // wäre vorgelesen wertlos.
  const beleg = page.getByRole('button', { name: /^Beleg 1: Quartalsbericht/ })
  await expect(beleg).toBeVisible({ timeout: 30_000 })

  // Zugeklappt, solange niemand darauf gedrückt hat.
  await expect(beleg).toHaveAttribute('aria-expanded', 'false')

  await beleg.click()
  await expect(beleg).toHaveAttribute('aria-expanded', 'true')

  // Das ist die eigentliche Zusicherung: der Beleg zeigt die Passage, auf der
  // die Antwort beruht — nicht irgendeine Stelle aus derselben Quelle.
  await expect(page.getByRole('figure')).toContainText(KERNSATZ.slice(0, 40))
})

test('ein erfundener Beleg verschwindet aus der Antwort', async ({ page }) => {
  await notebookMitQuelle(page)

  // Der Stub belegt hier mit [9], obwohl nur ein Ausschnitt vorgelegt wurde.
  // Bliebe die Zahl stehen, zeigte die Oberfläche einen Beleg, der ins Leere
  // führt — und das sieht aus wie Sorgfalt, ist aber das Gegenteil.
  await fragen(page, 'ERFINDE etwas zur Marge')

  await expect(page.getByText('Eine unbelegte Behauptung')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /^Beleg/ })).toHaveCount(0)
  await expect(page.getByText('[9]')).toHaveCount(0)
})

test('ohne ausgewählte Quelle wird nicht geantwortet', async ({ page }) => {
  await notebookMitQuelle(page)

  // Alle Quellen abwählen. Die Antwort darf dann nicht heimlich doch auf
  // ihnen beruhen.
  await page.getByRole('checkbox', { name: 'Quartalsbericht' }).uncheck()
  await expect(page.getByText('Keine Quelle ausgewählt')).toBeVisible()

  await fragen(page, 'Wie hat sich die Marge entwickelt?')

  await expect(page.getByText('Dazu steht nichts in den ausgewählten Quellen')).toBeVisible({
    timeout: 30_000
  })
  await expect(page.getByRole('button', { name: /^Beleg/ })).toHaveCount(0)
})

test('der Verlauf übersteht das Neuladen samt Belegen', async ({ page }) => {
  await notebookMitQuelle(page)
  await fragen(page, 'Wie hat sich die Marge entwickelt?')
  await expect(page.getByRole('button', { name: /^Beleg 1/ })).toBeVisible({ timeout: 30_000 })

  await page.reload()

  // Frage und Antwort kommen jetzt aus der Datenbank, nicht aus dem Hook.
  // Der Beleg muss trotzdem anklickbar sein und dieselbe Passage zeigen —
  // gespeichert wird sie mit der Nachricht, nicht nachgeladen.
  await expect(page.getByText('Wie hat sich die Marge entwickelt?')).toBeVisible()
  const beleg = page.getByRole('button', { name: /^Beleg 1: Quartalsbericht/ })
  await expect(beleg).toBeVisible()
  await beleg.click()
  await expect(page.getByRole('figure')).toContainText(KERNSATZ.slice(0, 40))
})

test('ein fremdes Notebook lässt sich nicht befragen', async ({ page, request }) => {
  const notebookId = await notebookMitQuelle(page)

  // Zweiter Nutzer, gültiges Token, direkter Aufruf der Route — der Weg, den
  // ein Angreifer nähme, wenn die Oberfläche ihm den Knopf nicht anbietet.
  const mallory = await createUser(request, 'mallory')
  const alsMallory = asUser(request, mallory)

  const antwort = await alsMallory.post('/api/chat', {
    data: { notebookId, question: 'Wie hat sich die Marge entwickelt?', sourceIds: null }
  })

  // 404 und nicht 403: ein 403 bestätigte, dass es dieses Notebook gibt.
  expect(antwort.status()).toBe(404)
})
