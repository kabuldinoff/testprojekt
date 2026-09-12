import { expect, test, type Page } from '@playwright/test'

import { asService, uniqueEmail } from './lib/supabase'

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

/**
 * Öffnet die Einstellungen im Arbeitsbereich.
 *
 * Sie liegen am Fuß der Quellenspalte hinter einer Aufklappung — sie werden
 * selten gebraucht und drängten die Quellen sonst nach unten. Für die Tests
 * heißt das: erst öffnen, dann tippen.
 */
async function oeffneEinstellungen(page: Page) {
  // Auf die Quellenspalte warten, nicht auf die Umschaltleiste: Die ist ab
  // 1280px zu Recht unsichtbar, und `waitFor()` darauf lief in eine
  // Zeitüberschreitung — auf genau der Breite, mit der die Tests laufen.
  await page.getByRole('region', { name: 'Quellen' }).waitFor()
  const zusammenfassung = page.getByText('Einstellungen', { exact: true })
  await zusammenfassung.click()
  await expect(page.getByRole('button', { name: 'Speichern' })).toBeVisible()
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

  await oeffneEinstellungen(page)
  await expect(page.getByLabel(/Beschreibung/)).toHaveValue('Umsatz, Marge, Ausblick')

  await page.getByRole('link', { name: /Alle Notebooks/ }).click()
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

  await oeffneEinstellungen(page)
  await page.getByLabel('Notebook-Titel').fill('Zweiter Name')
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

  await oeffneEinstellungen(page)

  // Der gefährliche Knopf liegt hinter einer weiteren Aufklappung und ist
  // vorher nicht erreichbar. Ohne diese Zusicherung wäre die Bestätigung nur
  // Dekoration.
  const deleteButton = page.getByRole('button', { name: /endgültig löschen/ })
  await expect(deleteButton).toBeHidden()

  await page.getByText('Ja, ich möchte löschen').click()
  await expect(deleteButton).toBeVisible()
  await deleteButton.click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByText('Noch keine Notebooks')).toBeVisible()
})

test('mit dem Notebook verschwinden auch seine Dateien', async ({ page, playwright }) => {
  // Der Teil, den niemand sieht. Der Fremdschlüssel räumt `sources`,
  // `source_chunks` und `audio_overviews` per Cascade ab — **Supabase Storage
  // hängt nicht am Schema.** Ohne das Einsammeln blieben die Dateien liegen,
  // unauffindbar, und zählten weiter gegen das Gigabyte im kostenlosen Tarif.
  //
  // Nachgemessen beim Aufräumen des lokalen Stacks: 1070 gelöschte Notebooks
  // hinterließen 837 Dateien, nicht eine ging mit.
  await registerAndSignIn(page)
  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Mit Anhang')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)
  const notebookId = page.url().split('/').pop()!

  const panel = page.getByRole('region', { name: 'Quelle hinzufügen' })
  await panel.getByRole('tab', { name: 'Text' }).click()
  await panel.getByLabel('Titel').fill('Anhang')
  await panel.getByLabel('Inhalt').fill('Die Marge stieg deutlich an. '.repeat(20))
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Anhang' })).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 30_000 }
  )

  // Und einen Audio-Überblick dazu. Ohne ihn prüfte der Test nur den
  // `sources`-Bucket — und genau der Audio-Pfad ist der, für den Migration
  // 0014 die Löschpolicy überhaupt erst nachgeholt hat. Der erste Anlauf
  // dieses Tests hatte ihn nicht, und die Lücke wäre unbemerkt geblieben.
  await page
    .getByRole('region', { name: 'Studio' })
    .getByRole('button', {
      name: 'Audio-Überblick erzeugen'
    })
    .click()
  await expect(page.getByRole('region', { name: 'Studio' }).locator('audio')).toBeVisible({
    timeout: 120_000
  })

  // Die Pfade holen, solange es die Zeilen noch gibt. Mit dem Secret Key, weil
  // nur er nachher zwischen „gelöscht" und „von einer Policy verborgen"
  // unterscheiden kann — mit dem Token des Nutzers sähe beides gleich aus.
  const api = await playwright.request.newContext()
  const dienst = asService(api)

  const pfade: Array<{ bucket: string; pfad: string }> = []
  for (const [bucket, abfrage] of [
    ['sources', `sources?notebook_id=eq.${notebookId}&select=storage_path`],
    ['audio', `audio_overviews?notebook_id=eq.${notebookId}&select=storage_path`]
  ] as const) {
    const zeilen = (await (await dienst.get(abfrage)).json()) as Array<{
      storage_path: string | null
    }>
    for (const z of zeilen) {
      expect(z.storage_path, `${bucket}: kein Pfad in der Zeile`).toBeTruthy()
      pfade.push({ bucket, pfad: z.storage_path! })
    }
  }
  expect(pfade.length, 'es sollten zwei Dateien sein, eine je Bucket').toBe(2)

  const ordnerVon = (p: string) => p.slice(0, p.lastIndexOf('/'))
  const namenVon = (p: string) => p.slice(p.lastIndexOf('/') + 1)

  for (const { bucket, pfad } of pfade) {
    expect(await dienst.storageNames(bucket, ordnerVon(pfad)), `${bucket}: vorher`).toContain(
      namenVon(pfad)
    )
  }

  await oeffneEinstellungen(page)
  await page.getByText('Ja, ich möchte löschen').click()
  await page.getByRole('button', { name: /endgültig löschen/ }).click()
  await expect(page).toHaveURL(/\/app$/)

  for (const { bucket, pfad } of pfade) {
    expect(
      await dienst.storageNames(bucket, ordnerVon(pfad)),
      `${pfad} liegt noch im Bucket ${bucket}`
    ).not.toContain(namenVon(pfad))
  }

  await api.dispose()
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
