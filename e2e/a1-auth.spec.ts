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

test('beide Anmeldefehler sehen identisch aus', async ({ page }) => {
  // Innerhalb des Formulars suchen: Next rendert für Routenansagen einen
  // eigenen role="alert"-Container, und ein ungebundenes getByRole trifft beide.
  const meldung = () => page.locator('form').getByRole('alert')

  const versuch = async (email: string, passwort: string) => {
    await page.goto('/anmelden')
    await page.getByLabel('E-Mail-Adresse').fill(email)
    await page.getByLabel('Passwort').fill(passwort)
    await page.getByRole('button', { name: 'Anmelden' }).click()
    await expect(meldung()).toBeVisible()
    return meldung().textContent()
  }

  // Ein echtes Konto anlegen, damit der zweite Fall auch wirklich "Konto
  // existiert, Passwort falsch" ist und nicht wieder "Konto existiert nicht".
  const vorhanden = uniqueEmail('vorhanden')
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(vorhanden)
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)
  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page).toHaveURL(/\/$/)

  const unbekannt = await versuch('gibtesnicht@beispiel.test', 'falsches-passwort-123')
  const falschesPasswort = await versuch(vorhanden, 'ganz-anderes-passwort-9')

  // Der eigentliche Punkt: Ein Unterschied zwischen beiden Meldungen wäre eine
  // Auskunft darüber, welche Adressen registriert sind. Nur einen der beiden
  // Fälle zu prüfen — so stand es hier vorher — beweist das nicht.
  expect(unbekannt).toBe('E-Mail-Adresse oder Passwort stimmt nicht.')
  expect(falschesPasswort).toBe(unbekannt)
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
