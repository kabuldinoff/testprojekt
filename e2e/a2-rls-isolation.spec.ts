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
let aliceNoteId: string

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

  // Eine Notiz dazu. `notes` ist die einzige Tabelle mit Policies für alle
  // vier Operationen — und damit die einzige, bei der ein Fehler in genau
  // einer davon durch die anderen drei verdeckt würde.
  const note = await asUser(request, alice).post('notes', {
    notebook_id: aliceNotebookId,
    title: 'Alices Notiz',
    content: 'Vertraulich.'
  })
  expect(note.ok(), await note.text()).toBe(true)
  aliceNoteId = ((await note.json()) as Array<{ id: string }>)[0]!.id

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
  const response = await asUser(request, mallory).delete(`notebooks?id=eq.${aliceNotebookId}`)

  // Den Status mitprüfen, nicht nur das Überleben der Zeile: liefe der
  // Endpunkt in einen 500, bliebe die Zeile ebenfalls stehen — der Test wäre
  // grün und hätte über RLS nichts ausgesagt.
  expect(response.status(), await response.text()).toBe(204)

  const check = await asUser(request, alice).get(`notebooks?id=eq.${aliceNotebookId}`)
  expect((await check.json()) as unknown[]).toHaveLength(1)
})

test('Alice kann ihr eigenes Notebook löschen — die Gegenprobe', async ({ request }) => {
  // Ohne diese Gegenprobe wäre der Test darüber auch dann grün, wenn Löschen
  // für alle gesperrt ist. Dann hätte er nicht Mandantentrennung gezeigt,
  // sondern eine fehlende Policy.
  const created = await asUser(request, alice).post('notebooks', {
    owner_id: alice.userId,
    title: 'Zum Löschen'
  })
  const [row] = (await created.json()) as Array<{ id: string }>

  const response = await asUser(request, alice).delete(`notebooks?id=eq.${row!.id}`)
  expect(response.status()).toBe(204)

  const check = await asUser(request, alice).get(`notebooks?id=eq.${row!.id}`)
  expect((await check.json()) as unknown[]).toEqual([])
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

test('Mallory sieht Alices Notizen nicht', async ({ request }) => {
  const response = await asUser(request, mallory).get(`notes?id=eq.${aliceNoteId}`)
  expect(response.status()).toBe(200)
  expect((await response.json()) as unknown[]).toEqual([])
})

test('Mallory kann Alices Notiz nicht ändern', async ({ request }) => {
  // Der Weg, den die UPDATE-Policy zu verhindern hat. Ohne sie stünde in
  // Alices Notiz plötzlich fremder Text — und sie hielte ihn für ihren eigenen.
  const response = await asUser(request, mallory).patch(`notes?id=eq.${aliceNoteId}`, {
    content: 'Von Mallory überschrieben.'
  })
  expect(response.status()).toBe(200)
  expect((await response.json()) as unknown[]).toEqual([])

  const nachher = await asUser(request, alice).get(`notes?id=eq.${aliceNoteId}&select=content`)
  expect(((await nachher.json()) as Array<{ content: string }>)[0]!.content).toBe('Vertraulich.')
})

test('Mallory kann Alices Notiz nicht in ihr eigenes Notebook verschieben', async ({ request }) => {
  // Genau dafür trägt die UPDATE-Policy neben `using` auch `with check`: das
  // erste prüft die Zeile, wie sie ist, das zweite die Zeile, wie sie danach
  // wäre. Ohne das zweite verschwände die Notiz beim Besitzer und tauchte
  // woanders auf.
  const eigenes = await asUser(request, mallory).post('notebooks', {
    owner_id: mallory.userId,
    title: 'Mallorys Notebook'
  })
  const malloryNotebookId = ((await eigenes.json()) as Array<{ id: string }>)[0]!.id

  const response = await asUser(request, mallory).patch(`notes?id=eq.${aliceNoteId}`, {
    notebook_id: malloryNotebookId
  })
  expect(response.status()).toBe(200)
  expect((await response.json()) as unknown[]).toEqual([])
})

test('Mallory kann Alices Notiz nicht löschen', async ({ request }) => {
  const response = await asUser(request, mallory).delete(`notes?id=eq.${aliceNoteId}`)
  expect([200, 204]).toContain(response.status())

  // Die eigentliche Prüfung: die Notiz ist noch da. Ein Löschen, das nichts
  // trifft, meldet keinen Fehler — nur die Gegenprobe zeigt den Unterschied.
  const nachher = await asUser(request, alice).get(`notes?id=eq.${aliceNoteId}`)
  expect((await nachher.json()) as unknown[]).toHaveLength(1)
})

test('Mallory kann keine Notiz in Alices Notebook legen', async ({ request }) => {
  const response = await asUser(request, mallory).post('notes', {
    notebook_id: aliceNotebookId,
    title: 'Untergeschoben',
    content: 'Steht da wie von Alice.'
  })
  // 403: die INSERT-Policy lehnt ab, statt zu filtern — bei einem Einfügen
  // gibt es nichts wegzufiltern.
  expect(response.status()).toBe(403)
})

test('Alice kann ihre eigene Notiz ändern und löschen — die Gegenprobe', async ({ request }) => {
  // Ohne diesen Test bewiesen die vorigen nur, dass `notes` niemandem gehört.
  const geaendert = await asUser(request, alice).patch(`notes?id=eq.${aliceNoteId}`, {
    content: 'Von Alice überarbeitet.'
  })
  expect((await geaendert.json()) as unknown[]).toHaveLength(1)

  const geloescht = await asUser(request, alice).delete(`notes?id=eq.${aliceNoteId}`)
  expect([200, 204]).toContain(geloescht.status())

  const nachher = await asUser(request, alice).get(`notes?id=eq.${aliceNoteId}`)
  expect((await nachher.json()) as unknown[]).toEqual([])
})

test('an die Drossel-Zähler kommt niemand heran — auch nicht an die eigenen', async ({
  request
}) => {
  // Ein Zähler, den der Gezählte ändern darf, ist keiner.
  //
  // `rate_limits` hat RLS an und **keine einzige Policy**, und es gibt kein
  // `grant` für `authenticated`. Das ist Absicht und keine vergessene Zeile:
  // Der einzige Weg an die Tabelle führt über `consume_rate_limit`, und die
  // kann nur hochzählen. Ohne diesen Test sähe die fehlende Policy aus wie ein
  // Versehen, das jemand „behebt".
  const api = asUser(request, alice)

  for (const [name, aufruf] of [
    ['lesen', () => api.get('rate_limits?select=count')],
    ['anlegen', () => api.post('rate_limits', { user_id: alice.userId, bucket: 'chat', count: 0 })],
    ['ändern', () => api.patch('rate_limits?bucket=eq.chat', { count: 0 })],
    ['löschen', () => api.delete('rate_limits?bucket=eq.chat')]
  ] as const) {
    const antwort = await aufruf()
    expect(antwort.ok(), `${name} war erlaubt: ${await antwort.text()}`).toBe(false)
  }
})

test('die Drossel-Funktion verbraucht nur das eigene Kontingent', async ({ request }) => {
  // Sie nimmt **keine** Nutzer-ID entgegen, sondern liest sie aus dem Token.
  // Damit gibt es kein Argument, über das jemand fremdes Kontingent leeren
  // könnte — der häufigste Fehler bei genau diesem Muster.
  //
  // Geprüft wird das Verhalten und nicht die Signatur: Mallory leert ihren
  // Topf, und Alices bleibt unberührt.
  const topf = `probe-${Date.now()}`
  const verbrauchen = (wer: TestUser) =>
    asUser(request, wer).post('rpc/consume_rate_limit', {
      p_bucket: topf,
      p_limit: 1,
      p_window: '1 hour'
    })

  expect(await (await verbrauchen(mallory)).json()).toBe(true)
  expect(await (await verbrauchen(mallory)).json(), 'Mallorys Grenze greift').toBe(false)

  expect(
    await (await verbrauchen(alice)).json(),
    'Mallorys Verbrauch hat Alices Topf geleert'
  ).toBe(true)
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
