import { expect, test, type Page } from '@playwright/test'

import { uniqueEmail } from './lib/supabase'

/**
 * b1 — Notebooks anlegen, ändern, löschen.
 *
 * Jeder Test beginnt mit einem frischen Konto. Das ist langsamer als ein
 * gemeinsames, aber die Alternative wäre eine Reihenfolge-Abhängigkeit
 * zwischen Tests: der zweite sähe dann, was der erste hinterlassen hat, und
 * ein einzeln ausgeführter Test schlüge fehl.
 */

const PASSWORD = 'test-passwort-1234'

async function registerAndSignIn(page: Page) {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('notebook'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)
}

test('der Leerzustand führt zum ersten Notebook', async ({ page }) => {
  await registerAndSignIn(page)

  await expect(page.getByText('Noch keine Notebooks')).toBeVisible()

  // Im Leerzustand gibt es genau einen Weg nach vorn, nicht zwei konkurrierende.
  await expect(page.getByRole('link', { name: 'Neues Notebook' })).toBeHidden()
  await page.getByRole('link', { name: 'Erstes Notebook anlegen' }).click()

  await expect(page).toHaveURL(/\/app\/neu$/)
  await page.getByLabel('Titel').fill('Quartalsanalyse Q3')
  await page.getByLabel('Symbol').fill('📊')
  await page.getByLabel(/Beschreibung/).fill('Umsatz, Marge, Ausblick')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()

  // Nach dem Anlegen landet man im Notebook, nicht wieder in der Liste.
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Quartalsanalyse Q3')
  // Über die zugängliche Beschreibung der Überschrift statt über einen
  // CSS-Pfad: derselbe Text steht weiter unten noch einmal als Vorbelegung im
  // Formular, und `main > p` hätte den Test an die Elementhierarchie gebunden.
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleDescription(
    'Umsatz, Marge, Ausblick'
  )
  await expect(page.getByLabel(/Beschreibung/)).toHaveValue('Umsatz, Marge, Ausblick')

  await page.getByRole('link', { name: /Zurück zur Übersicht/ }).click()
  await expect(page.getByRole('link', { name: /Quartalsanalyse Q3/ })).toBeVisible()
})

test('ein Titel aus Leerzeichen wird abgelehnt', async ({ page }) => {
  await registerAndSignIn(page)
  await page.goto('/app/neu')

  // Das required-Attribut fängt ein leeres Feld ab, aber nicht drei
  // Leerzeichen — dafür ist die serverseitige Prüfung da.
  await page.getByLabel('Titel').fill('   ')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()

  await expect(page.locator('form').getByRole('alert')).toHaveText('Bitte einen Titel angeben.')
  await expect(page).toHaveURL(/\/app\/neu$/)
})

test('Umbenennen wirkt sofort in Titel und Übersicht', async ({ page }) => {
  await registerAndSignIn(page)
  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Erster Name')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)

  await page.getByLabel('Titel').fill('Zweiter Name')
  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Zweiter Name')

  // Auch in der Liste — sonst hätte revalidatePath('/app') gefehlt und die
  // Übersicht zeigte den alten Namen aus dem Cache.
  await page.goto('/app')
  await expect(page.getByRole('link', { name: /Zweiter Name/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Erster Name/ })).toBeHidden()
})

test('Löschen verlangt einen zweiten Schritt', async ({ page }) => {
  await registerAndSignIn(page)
  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Wegwerf')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)

  // Der gefährliche Knopf liegt hinter einer Aufklappung und ist vorher nicht
  // erreichbar. Ohne diese Zusicherung wäre die Bestätigung nur Dekoration.
  const deleteButton = page.getByRole('button', { name: /endgültig löschen/ })
  await expect(deleteButton).toBeHidden()

  await page.getByText('Ja, ich möchte löschen').click()
  await expect(deleteButton).toBeVisible()
  await deleteButton.click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByText('Noch keine Notebooks')).toBeVisible()
})

test('ein fremdes Notebook ergibt 404, nicht 403', async ({ page, browser }) => {
  // Alice legt eines an.
  await registerAndSignIn(page)
  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Alices Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)
  const foreignUrl = page.url()

  // Mallory ruft die URL direkt auf.
  const context = await browser.newContext()
  const malloryPage = await context.newPage()
  await registerAndSignIn(malloryPage)

  const response = await malloryPage.goto(foreignUrl)

  // 404 und nicht 403: ein 403 würde bestätigen, dass es dieses Notebook gibt,
  // und damit genau das preisgeben, was RLS gerade verborgen hat.
  expect(response?.status()).toBe(404)
  await expect(malloryPage.getByText('Alices Notebook')).toBeHidden()

  await context.close()
})
