import { expect, test } from '@playwright/test'

import { uniqueEmail } from './lib/supabase'

/**
 * a1 — Registrierung, Anmeldung, Abmeldung und der Zugriffsschutz.
 */

const PASSWORD = 'test-passwort-1234'

test('ein geschützter Bereich leitet Unangemeldete zur Anmeldung — mit Rückweg', async ({
  page
}) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/anmelden\?weiter=%2Fapp/)
  await expect(page.getByRole('heading', { name: 'Willkommen zurück' })).toBeVisible()
})

test('Registrierung führt direkt in den App-Bereich', async ({ page }) => {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('neu'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Deine Notebooks' })).toBeVisible()
  // Der Leerzustand ist der erste Bildschirm jedes neuen Nutzers.
  await expect(page.getByText('Noch keine Notebooks')).toBeVisible()
})

test('Anmeldung, Abmeldung, und danach ist der Bereich wieder zu', async ({ page }) => {
  const email = uniqueEmail('wieder')

  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/anmelden')
  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/anmelden/)
})

test('falsche Zugangsdaten verraten nicht, ob das Konto existiert', async ({ page }) => {
  await page.goto('/anmelden')
  await page.getByLabel('E-Mail-Adresse').fill('gibtesnicht@beispiel.test')
  await page.getByLabel('Passwort').fill('falsches-passwort-123')
  await page.getByRole('button', { name: 'Anmelden' }).click()

  // Innerhalb des Formulars suchen: Next rendert für Routenansagen einen
  // eigenen role="alert"-Container, und ein ungebundenes getByRole trifft beide.
  const alert = page.locator('form').getByRole('alert')
  await expect(alert).toBeVisible()
  // Dieselbe Meldung wie bei einem existierenden Konto mit falschem Passwort.
  // Eine Unterscheidung wäre freundlicher, verriete aber, welche Adressen
  // registriert sind.
  await expect(alert).toHaveText('E-Mail-Adresse oder Passwort stimmt nicht.')
})

test('ein angemeldeter Nutzer wird von der Anmeldeseite weggeleitet', async ({ page }) => {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('schonda'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/anmelden')
  await expect(page).toHaveURL(/\/app$/)
})
