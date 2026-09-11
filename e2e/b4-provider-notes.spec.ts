import { expect, test, type Page } from '@playwright/test'

import { uniqueEmail } from './lib/supabase'

/**
 * b4 — Anbieterwahl und Notizen.
 *
 * Zwei Dinge, die inhaltlich zusammengehören: der Nutzer entscheidet, wohin
 * seine Daten gehen, und was er aus dem Gespräch behalten will.
 *
 * Der Schwerpunkt liegt auf zwei Eigenschaften, die leicht unbemerkt kaputt
 * gehen: Die Anbieterwahl muss das **Neuladen überleben** — eine Einstellung,
 * die nur im Browser steht, behauptet einen Datenweg, den es nicht gibt. Und
 * eine übernommene Antwort muss ihre **Belege mitnehmen**, sonst ist sie eine
 * Behauptung ohne Herkunft.
 */

const PASSWORD = 'test-passwort-1234'

/**
 * Die Abschnitte der Seite als Landmarken.
 *
 * Ohne diese Eingrenzung greift `getByLabel('Titel')` quer über die Seite —
 * „Titel" steht am Quellenformular, am Notizformular und an den
 * Einstellungen. Der erste Anlauf füllte damit die Notebook-Einstellungen und
 * schickte ein leeres Notizformular ab.
 */
const notizen = (page: Page) => page.getByRole('region', { name: 'Notizen' })
const chat = (page: Page) => page.getByRole('region', { name: 'Chat' })
const KERNSATZ = 'Die Marge im Dienstleistungssegment stieg von 18,2 auf 21,4 Prozent.'

async function notebookMitQuelle(page: Page) {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('notizen'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Notiz-Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)

  const panel = page.getByRole('region', { name: 'Quelle hinzufügen' })
  await panel.getByRole('tab', { name: 'Text' }).click()
  await panel.getByLabel('Titel').fill('Quartalsbericht')
  await panel
    .getByLabel('Inhalt')
    .fill(KERNSATZ + ' Die Personalkosten blieben unverändert. '.repeat(30))
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()

  await expect(page.getByRole('listitem').filter({ hasText: 'Quartalsbericht' })).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 30_000 }
  )
}

test('der Anbieterwechsel ändert die Datenfluss-Aussage und überlebt das Neuladen', async ({
  page
}) => {
  await notebookMitQuelle(page)

  // Voreinstellung ist Gemini — der einzige Anbieter, der später die
  // Sprachausgabe kann.
  await expect(chat(page).getByRole('radio', { name: /Google Gemini/ })).toBeChecked()
  await expect(chat(page).getByText(/Ihre Quellen werden in der EU indexiert/)).toBeVisible()

  // Auf die Antwort der Server Action warten, nicht auf ein Indiz.
  //
  // Die erste Fassung wartete darauf, dass das Fieldset wieder bedienbar ist.
  // Das war unzuverlässig: `toBeEnabled()` kann sofort zutreffen, weil das
  // Feld anfangs bedienbar *ist* — die Prüfung lief dann durch, bevor die
  // Übertragung überhaupt begonnen hatte, und das Neuladen wurde zum Wettlauf.
  // Die Server Action schickt ein POST an dieselbe Adresse; darauf lässt sich
  // eindeutig warten.
  const gespeichert = page.waitForResponse(
    (antwort) => antwort.request().method() === 'POST' && antwort.url() === page.url()
  )

  await chat(page)
    .getByRole('radio', { name: /Mistral/ })
    .check()

  // Die Aussage muss sich mit ändern. Eine Auswahl ohne sichtbare Folge wäre
  // eine Einstellung, deren Bedeutung niemand kennt.
  await expect(chat(page).getByText(/Vollständig in der EU/)).toBeVisible()
  await expect(chat(page).getByText(/Ihre Quellen werden in der EU indexiert/)).toHaveCount(0)

  expect((await gespeichert).status()).toBe(200)

  // Das ist der Punkt: eine Einstellung, die nur im Browser steht, behauptet
  // einen Datenweg, den der Server nicht geht.
  await page.reload()
  await expect(chat(page).getByRole('radio', { name: /Mistral/ })).toBeChecked()
  await expect(chat(page).getByText(/Vollständig in der EU/)).toBeVisible()
})

test('eine Antwort lässt sich als Notiz behalten, samt Belegen', async ({ page }) => {
  await notebookMitQuelle(page)

  await chat(page).getByLabel('Frage an die ausgewählten Quellen').fill('Wie war die Marge?')
  await chat(page).getByRole('button', { name: 'Fragen' }).click()
  await expect(chat(page).getByRole('button', { name: /^Beleg 1/ })).toBeVisible({
    timeout: 30_000
  })

  await chat(page).getByRole('button', { name: 'Als Notiz speichern' }).click()
  await expect(chat(page).getByText('Als Notiz gespeichert.')).toBeVisible()

  // Der Knopf verschwindet: ein Knopf, der nach dem Drücken unverändert
  // dasteht, lädt zum zweiten Drücken ein, und dann liegt die Antwort zweimal
  // in der Liste.
  await expect(chat(page).getByRole('button', { name: 'Als Notiz speichern' })).toHaveCount(0)

  await page.reload()

  const notiz = notizen(page).getByRole('article').filter({ hasText: 'aus dem Chat' })
  await expect(notiz).toBeVisible()
  // Die Belege müssen mitgekommen sein — ohne sie ist die Notiz eine
  // Behauptung ohne Herkunft.
  await expect(notiz).toContainText('[1] Quartalsbericht')
})

test('eine eigene Notiz lässt sich schreiben, ändern und löschen', async ({ page }) => {
  await notebookMitQuelle(page)

  await expect(notizen(page).getByText('Noch keine Notizen')).toBeVisible()

  await notizen(page).getByRole('button', { name: 'Notiz schreiben' }).click()
  await notizen(page).getByLabel('Titel').fill('Offene Frage')
  await notizen(page).getByLabel('Inhalt').fill('Woher kommt der Margensprung?')
  await notizen(page).getByRole('button', { name: 'Notiz anlegen' }).click()

  const notiz = notizen(page).getByRole('article').filter({ hasText: 'Offene Frage' })
  await expect(notiz).toBeVisible()
  // Selbst geschrieben, also keine Chat-Herkunft.
  await expect(notiz).not.toContainText('aus dem Chat')

  await notiz.getByRole('button', { name: 'Bearbeiten' }).click()
  await notizen(page).getByLabel('Inhalt').fill('Beantwortet: höhere Tagessätze.')
  await notizen(page).getByRole('button', { name: 'Speichern' }).click()

  // Das Formular muss sich schließen — es tut es über den Rückgabewert der
  // Action und nicht beim Klick, sonst verschwände es auch bei einem Fehler
  // und die Eingabe wäre weg.
  await expect(notizen(page).getByRole('button', { name: 'Speichern' })).toHaveCount(0)
  await expect(notizen(page).getByText('Beantwortet: höhere Tagessätze.')).toBeVisible()

  await notizen(page).getByRole('article').getByRole('button', { name: 'Löschen' }).click()
  await expect(notizen(page).getByText('Noch keine Notizen')).toBeVisible()
})

test('eine leere Notiz wird abgelehnt, ohne die Eingabe zu verwerfen', async ({ page }) => {
  await notebookMitQuelle(page)

  await notizen(page).getByRole('button', { name: 'Notiz schreiben' }).click()
  await notizen(page).getByLabel('Titel').fill('   ')
  await notizen(page).getByLabel('Inhalt').fill('Inhalt steht da')
  await notizen(page).getByRole('button', { name: 'Notiz anlegen' }).click()

  // Die Meldung kommt vom Server, nicht vom Browser: `required` allein ließe
  // einen Titel aus lauter Leerzeichen durch.
  await expect(notizen(page).getByText('Die Notiz braucht einen Titel.')).toBeVisible()
  // Und der eingegebene Inhalt steht noch da.
  await expect(notizen(page).getByLabel('Inhalt')).toHaveValue('Inhalt steht da')
})

test('fremde Notizen sind nicht erreichbar', async ({ page, browser }) => {
  await notebookMitQuelle(page)
  await notizen(page).getByRole('button', { name: 'Notiz schreiben' }).click()
  await notizen(page).getByLabel('Titel').fill('Geheime Notiz')
  await notizen(page).getByLabel('Inhalt').fill('Nur für mich')
  await notizen(page).getByRole('button', { name: 'Notiz anlegen' }).click()
  await expect(
    notizen(page).getByRole('article').filter({ hasText: 'Geheime Notiz' })
  ).toBeVisible()

  const notebookUrl = page.url()

  const kontext = await browser.newContext()
  const mallory = await kontext.newPage()
  await mallory.goto('/registrieren')
  await mallory.getByLabel('E-Mail-Adresse').fill(uniqueEmail('mallory-notiz'))
  await mallory.getByLabel('Passwort').fill(PASSWORD)
  await mallory.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(mallory).toHaveURL(/\/app$/)

  // 404 und nicht 403: ein 403 bestätigte, dass es dieses Notebook gibt.
  const antwort = await mallory.goto(notebookUrl)
  expect(antwort?.status()).toBe(404)
  await expect(mallory.getByText('Geheime Notiz')).toHaveCount(0)

  await kontext.close()
})
