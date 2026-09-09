import { expect, test } from '@playwright/test'

/**
 * a0 — Fundament. Prüft genau das, was ein Unit-Test nicht kann: dass die
 * Tokens im gebauten Bundle tatsächlich ankommen und der Umschalter im echten
 * Browser umschaltet.
 */

const CANVAS_DARK = 'rgb(14, 20, 36)' // --canvas dark  = #0E1424
const CANVAS_LIGHT = 'rgb(247, 244, 238)' // --canvas light = #F7F4EE

const bodyBackground = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test('startet in Dark, ohne dass vorher Light aufblitzt', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await bodyBackground(page)).toBe(CANVAS_DARK)
})

test('der Umschalter wechselt in beide Richtungen', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Design umschalten' })

  await toggle.click()
  await expect(page.locator('html')).toHaveClass(/light/)
  expect(await bodyBackground(page)).toBe(CANVAS_LIGHT)

  await toggle.click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await bodyBackground(page)).toBe(CANVAS_DARK)
})

test('im Dark Mode ist genau ein Symbol sichtbar, im Light Mode das andere', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Design umschalten' })

  // Beide Symbole stehen immer im Markup — sichtbar ist nur eines. Genau das
  // erlaubt identisches Server- und Client-Rendering ohne mounted-Flag.
  await expect(toggle.locator('.only-dark')).toBeVisible()
  await expect(toggle.locator('.only-light')).toBeHidden()

  await toggle.click()
  await expect(toggle.locator('.only-light')).toBeVisible()
  await expect(toggle.locator('.only-dark')).toBeHidden()
})

test('die Wahl überlebt einen Reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Design umschalten' }).click()
  await expect(page.locator('html')).toHaveClass(/light/)

  await page.reload()
  // Kein Blitz und kein Zurückspringen: next-themes setzt die Klasse per
  // Inline-Script, bevor React überhaupt hydriert.
  await expect(page.locator('html')).toHaveClass(/light/)
  expect(await bodyBackground(page)).toBe(CANVAS_LIGHT)
})

test('die selbst gehosteten Schriften kommen an', async ({ page }) => {
  await page.goto('/')
  const family = await page
    .getByRole('heading', { level: 1 })
    .evaluate((el) => getComputedStyle(el).fontFamily)
  // next/font vergibt gehashte Namen, deshalb auf den Fallback-Stack prüfen
  // statt auf "Plus Jakarta Sans": entscheidend ist, dass --font-sans greift
  // und nicht die nackte System-Schrift gerendert wird.
  expect(family).toContain('ui-sans-serif')
})
