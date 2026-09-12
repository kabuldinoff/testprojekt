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
const klapper = (page: Page) => page.getByRole('group', { name: 'Spalten einklappen' })

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

test('auf Desktop lassen sich die Seitenspalten einklappen', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await notebookMitQuelle(page)

  const vorher = (await chat(page).boundingBox())!.width

  await klapper(page).getByRole('button', { name: 'Quellenspalte einklappen' }).click()
  await expect(quellen(page)).toBeHidden()
  await expect(chat(page)).toBeVisible()

  await klapper(page).getByRole('button', { name: 'Studiospalte einklappen' }).click()
  await expect(studio(page)).toBeHidden()

  // Der Punkt der Übung: Der frei gewordene Platz geht an den Chat. Ohne
  // diese Zusicherung wäre „eingeklappt" auch dann erfüllt, wenn die Spalte
  // bloß unsichtbar würde und ihre Breite als Lücke stehen bliebe.
  expect((await chat(page).boundingBox())!.width).toBeGreaterThan(vorher)

  // Und zurück. Ein Knopf, der nur in eine Richtung funktioniert, ist eine
  // Sackgasse — sein Name sagt nach dem Klick „ausklappen", und das muss
  // stimmen.
  await klapper(page).getByRole('button', { name: 'Quellenspalte ausklappen' }).click()
  await klapper(page).getByRole('button', { name: 'Studiospalte ausklappen' }).click()
  await expect(quellen(page)).toBeVisible()
  await expect(studio(page)).toBeVisible()
  expect((await chat(page).boundingBox())!.width).toBe(vorher)
})

test('unterhalb von 1280px gibt es die Klappknöpfe nicht', async ({ page }) => {
  // Zwei Bedienelemente für dieselbe Frage wären ein Widerspruch: Die
  // Umschaltleiste bestimmt dort, welcher Bereich sichtbar ist. Ein
  // eingeklappter Zustand, der einen von der Leiste als aktiv angezeigten
  // Bereich versteckt, wäre ein Zustand ohne Ausweg.
  await page.setViewportSize(TABLET)
  await notebookMitQuelle(page)

  await expect(klapper(page)).toBeHidden()
  await expect(umschalter(page)).toBeVisible()
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
    await page.waitForTimeout(200)

    // Waagerechtes Scrollen ist auf einer Arbeitsfläche immer ein Fehler: Es
    // versteckt Inhalt hinter einer Geste, die niemand vermutet.
    //
    // Geprüft wird das Dokument **und jeder eigene Scrollbereich**. Die
    // Spalten scrollen für sich, und `.workspace-spalten` schneidet
    // Überstehendes mit `overflow: hidden` ab — ein zu breiter Inhalt fiele
    // dort also lautlos weg, ohne dass das Dokument je breiter würde. Genau
    // deshalb reicht die Prüfung am Dokumentwurzelelement nicht.
    const ueberlauf = await page.evaluate(() => {
      const stellen: string[] = []
      if (document.documentElement.scrollWidth > window.innerWidth) stellen.push('Dokument')
      for (const el of document.querySelectorAll<HTMLElement>(
        '.workspace-spalten, .workspace-seite, .workspace-mitte'
      )) {
        if (el.scrollWidth > el.clientWidth + 1) {
          stellen.push(el.className + ` (${el.scrollWidth} > ${el.clientWidth})`)
        }
      }
      return stellen
    })

    expect(ueberlauf, `${name} läuft waagerecht über`).toEqual([])
  }
})
