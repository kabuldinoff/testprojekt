import { expect, test } from '@playwright/test'

import { asUser, createUser, type TestUser } from './lib/supabase'

/**
 * a2 — Mandantentrennung.
 *
 * Der wichtigste Test des Projekts. Er geht bewusst an der Oberfläche vorbei
 * und spricht PostgREST direkt an, mit einem gültigen Token des zweiten
 * Nutzers — genau das, was jemand täte, der es darauf anlegt. Ein Test, der
 * nur klickt, zeigt lediglich, dass die Oberfläche nichts anzeigt.
 *
 * Geprüft wird nicht nur Lesen: eine fehlende UPDATE- oder DELETE-Policy fällt
 * beim Lesen nicht auf, ist aber genauso schlimm.
 */

let alice: TestUser
let mallory: TestUser
let aliceNotebookId: string

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext()

  alice = await createUser(request, 'alice')
  mallory = await createUser(request, 'mallory')

  const created = await asUser(request, alice).post('notebooks', {
    owner_id: alice.userId,
    title: 'Alices vertrauliche Recherche'
  })
  expect(created.ok(), await created.text()).toBe(true)

  const rows = (await created.json()) as Array<{ id: string }>
  aliceNotebookId = rows[0]!.id

  await request.dispose()
})

test('Alice sieht ihr eigenes Notebook', async ({ request }) => {
  const response = await asUser(request, alice).get(`notebooks?id=eq.${aliceNotebookId}`)
  expect(response.ok()).toBe(true)
  expect((await response.json()) as unknown[]).toHaveLength(1)
})

test('Mallory sieht Alices Notebook nicht — auch nicht mit gültigem Token', async ({ request }) => {
  // Wichtig: die Antwort ist 200 mit leerer Liste, kein 403. RLS filtert
  // Zeilen weg, statt Zugriff zu verweigern — und das ist gewollt. Ein 403
  // würde bestätigen, dass die Zeile existiert.
  const response = await asUser(request, mallory).get(`notebooks?id=eq.${aliceNotebookId}`)
  expect(response.status()).toBe(200)
  expect((await response.json()) as unknown[]).toEqual([])
})

test('Mallory sieht auch ohne Filter nichts von Alice', async ({ request }) => {
  const response = await asUser(request, mallory).get('notebooks?select=id')
  expect(response.ok()).toBe(true)
  const rows = (await response.json()) as Array<{ id: string }>
  expect(rows.map((r) => r.id)).not.toContain(aliceNotebookId)
})

test('Mallory kann Alices Notebook nicht ändern', async ({ request }) => {
  const response = await asUser(request, mallory).patch(`notebooks?id=eq.${aliceNotebookId}`, {
    title: 'übernommen'
  })
  // Kein Fehler, aber auch keine geänderte Zeile: die Policy lässt sie nicht
  // ins Ergebnis. Genau deshalb wird hier der Rumpf geprüft und nicht nur der
  // Status — eine fehlende UPDATE-Policy sähe von außen identisch aus wie ein
  // erfolgloser Treffer.
  expect((await response.json()) as unknown[]).toEqual([])

  const check = await asUser(request, alice).get(`notebooks?id=eq.${aliceNotebookId}&select=title`)
  const rows = (await check.json()) as Array<{ title: string }>
  expect(rows[0]?.title).toBe('Alices vertrauliche Recherche')
})

test('Mallory kann Alices Notebook nicht löschen', async ({ request }) => {
  await asUser(request, mallory).delete(`notebooks?id=eq.${aliceNotebookId}`)

  const check = await asUser(request, alice).get(`notebooks?id=eq.${aliceNotebookId}`)
  expect((await check.json()) as unknown[]).toHaveLength(1)
})

test('Mallory kann kein Notebook in Alices Namen anlegen', async ({ request }) => {
  // Ohne die with-check-Klausel der INSERT-Policy ginge das durch: using
  // greift beim Einfügen nicht, weil es noch keine alte Zeile gibt.
  const response = await asUser(request, mallory).post('notebooks', {
    owner_id: alice.userId,
    title: 'untergeschoben'
  })
  expect(response.ok()).toBe(false)
  expect(response.status()).toBe(403)
})

test('Mallory sieht Alices Profil nicht', async ({ request }) => {
  const response = await asUser(request, mallory).get(`profiles?id=eq.${alice.userId}`)
  expect(response.status()).toBe(200)
  expect((await response.json()) as unknown[]).toEqual([])
})

test('für Unangemeldete existiert die Tabelle nicht einmal', async ({ request }) => {
  const anonymous = {
    ...mallory,
    accessToken: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  }
  const response = await asUser(request, anonymous).get('notebooks?select=id')

  // 401 und "permission denied", nicht etwa eine leere Liste. Das ist die
  // Folge davon, dass das Projekt ohne "automatically expose new tables"
  // angelegt wurde: die anon-Rolle hat auf notebooks gar kein grant, die
  // Tabelle ist für sie nicht vorhanden.
  //
  // Der Unterschied ist wichtig: eine leere Liste hieße "RLS hat gefiltert",
  // hier greift schon die Ebene davor. RLS ist damit das zweite Netz, nicht
  // das einzige.
  expect(response.status()).toBe(401)
  const body = (await response.json()) as { code?: string; message?: string }
  expect(body.code).toBe('42501')
  expect(body.message).toContain('permission denied')
})

test('die heartbeat-Tabelle ist bewusst offen — und enthält nur einen Zeitstempel', async ({
  request
}) => {
  const anonymous = {
    ...mallory,
    accessToken: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  }
  // Die Gegenprobe zum Test darüber: hier ist der Zugriff für anon gewollt,
  // weil der Keepalive-Lauf aus GitHub Actions kein Konto hat. Sie zeigt, dass
  // die Sperre oben eine Entscheidung ist und kein Zufall.
  const response = await asUser(request, anonymous).get('heartbeat?select=at')
  expect(response.status()).toBe(200)
  expect((await response.json()) as unknown[]).toHaveLength(1)
})
