import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { GRENZEN } from '../src/lib/rate-limit/limits'
import { PUBLISHABLE_KEY, SUPABASE_URL, uniqueEmail } from './lib/supabase'

/**
 * c3 — Drosselung teurer Vorgänge.
 *
 * ── Warum die Grenze nicht durch Wiederholen erreicht wird ────────────────
 *
 * Vierzig Fragen zu stellen, um die einundvierzigste geblockt zu sehen, wäre
 * ein Test von mehreren Minuten, der bei jeder Änderung an den Zahlen länger
 * wird. Stattdessen wird das Kontingent **vorab über dieselbe
 * Datenbankfunktion verbraucht**, die auch die Route benutzt, und danach ein
 * einziger echter Vorgang versucht.
 *
 * Der Test prüft damit genau das, was ihn interessiert: Ist die Route
 * verdrahtet, und sieht der Nutzer, was los ist. Dass die Funktion richtig
 * zählt, ist in `src/lib/__tests__/rate-limit.test.ts` und an der Datenbank
 * selbst geprüft.
 *
 * ── Warum zwei Sitzungen für denselben Nutzer ────────────────────────────
 *
 * Die Oberfläche arbeitet mit einem Cookie, das `@supabase/ssr` serverseitig
 * setzt; an das Token kommt der Test nicht heran. Er meldet sich deshalb
 * **zusätzlich** über die Auth-API an und bekommt ein Bearer-Token für
 * dieselbe Kennung. Beide Sitzungen zeigen auf denselben Nutzer, und der Topf
 * hängt am Nutzer — nicht an der Sitzung.
 */

const PASSWORD = 'test-passwort-1234'

/**
 * Verbraucht das Kontingent eines Topfes bis zur Grenze.
 *
 * Ruft dieselbe Funktion auf, die auch die Route aufruft — und zwar als der
 * Nutzer, denn sie liest die Kennung aus dem Token. Mit einem Secret Key wäre
 * `auth.uid()` null und es würde gar nichts gezählt.
 */
async function kontingentLeeren(
  request: APIRequestContext,
  token: string,
  topf: keyof typeof GRENZEN
) {
  const grenze = GRENZEN[topf]
  for (let i = 0; i < grenze.limit; i++) {
    const antwort = await request.post(`${SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`, {
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: { p_bucket: topf, p_limit: grenze.limit, p_window: grenze.window }
    })
    expect(antwort.ok(), await antwort.text()).toBe(true)
  }
}

/** Registriert in der Oberfläche und holt zusätzlich ein Token für dieselbe Kennung. */
async function nutzerMitToken(page: Page, request: APIRequestContext) {
  const email = uniqueEmail('drossel')

  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  const anmeldung = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    data: { email, password: PASSWORD }
  })
  expect(anmeldung.ok(), await anmeldung.text()).toBe(true)
  return ((await anmeldung.json()) as { access_token: string }).access_token
}

async function notebookAnlegen(page: Page, titel = 'Drossel-Notebook') {
  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill(titel)
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop()!
}

test('eine erschöpfte Chat-Grenze bleibt nicht stumm', async ({ page, request }) => {
  const token = await nutzerMitToken(page, request)
  const notebookId = await notebookAnlegen(page)

  await kontingentLeeren(request, token, 'chat')

  // Direkt gegen die Route, weil hier die Zusicherung liegt: Kein
  // Anbieter-Aufruf, sondern 429.
  const antwort = await page.request.post('/api/chat', {
    data: { notebookId, question: 'Wie war die Marge?', sourceIds: null }
  })

  expect(antwort.status()).toBe(429)
  // 429 und nicht 403: Der Zugriff ist nicht verboten, er ist **jetzt** nicht
  // möglich. Ein Client, der beides unterscheidet, versucht es später erneut.
  expect((await antwort.json()) as { message: string }).toMatchObject({
    message: GRENZEN.chat.message
  })
})

test('die Grenze fürs Anlegen von Quellen greift über alle Notebooks', async ({
  page,
  request
}) => {
  // Der Trigger in der Datenbank deckelt ein Notebook bei zwanzig Quellen.
  // Diese Grenze ist die andere Hälfte: Sie fängt den Fall ab, den der Trigger
  // nicht sieht — viele Notebooks mit je wenigen Quellen.
  const token = await nutzerMitToken(page, request)
  const notebookId = await notebookAnlegen(page, 'Erstes Notebook')

  await kontingentLeeren(request, token, 'ingest')

  const antwort = await page.request.post('/api/sources', {
    data: { notebookId, kind: 'paste', title: 'Eine weitere', content: 'x'.repeat(200) }
  })

  expect(antwort.status()).toBe(429)
  expect((await antwort.json()) as { error: string }).toMatchObject({
    error: GRENZEN.ingest.message
  })
})

test('der Audio-Topf zählt über den Tag, nicht über die Stunde', async ({ page, request }) => {
  // Der knappste Topf: Das Tageskontingent der Sprachausgabe zeigt sich erst
  // als 429 vom Anbieter und ist dann für den Rest des Tages weg. Eine
  // Stundengrenze schützte davor nicht.
  expect(GRENZEN.audio.window).toContain('hours')
  expect(GRENZEN.audio.limit).toBeLessThan(GRENZEN.chat.limit)

  const token = await nutzerMitToken(page, request)
  const notebookId = await notebookAnlegen(page)

  await kontingentLeeren(request, token, 'audio')

  const antwort = await page.request.post('/api/studio/audio', { data: { notebookId } })

  expect(antwort.status()).toBe(429)
  expect((await antwort.json()) as { message: string }).toMatchObject({
    message: GRENZEN.audio.message
  })
})

test('ein unverbrauchtes Kontingent lässt den Vorgang durch', async ({ page, request }) => {
  // Die Gegenprobe. Ohne sie bliebe der Test grün, wenn die Route **immer**
  // 429 antwortete — und das wäre der schlimmere Fehler von beiden.
  const token = await nutzerMitToken(page, request)
  const notebookId = await notebookAnlegen(page)

  // Nur ein Vorgang verbraucht, nicht das ganze Kontingent.
  await request.post(`${SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`, {
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: { p_bucket: 'ingest', p_limit: GRENZEN.ingest.limit, p_window: GRENZEN.ingest.window }
  })

  const antwort = await page.request.post('/api/sources', {
    data: { notebookId, kind: 'paste', title: 'Geht noch', content: 'x'.repeat(200) }
  })

  expect(antwort.status()).toBe(200)
})

test('die Töpfe zweier Nutzer sind unabhängig', async ({ page, browser, request }) => {
  // Ohne diese Zusicherung könnte ein einzelner Gast die Anwendung für alle
  // sperren — bei offener Registrierung wäre das eine Einladung.
  const tokenA = await nutzerMitToken(page, request)
  const notebookA = await notebookAnlegen(page, 'Notebook A')
  await kontingentLeeren(request, tokenA, 'ingest')

  const gesperrt = await page.request.post('/api/sources', {
    data: { notebookId: notebookA, kind: 'paste', title: 'blockiert', content: 'x'.repeat(200) }
  })
  expect(gesperrt.status()).toBe(429)

  const kontext = await browser.newContext()
  const zweite = await kontext.newPage()
  await nutzerMitToken(zweite, request)
  const notebookB = await notebookAnlegen(zweite, 'Notebook B')

  const durch = await zweite.request.post('/api/sources', {
    data: { notebookId: notebookB, kind: 'paste', title: 'geht', content: 'x'.repeat(200) }
  })
  expect(durch.status(), 'der zweite Nutzer ist mitgesperrt worden').toBe(200)

  await kontext.close()
})
