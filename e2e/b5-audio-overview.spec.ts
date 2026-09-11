import { expect, test, type Page } from '@playwright/test'

import { uniqueEmail } from './lib/supabase'

/**
 * b5 — Audio-Überblick.
 *
 * Das 110-%-Feature, und zugleich das mit dem unzuverlässigsten Schritt: Die
 * Sprachausgabe hat das knappste Kontingent des ganzen Projekts. Deshalb
 * prüft dieser Test nicht nur den guten Fall, sondern vor allem den, auf den
 * es bei einer Vorführung ankommt — dass ein erschöpftes Kontingent ein
 * lesbares Transkript hinterlässt statt eines Ladebalkens, der nie endet.
 *
 * Zwei Stichwörter im Quelltext steuern den Stub (siehe scripts/ai-stub.mjs):
 * `KEIN AUDIO` lässt die Vertonung mit 429 scheitern, `KAPUTTES SKRIPT` lässt
 * das Modell falsche Sprechernamen liefern. Mit einem echten Anbieter ließe
 * sich beides nicht auf Kommando herbeiführen.
 */

const PASSWORD = 'test-passwort-1234'
const studio = (page: Page) => page.getByRole('region', { name: 'Studio' })
const chat = (page: Page) => page.getByRole('region', { name: 'Chat' })

async function notebookMitQuelle(
  page: Page,
  inhalt = 'Die Marge stieg von 18,2 auf 21,4 Prozent. '
) {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('audio'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Audio-Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!

  const quelle = page.getByRole('region', { name: 'Quelle hinzufügen' })
  await quelle.getByRole('tab', { name: 'Text' }).click()
  await quelle.getByLabel('Titel').fill('Quartalsbericht')
  await quelle.getByLabel('Inhalt').fill(inhalt.repeat(30))
  await quelle.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Quartalsbericht' })).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 30_000 }
  )
  return id
}

test('aus den Quellen entsteht ein zweistimmiger Überblick mit Transkript', async ({ page }) => {
  await notebookMitQuelle(page)

  await studio(page).getByRole('button', { name: 'Audio-Überblick erzeugen' }).click()

  // Der Player erscheint erst, wenn Skript, Vertonung und Ablage durch sind.
  const player = studio(page).locator('audio')
  await expect(player).toBeVisible({ timeout: 120_000 })

  // Die Adresse ist signiert und zeigt in den privaten Bucket — nicht auf
  // eine öffentliche Datei und nicht durch eine Function hindurch.
  const quelle = await player.getAttribute('src')
  expect(quelle).toContain('/storage/v1/object/sign/audio/')
  expect(quelle).toContain('token=')

  // Das Transkript ist die Textalternative zum Audio und muss beide Stimmen
  // enthalten — ein Gespräch mit einer Stimme wäre ein Vortrag.
  await studio(page).getByText('Transkript').click()
  await expect(studio(page).getByRole('listitem').filter({ hasText: 'Alex' }).first()).toBeVisible()
  await expect(studio(page).getByRole('listitem').filter({ hasText: 'Sam' }).first()).toBeVisible()

  // Und die Dauer steht dabei, damit man weiß, worauf man sich einlässt.
  await expect(studio(page)).toContainText('Minuten')
})

test('ein erschöpftes Kontingent hinterlässt ein lesbares Transkript', async ({ page }) => {
  // Der Pfad `script_only`. Er ist der Grund, warum das Skript **vor** der
  // Vertonung gespeichert wird.
  await notebookMitQuelle(page, 'KEIN AUDIO. Die Marge stieg auf 21,4 Prozent. ')

  await studio(page).getByRole('button', { name: 'Audio-Überblick erzeugen' }).click()

  await expect(studio(page).getByText(/Sprachausgabe war nicht verfügbar/)).toBeVisible({
    timeout: 120_000
  })

  // Kein Player — aber das Transkript ist da und aufgeklappt, ohne dass
  // jemand danach suchen muss.
  await expect(studio(page).locator('audio')).toHaveCount(0)
  await expect(studio(page).getByRole('listitem').filter({ hasText: 'Alex' }).first()).toBeVisible()
})

test('mit Mistral als Anbieter ist der Überblick nicht verfügbar — und sagt warum', async ({
  page
}) => {
  await notebookMitQuelle(page)

  await chat(page)
    .getByRole('radio', { name: /Mistral/ })
    .check()
  await expect(chat(page).getByText(/Vollständig in der EU/)).toBeVisible()

  // Kein deaktivierter Knopf ohne Erklärung: Die Sperre kommt aus
  // `capabilities.tts` in der Registry, und der Text nennt den Grund und den
  // Weg zurück.
  await expect(studio(page).getByRole('button', { name: /Überblick/ })).toHaveCount(0)
  await expect(studio(page).getByText(/braucht Google Gemini/)).toBeVisible()
})

test('ohne verarbeitete Quelle wird nichts angeboten', async ({ page }) => {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('audio-leer'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  // Warten, bis die Registrierung durch ist. Ohne das navigiert der Test
  // weiter, während das Formular noch abgeschickt wird, und `/app/neu` leitet
  // ihn zur Anmeldung zurück.
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Leeres Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)

  await expect(studio(page).getByText(/Sobald eine Quelle verarbeitet ist/)).toBeVisible()
  await expect(studio(page).getByRole('button', { name: /Überblick/ })).toHaveCount(0)
})

test('ein fremdes Notebook lässt sich nicht vertonen', async ({ page, browser }) => {
  const notebookId = await notebookMitQuelle(page)

  const kontext = await browser.newContext()
  const mallory = await kontext.newPage()
  await mallory.goto('/registrieren')
  await mallory.getByLabel('E-Mail-Adresse').fill(uniqueEmail('mallory-audio'))
  await mallory.getByLabel('Passwort').fill(PASSWORD)
  await mallory.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(mallory).toHaveURL(/\/app$/)

  const antwort = await mallory.request.post('/api/studio/audio', { data: { notebookId } })
  // 404 und nicht 403: ein 403 bestätigte, dass es dieses Notebook gibt.
  expect(antwort.status()).toBe(404)

  await kontext.close()
})
