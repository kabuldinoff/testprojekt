import { expect, test } from '@playwright/test'

import { uniqueEmail } from './lib/supabase'

/**
 * d1 — die öffentliche Seite und ihre Beiwerke.
 *
 * Alles hier ist Zeug, das **still** kaputtgeht: Eine Sitemap, die eine
 * `noindex`-Seite nennt, ein fehlendes JSON-LD, ein Arbeitsbereich, der
 * plötzlich indexierbar ist. Nichts davon fällt beim Benutzen auf — man sieht
 * es erst in einem Suchergebnis, Wochen später.
 *
 * Die Lighthouse-Werte prüft `pnpm lighthouse` mit einer Schwelle von 90; das
 * hier prüft die Aussagen, die Lighthouse nicht kennt.
 */

test('die Startseite trägt Überschrift, Einstiege und strukturierte Daten', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deine Quellen')
  await expect(page.getByRole('link', { name: 'Kostenlos starten' }).first()).toHaveAttribute(
    'href',
    '/registrieren'
  )

  // Strukturierte Daten: nicht nur vorhanden, sondern gültiges JSON mit dem
  // Typ, auf den sich die Angaben beziehen.
  const roh = await page.locator('script[type="application/ld+json"]').innerText()
  const daten = JSON.parse(roh) as { '@type': string; name: string; url: string }
  expect(daten['@type']).toBe('SoftwareApplication')
  expect(daten.name).toBe('Notabene')
  expect(daten.url).toMatch(/^https?:\/\//)

  // Die Vorschau-Angaben für geteilte Links. Ohne sie erscheint im Chat nur
  // die nackte Adresse.
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Notabene/)
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1)
})

test('der Datenfluss-Text auf der Startseite stammt aus derselben Quelle wie in der App', async ({
  page
}) => {
  // Die Zusage auf der Startseite und die neben der Anbieterwahl müssen
  // dieselbe sein. Zwei gepflegte Fassungen wären zwei Gelegenheiten, dem
  // Nutzer etwas anderes zu versprechen, als das Produkt tut.
  await page.goto('/')
  await expect(page.getByText(/Vollständig in der EU/)).toBeVisible()
  await expect(page.getByText(/Google nutzt Daten aus dem kostenlosen Kontingent/)).toBeVisible()
})

test('robots.txt hält Crawler aus dem Arbeitsbereich', async ({ request }) => {
  const antwort = await request.get('/robots.txt')
  expect(antwort.ok()).toBe(true)

  const text = await antwort.text()
  expect(text).toContain('Disallow: /app/')
  expect(text).toContain('Disallow: /api/')
  expect(text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/)
})

test('die Sitemap nennt nur, was auch indexiert werden soll', async ({ request }) => {
  const antwort = await request.get('/sitemap.xml')
  expect(antwort.ok()).toBe(true)

  const xml = await antwort.text()
  const adressen = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)

  // Genau eine. Die Anmelde- und Registrierseiten tragen `noindex`; sie in
  // der Sitemap zu nennen wäre ein Widerspruch mit sich selbst — und stand
  // im ersten Entwurf genau so drin.
  expect(adressen).toHaveLength(1)
  expect(adressen[0]).not.toMatch(/\/(anmelden|registrieren|app)/)
})

test('llms.txt beschreibt das Produkt und enthält keine Anweisungen', async ({ request }) => {
  const antwort = await request.get('/llms.txt')
  expect(antwort.ok()).toBe(true)
  expect(antwort.headers()['content-type']).toContain('text/plain')

  const text = await antwort.text()
  expect(text).toContain('# Notabene')
  expect(text).toContain('/anmelden')

  // Diese Datei ist eine Beschreibung, keine Aufforderung. Wer einem
  // lesenden Modell hier Anweisungen mitgibt, baut genau die Schwachstelle,
  // gegen die dieses Projekt an anderer Stelle absichert.
  expect(text).not.toMatch(/ignoriere|ignore all|du musst|you must/i)
})

test('der Arbeitsbereich ist vom Index ausgenommen — auch angemeldet', async ({ page }) => {
  // Ohne Anmeldung landet man auf /anmelden, und auch die darf nicht in den
  // Index: sie bringt keinem Suchenden etwas und verwässert, wofür die
  // Startseite gefunden werden soll.
  await page.goto('/app')
  await expect(page).toHaveURL(/\/anmelden/)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

  // Und jetzt die Seite, um die es eigentlich geht.
  //
  // Die erste Fassung endete hier oben — sie prüfte damit ausschließlich die
  // Anmeldeseite. Fiele das `noindex` im /app-Layout weg, bliebe die
  // Umleitung bestehen und der Test grün, während der Arbeitsbereich
  // indexierbar wäre. Ein Test, der genau die Zusage nicht prüft, die er im
  // Namen trägt.
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('seo'))
  await page.getByLabel('Passwort').fill('test-passwort-1234')
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('das Vorschaubild wird unter einer absoluten Adresse ausgeliefert', async ({
  request,
  baseURL
}) => {
  const seite = await request.get('/')
  const html = await seite.text()
  const treffer = /<meta property="og:image" content="([^"]+)"/.exec(html)
  expect(treffer, 'og:image fehlt im Kopf').not.toBeNull()

  // Absolut, nicht relativ: Diese Adresse wird von fremden Servern gelesen —
  // Slack, LinkedIn, Suchmaschinen —, und ein `/opengraph-image` ohne Host
  // zeigt für die auf sich selbst. Das leistet `metadataBase`.
  const adresse = treffer![1]!
  expect(adresse).toMatch(/^https?:\/\//)
  expect(adresse.startsWith(baseURL!)).toBe(true)

  // Und sie liefert wirklich ein Bild. Die Form allein bewiese das nicht.
  const bild = await request.get(adresse)
  expect(bild.ok()).toBe(true)
  expect(bild.headers()['content-type']).toContain('image/png')
})
