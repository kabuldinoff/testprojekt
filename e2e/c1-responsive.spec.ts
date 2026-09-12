import { expect, test, type Page } from '@playwright/test'

import { uniqueEmail } from './lib/supabase'

/**
 * c1 — derselbe Arbeitsbereich auf drei Breiten.
 *
 * Geprüft wird nicht, wie es aussieht, sondern was passiert: Was ist
 * erreichbar, was weicht, und **überlebt der Zustand einen Wechsel**. Die
 * letzte Frage ist die wichtigste — sie entscheidet darüber, ob die
 * Umschaltung eine Ansicht wechselt oder Arbeit vernichtet.
 *
 * Die Breiten stammen aus `design/canvas.html`: ab 1280px drei Spalten,
 * 768–1279px der Chat plus höchstens ein Seitenpanel, darunter ein Bereich
 * zur Zeit.
 */

const PASSWORD = 'test-passwort-1234'

const DESKTOP = { width: 1440, height: 900 }
const TABLET = { width: 900, height: 800 }
const MOBIL = { width: 390, height: 844 }

const quellen = (page: Page) => page.getByRole('region', { name: 'Quellen' })
const chat = (page: Page) => page.getByRole('region', { name: 'Chat' })
const studio = (page: Page) => page.getByRole('region', { name: 'Studio' })
const umschalter = (page: Page) => page.getByRole('group', { name: 'Bereich auswählen' })

async function notebookMitQuelle(page: Page) {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('responsive'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Breiten-Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)

  // Unterhalb von 1280px ist die Quellenspalte zunächst verborgen — der Chat
  // ist die Voreinstellung. Zum Anlegen einer Quelle muss der Test dorthin
  // wechseln, genau wie ein Mensch es täte.
  if (await umschalter(page).isVisible()) {
    await umschalter(page).getByRole('button', { name: 'Quellen' }).click()
  }

  const panel = page.getByRole('region', { name: 'Quelle hinzufügen' })
  await panel.getByRole('tab', { name: 'Text' }).click()
  await panel.getByLabel('Titel').fill('Quartalsbericht')
  await panel.getByLabel('Inhalt').fill('Die Marge stieg von 18,2 auf 21,4 Prozent. '.repeat(20))
  await panel.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Quartalsbericht' })).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 30_000 }
  )

  // Zurück in den Ausgangszustand, damit jeder Test mit derselben Lage
  // beginnt und nicht mit der, die das Anlegen hinterlassen hat.
  if (await umschalter(page).isVisible()) {
    await umschalter(page).getByRole('button', { name: 'Chat' }).click()
  }
}

test('auf Desktop stehen alle drei Bereiche nebeneinander', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await notebookMitQuelle(page)

  await expect(quellen(page)).toBeVisible()
  await expect(chat(page)).toBeVisible()
  await expect(studio(page)).toBeVisible()

  // Die Umschaltleiste ist da, aber nicht dargestellt — es gibt nichts
  // umzuschalten. Sie bleibt im Baum, damit beim Verkleinern des Fensters
  // kein Element neu entsteht.
  await expect(umschalter(page)).toBeHidden()

  // Nebeneinander, nicht untereinander: Die Quellenspalte endet links vom
  // Chat. Ohne diese Prüfung bestünde der Test auch bei gestapelten Spalten.
  const q = (await quellen(page).boundingBox())!
  const c = (await chat(page).boundingBox())!
  const s = (await studio(page).boundingBox())!
  expect(q.x + q.width).toBeLessThanOrEqual(c.x + 1)
  expect(c.x + c.width).toBeLessThanOrEqual(s.x + 1)
})

test('auf Tablet bleibt der Chat stehen, die Seiten wechseln sich ab', async ({ page }) => {
  await page.setViewportSize(TABLET)
  await notebookMitQuelle(page)

  // Voreinstellung: nur der Chat. Er ist der Grund, warum jemand das Notebook
  // geöffnet hat.
  await expect(chat(page)).toBeVisible()
  await expect(quellen(page)).toBeHidden()
  await expect(studio(page)).toBeHidden()

  await umschalter(page).getByRole('button', { name: 'Quellen' }).click()
  await expect(quellen(page)).toBeVisible()
  await expect(chat(page)).toBeVisible()
  await expect(studio(page)).toBeHidden()

  await umschalter(page).getByRole('button', { name: 'Studio' }).click()
  await expect(studio(page)).toBeVisible()
  await expect(chat(page)).toBeVisible()
  await expect(quellen(page)).toBeHidden()
})

test('auf Mobil ist der Chat die Voreinstellung und es steht einer zur Zeit', async ({ page }) => {
  await page.setViewportSize(MOBIL)
  await notebookMitQuelle(page)

  await expect(chat(page)).toBeVisible()
  await expect(quellen(page)).toBeHidden()
  await expect(studio(page)).toBeHidden()

  // Der gedrückte Knopf sagt es auch ohne Farbe — `aria-pressed` ist das,
  // was ein Screenreader vorliest.
  await expect(umschalter(page).getByRole('button', { name: 'Chat' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  await umschalter(page).getByRole('button', { name: 'Quellen' }).click()
  await expect(quellen(page)).toBeVisible()
  await expect(chat(page)).toBeHidden()
})

test('ein Wechsel verliert das laufende Gespräch nicht', async ({ page }) => {
  // Die eigentliche Zusicherung dieser Scheibe. Würde beim Umschalten ein
  // Bereich aus dem Baum fliegen statt nur unsichtbar zu werden, wäre die
  // Antwort beim Zurückwechseln weg — `useChat` hält seinen Zustand im Hook,
  // nicht auf dem Server. Auf dem Telefon wäre das der häufigste Handgriff:
  // nachsehen, welche Quellen ausgewählt sind, und weiterfragen.
  await page.setViewportSize(MOBIL)
  await notebookMitQuelle(page)

  await chat(page).getByLabel('Frage an die ausgewählten Quellen').fill('Wie war die Marge?')
  await chat(page).getByRole('button', { name: 'Fragen' }).click()
  await expect(chat(page).getByRole('button', { name: /^Beleg 1/ })).toBeVisible({
    timeout: 30_000
  })

  await umschalter(page).getByRole('button', { name: 'Quellen' }).click()
  await expect(quellen(page)).toBeVisible()

  await umschalter(page).getByRole('button', { name: 'Chat' }).click()
  await expect(chat(page).getByRole('button', { name: /^Beleg 1/ })).toBeVisible()
  await expect(chat(page).getByText('Wie war die Marge?')).toBeVisible()
})

test('keine Breite erzeugt seitliches Scrollen', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await notebookMitQuelle(page)

  for (const [name, groesse] of [
    ['Desktop', DESKTOP],
    ['Tablet', TABLET],
    ['Mobil', MOBIL]
  ] as const) {
    await page.setViewportSize(groesse)
    // Waagerechtes Scrollen ist auf einer Arbeitsfläche immer ein Fehler: Es
    // versteckt Inhalt hinter einer Geste, die niemand vermutet.
    const scrollt = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
    expect(scrollt, `${name} scrollt waagerecht`).toBe(false)
  }
})
