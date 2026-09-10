import { expect, test, type Page } from '@playwright/test'

import { asUser, createUser, uniqueEmail } from './lib/supabase'

/**
 * b2 — Quellen hinzufügen und verarbeiten.
 *
 * Geprüft wird die ganze Kette bis zu den Abschnitten: anlegen, hochladen,
 * lesen, zerlegen, ablegen. Und die Fehlerwege, denn die sind hier die halbe
 * Funktion — eine Quelle, die nicht verarbeitet werden kann, ist der
 * Normalfall und keine Ausnahme.
 */

const PASSWORD = 'test-passwort-1234'

async function registerAndOpenNotebook(page: Page, title = 'Quellen-Notebook') {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('quellen'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill(title)
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop()!
}

/**
 * Der Bereich zum Hinzufügen. Eingegrenzt, weil „Titel" auf derselben Seite
 * zweimal vorkommt — hier und im Einstellungsformular des Notebooks.
 */
const addPanel = (page: Page) => page.getByRole('region', { name: 'Quelle hinzufügen' })

/**
 * Wartet, bis eine Quelle einen Endzustand erreicht hat.
 *
 * `data-status` ist der Haken zum Warten — er wechselt genau einmal und ist
 * eindeutig. Geprüft wird danach aber die **sichtbare** Beschriftung: ein Test,
 * der nur ein Attribut liest, bliebe grün, wenn die Anzeige etwas anderes sagt
 * als der Zustand.
 */
const SICHTBAR = { ready: 'Bereit', failed: 'Fehlgeschlagen' } as const

async function waitForStatus(page: Page, titleText: string, status: 'ready' | 'failed') {
  const eintrag = page.getByRole('listitem').filter({ hasText: titleText })
  await expect(eintrag).toHaveAttribute('data-status', status, { timeout: 30_000 })
  await expect(eintrag).toContainText(SICHTBAR[status])
  return eintrag
}

test('eingefügter Text wird verarbeitet und ist danach bereit', async ({ page }) => {
  await registerAndOpenNotebook(page)

  await expect(page.getByText('Noch keine Quellen')).toBeVisible()

  const panel = addPanel(page)
  await panel.getByRole('tab', { name: 'Text' }).click()
  await panel.getByLabel('Titel').fill('Sitzungsnotizen')
  await panel
    .getByLabel('Inhalt')
    .fill(
      'Die Marge im Dienstleistungssegment stieg von 18,2 auf 21,4 Prozent. ' +
        'Getragen wurde das von höheren Tagessätzen bei gleichbleibenden Personalkosten. '.repeat(
          20
        )
    )
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()

  const eintrag = await waitForStatus(page, 'Sitzungsnotizen', 'ready')
  // Die Zeichenzahl steht erst nach der Verarbeitung fest — sie ist der
  // Beweis, dass der Text wirklich gelesen und nicht nur abgelegt wurde.
  await expect(eintrag).toContainText('Zeichen')
})

test('eine hochgeladene Textdatei durchläuft dieselbe Kette', async ({ page }) => {
  await registerAndOpenNotebook(page)

  const panel = addPanel(page)
  await panel.getByRole('tab', { name: 'Datei' }).click()
  await panel.getByLabel(/PDF, Text oder Markdown/).setInputFiles({
    name: 'quartalsbericht.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Umsatz, Marge und Ausblick für das dritte Quartal. '.repeat(60) +
        '\n\nDie Personalkosten blieben konstant. '.repeat(40)
    )
  })
  await panel.getByRole('button', { name: 'Hochladen' }).click()

  const eintrag = await waitForStatus(page, 'quartalsbericht.txt', 'ready')
  await expect(eintrag).toContainText('TEXT')
})

test('eine unlesbare PDF-Datei endet als Fehler mit Grund', async ({ page }) => {
  await registerAndOpenNotebook(page)

  const panel = addPanel(page)
  await panel.getByRole('tab', { name: 'Datei' }).click()
  await panel.getByLabel(/PDF, Text oder Markdown/).setInputFiles({
    name: 'kaputt.pdf',
    mimeType: 'application/pdf',
    // Kein gültiges PDF. Der Parser scheitert, und genau das soll der Nutzer
    // erfahren — statt einer Quelle, die stumm auf „wartet" stehen bleibt.
    buffer: Buffer.from('das ist kein PDF')
  })
  await panel.getByRole('button', { name: 'Hochladen' }).click()

  // Sofort, nicht nach drei Versuchen: ein unlesbares PDF ist ein dauerhafter
  // Fehler, und dafür ist Wiederholen sinnlose Wartezeit.
  const eintrag = await waitForStatus(page, 'kaputt.pdf', 'failed')
  await expect(eintrag).toContainText('konnte nicht gelesen werden')
})

test('eine Adresse im lokalen Netz wird abgelehnt', async ({ page }) => {
  await registerAndOpenNotebook(page)

  const panel = addPanel(page)
  await panel.getByRole('tab', { name: 'Adresse' }).click()
  // Der klassische SSRF-Versuch: den Server dazu bringen, etwas abzurufen,
  // das nur von innen erreichbar ist. Die Ablehnung passiert im
  // Verarbeitungslauf, also erscheint sie als Fehlerzustand der Quelle.
  await panel.getByLabel(/Adresse der Webseite/).fill('http://169.254.169.254/latest/meta-data/')
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()

  const eintrag = await waitForStatus(page, '169.254.169.254', 'failed')
  await expect(eintrag).toContainText('lokalen oder privaten Netz')
})

test('eine fremde Quelle lässt sich weder anlegen noch anstoßen', async ({
  page,
  browser,
  playwright
}) => {
  const notebookId = await registerAndOpenNotebook(page, 'Alices Notebook')

  // Alice legt eine Quelle an, damit es etwas zu holen gibt.
  const panel = addPanel(page)
  await panel.getByRole('tab', { name: 'Text' }).click()
  await panel.getByLabel('Titel').fill('Alices Notizen')
  await panel.getByLabel('Inhalt').fill('Vertraulicher Text. '.repeat(30))
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()
  const alicesEintrag = await waitForStatus(page, 'Alices Notizen', 'ready')
  await expect(alicesEintrag).toBeVisible()

  // Die ID von Alices Quelle, um sie Mallory gleich unterzuschieben.
  const alicesSourceId = await page.evaluate(() => {
    const eintrag = [...document.querySelectorAll('li[data-status]')].find((li) =>
      li.textContent?.includes('Alices Notizen')
    )
    return eintrag?.getAttribute('data-source-id') ?? null
  })
  expect(alicesSourceId, 'Alices Quellen-ID nicht gefunden').toBeTruthy()

  const context = await browser.newContext()
  const mallory = await context.newPage()
  await mallory.goto('/registrieren')
  await mallory.getByLabel('E-Mail-Adresse').fill(uniqueEmail('mallory'))
  await mallory.getByLabel('Passwort').fill(PASSWORD)
  await mallory.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(mallory).toHaveURL(/\/app$/)

  // An der Oberfläche vorbei, direkt gegen die Route — so, wie es jemand
  // täte, der es darauf anlegt.
  const angelegt = await mallory.request.post('/api/sources', {
    data: { notebookId, kind: 'paste', title: 'untergeschoben', content: 'x'.repeat(200) }
  })
  // 404 und nicht 403: ein 403 bestätigte, dass es dieses Notebook gibt.
  expect(angelegt.status()).toBe(404)

  // Und die Verarbeitung einer fremden Quelle lässt sich nicht anstoßen.
  // Ohne diesen Aufruf hielte der Test nicht, was sein Name verspricht: die
  // Route wäre nie berührt worden.
  const angestossen = await mallory.request.post(`/api/sources/${alicesSourceId}/ingest`)
  expect(angestossen.status()).toBe(404)

  await context.close()

  // Und Alices Abschnitte sind auch direkt über PostgREST nicht zu holen.
  // Der Token kommt hier aus der Auth-API und nicht aus dem Browser:
  // @supabase/ssr legt die Sitzung in Cookies ab, nicht im localStorage — im
  // ersten Anlauf hatte ich dort danach gesucht.
  const apiContext = await playwright.request.newContext()
  const malloryDirekt = await createUser(apiContext, 'mallory-direkt')
  const malloryApi = asUser(apiContext, malloryDirekt)

  const chunks = await malloryApi.get('source_chunks?select=content')
  expect(chunks.status()).toBe(200)
  expect((await chunks.json()) as unknown[]).toEqual([])

  // Leere Abschnitte allein beweisen nicht, dass auch die Metadaten privat
  // sind. Titel, Adresse und Fehlermeldung einer Quelle verraten für sich
  // genommen schon einiges.
  const sources = await malloryApi.get('sources?select=title,source_url,error_message')
  expect(sources.status()).toBe(200)
  expect((await sources.json()) as unknown[]).toEqual([])

  // Gegenprobe zur bewussten Entscheidung, für source_chunks keine
  // Verbots-Policies zu schreiben: das grant vergibt nur select, also
  // scheitert jeder Schreibversuch schon an der Rechteprüfung — selbst der
  // des Besitzers.
  const eingefuegt = await malloryApi.post('source_chunks', {
    source_id: alicesSourceId,
    notebook_id: notebookId,
    chunk_index: 0,
    content: 'untergeschoben',
    char_start: 0,
    char_end: 14
  })
  expect(eingefuegt.ok(), await eingefuegt.text()).toBe(false)

  await apiContext.dispose()
})
