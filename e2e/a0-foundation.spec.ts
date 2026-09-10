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

test('die selbst gehostete Schrift wird tatsächlich geladen', async ({ page }) => {
  await page.goto('/')

  const fontState = await page.getByRole('heading', { level: 1 }).evaluate(async (el) => {
    // Erst abwarten, bis der Browser mit dem Laden aller Schriften fertig ist.
    // Ohne das prüft man einen Zwischenstand.
    await document.fonts.ready

    const firstFamily = getComputedStyle(el)
      .fontFamily.split(',')[0]!
      .trim()
      .replace(/^["']|["']$/g, '')

    // Nicht document.fonts.check() verwenden. Die Methode liefert auch für
    // eine frei erfundene Familie `true`, weil der Browser auf eine
    // Systemschrift zurückfällt und die als verfügbar gilt — nachgemessen.
    // Aussagekräftig ist nur das FontFaceSet selbst: darin steht ausschließlich,
    // was per @font-face wirklich deklariert wurde, also das, was next/font
    // erzeugt hat.
    const faces = [...document.fonts].map((f) => ({
      family: f.family.replace(/^["']|["']$/g, ''),
      status: f.status
    }))

    return { firstFamily, faces }
  })

  // Die Überschrift muss mit unserer Schrift gesetzt sein, nicht mit einer
  // System-Schrift aus dem Fallback-Stack.
  expect(fontState.firstFamily).toBe('Plus Jakarta Sans')

  const matching = fontState.faces.filter((f) => f.family === fontState.firstFamily)
  expect(
    matching.length,
    `Keine @font-face-Deklaration für "${fontState.firstFamily}". Vorhanden: ${JSON.stringify(fontState.faces)}`
  ).toBeGreaterThan(0)

  // Mindestens eine, nicht alle: next/font deklariert mehrere Schnitte, und
  // der Browser lädt nur die, die auf dieser Seite tatsächlich gebraucht
  // werden. Die übrigen stehen dauerhaft auf "unloaded" — das ist kein Fehler,
  // sondern der Sinn der Sache.
  expect(
    matching.some((f) => f.status === 'loaded'),
    `Kein Schnitt von "${fontState.firstFamily}" geladen: ${JSON.stringify(matching)}`
  ).toBe(true)
})
