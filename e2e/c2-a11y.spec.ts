import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { uniqueEmail } from './lib/supabase'

/**
 * c2 — Zugänglichkeit, gemessen statt behauptet.
 *
 * Zwei Arten von Prüfung, weil sie Verschiedenes können:
 *
 * 1. **axe** über die echten Seiten. Es findet die Fehlerklassen, die man
 *    beim Bauen übersieht — fehlende Namen, kaputte Beschriftungen, doppelte
 *    Kennungen, Überschriftensprünge. Geprüft wird gegen WCAG 2.1 AA, also
 *    dieselbe Schwelle wie beim Farbkontrast.
 *
 * 2. **Eine eigene Prüfung** für das, was axe nicht wissen kann: ob jedes per
 *    Tabulator erreichbare Element auch einen sichtbaren Fokus bekommt.
 *
 * ── Was hier bewusst **nicht** steht ──────────────────────────────────────
 *
 * Eine Messung des Textkontrasts über dem Verlauf hinter dem Hero. Sie stand
 * kurz hier und prüfte nichts: Sie las die Textfarbe aus und verglich sie mit
 * der Hintergrundfarbe des Körpers — also mit einem Untergrund, den der
 * Verlauf gerade überdeckt. Der Test wäre auch dann grün geblieben, wenn die
 * Überschrift unlesbar gewesen wäre.
 *
 * Eine echte Messung hieße, das gerenderte Pixel zu lesen, und das verlangt
 * das Aufnehmen und Dekodieren eines Bildes. Solange das nicht gebaut ist,
 * trägt die Rechnung in `src/lib/__tests__/contrast.test.ts` — und sie ist
 * **strenger** als die Wirklichkeit: Sie setzt die volle Deckkraft des
 * Verlaufs an, während sein dichtester Punkt über dem sichtbaren Rand liegt.
 * Eine Prüfung, die weniger behauptet, als sie leistet, ist besser als eine,
 * die mehr behauptet.
 */

const PASSWORD = 'test-passwort-1234'

/** Beide Ausprägungen, weil eine Palette in der anderen durchfallen kann. */
const THEMES = ['dark', 'light'] as const

async function pruefen(page: Page, name: string) {
  const ergebnis = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const befunde = ergebnis.violations.map(
    (v) =>
      `${v.id} (${v.impact}) — ${v.help}\n      ${v.nodes.map((n) => n.target).join('\n      ')}`
  )
  expect(befunde, `${name}:\n  ${befunde.join('\n  ')}`).toEqual([])
}

async function themaSetzen(page: Page, thema: (typeof THEMES)[number]) {
  // Über den Umschalter statt über localStorage: So wird geprüft, was ein
  // Nutzer auslöst, und nicht ein Zustand, den nur der Test herstellen kann.
  const aktuell = await page.evaluate(() =>
    document.documentElement.classList.contains('light') ? 'light' : 'dark'
  )
  if (aktuell === thema) return

  await page.getByRole('button', { name: 'Design umschalten' }).first().click()

  // Auf die Klasse warten, nicht auf eine Zeitspanne. Die erste Fassung
  // wartete feste 300 ms — dauerte die Umschaltung länger, prüfte axe das
  // **alte** Theme und meldete es als geprüft. Ein grüner Lauf, der die eine
  // Ausprägung nie gesehen hat.
  await page.waitForFunction(
    (gewuenscht) =>
      (document.documentElement.classList.contains('light') ? 'light' : 'dark') === gewuenscht,
    thema
  )
}

for (const thema of THEMES) {
  test(`öffentliche Seiten sind zugänglich — ${thema}`, async ({ page }) => {
    for (const pfad of ['/', '/anmelden', '/registrieren']) {
      await page.goto(pfad)
      await themaSetzen(page, thema)
      await pruefen(page, `${pfad} (${thema})`)
    }
  })
}

test('der Arbeitsbereich ist zugänglich, mit Quelle, Antwort und Notiz', async ({ page }) => {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('a11y'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await pruefen(page, 'Übersicht (leer)')

  await page.goto('/app/neu')
  await pruefen(page, 'Neues Notebook')
  await page.getByLabel('Titel').fill('A11y-Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)

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

  // Der interessante Zustand ist der volle: Antwort mit Belegen, aufgeklappte
  // Passage, gespeicherte Notiz. Ein leeres Notebook zu prüfen hieße, die
  // Hälfte der Elemente nie zu sehen.
  const chat = page.getByRole('region', { name: 'Chat' })
  await chat.getByLabel('Frage an die ausgewählten Quellen').fill('Wie war die Marge?')
  await chat.getByRole('button', { name: 'Fragen' }).click()
  const beleg = chat.getByRole('button', { name: /^Beleg 1/ })
  await expect(beleg).toBeVisible({ timeout: 30_000 })
  await beleg.click()
  await chat.getByRole('button', { name: 'Als Notiz speichern' }).click()
  await expect(chat.getByText('Als Notiz gespeichert.')).toBeVisible()

  // In **beiden** Ausprägungen. Die erste Fassung prüfte nur die dunkle, weil
  // sie der Standard ist — Verstöße in der hellen wären nie aufgefallen, und
  // der Test hätte trotzdem „zugänglich" gemeldet.
  for (const thema of THEMES) {
    await themaSetzen(page, thema)
    await pruefen(page, `Arbeitsbereich voll (${thema})`)
  }

  // Und der Quellenbetrachter darüber. Er ist ein eigener Zustand und kein
  // Teil der Seite darunter: ein modales `<dialog>` legt den Rest still, und
  // axe sieht anschließend im Wesentlichen nur noch ihn. Ohne diesen Durchlauf
  // bliebe ausgerechnet die Markierung ungeprüft — Gold mit dunkler Tinte ist
  // das Paar, das am ehesten kippt.
  //
  // Das Thema wird **vor** dem Öffnen gesetzt und der Dialog danach wieder
  // geschlossen. Andersherum lief der Test in eine Zeitüberschreitung: Der
  // Umschalter liegt hinter dem Dialog und nimmt keine Klicks mehr an. Das ist
  // kein Hindernis, sondern der Beweis, dass `showModal()` wirkt — mit dem
  // `open`-Attribut wäre der Knopf erreichbar geblieben.
  for (const thema of THEMES) {
    await themaSetzen(page, thema)
    await page.getByRole('button', { name: 'Im Dokument anzeigen' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await pruefen(page, `Quellenbetrachter (${thema})`)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  }
})

test('der Sprunglink führt mit einem Tastendruck zum Chat', async ({ page }) => {
  // Der Test hieß zuerst „die Tastatur erreicht den Chat" und erreichte ihn
  // nie: Er drückte achtmal Tab auf der **leeren Übersicht**, ohne je ein
  // Notebook zu öffnen. Der Name versprach etwas, das er nicht prüfte.
  //
  // Beim Beheben stellte sich heraus, dass die Zusicherung selbst fehlte: In
  // der Dokumentreihenfolge steht die Quellenspalte vor dem Chat. Wer mit der
  // Tastatur arbeitet, tabbt sich sonst bei jedem Seitenaufruf durch
  // Quellenliste, Hinzufügen-Formular und Einstellungen. Der Sprunglink ist
  // die Antwort darauf, und hier wird er geprüft.
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('tastatur'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto('/app/neu')
  await page.getByLabel('Titel').fill('Tastatur-Notebook')
  await page.getByRole('button', { name: 'Notebook anlegen' }).click()
  await expect(page).toHaveURL(/\/app\/[0-9a-f-]{36}$/)

  const sprunglink = page.getByRole('button', { name: 'Zum Chat springen' })

  // Visuell verborgen, bis der Fokus ihn erreicht — sonst wäre er für die
  // Mehrheit Lärm.
  //
  // Geprüft wird die Größe, nicht Playwrights Sichtbarkeit: `sr-only`
  // arbeitet mit einem Ein-Pixel-Kästchen und `clip`, nicht mit
  // `display: none`. Für Playwright ist das Element damit „sichtbar", für
  // jedes Auge nicht. Die Breite sagt die Wahrheit.
  const breite = async () => (await sprunglink.boundingBox())?.width ?? 0
  expect(await breite(), 'Sprunglink ist ohne Fokus sichtbar').toBeLessThanOrEqual(2)

  await page.keyboard.press('Tab')
  await expect(sprunglink).toBeFocused()
  expect(await breite(), 'Sprunglink bleibt bei Fokus unsichtbar').toBeGreaterThan(80)

  await page.keyboard.press('Enter')

  // Der Fokus steht jetzt im Chat-Bereich, nicht irgendwo davor.
  await expect(page.getByRole('region', { name: 'Chat' })).toBeFocused()

  // Und von dort ist das Eingabefeld in Reichweite, ohne die Quellenspalte zu
  // durchqueren.
  await page.keyboard.press('Tab')
  const fokussiert = await page.evaluate(() => {
    const el = document.activeElement
    const chat = document.querySelector('[data-bereich="chat"]')
    return { imChat: chat?.contains(el) ?? false, marke: el?.tagName ?? '' }
  })
  expect(fokussiert.imChat, `Fokus landete außerhalb des Chats (${fokussiert.marke})`).toBe(true)
})

test('jedes per Tabulator erreichbare Element zeigt seinen Fokus', async ({ page }) => {
  await page.goto('/registrieren')
  await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('fokus'))
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page).toHaveURL(/\/app$/)

  // Geprüft wird der Umriss, nicht die Farbe: Ein Fokusring, den
  // `outline: none` entfernt hat, macht die Anwendung für Tastaturnutzer
  // unbedienbar — und das passiert versehentlich, weil `outline: none` in
  // vielen Zurücksetzungen steht.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    const sichtbar = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return true
      const stil = getComputedStyle(el)
      return stil.outlineStyle !== 'none' || stil.boxShadow !== 'none'
    })
    expect(
      sichtbar,
      `Element ${i + 1} in der Tabulatorreihenfolge hat keinen sichtbaren Fokus`
    ).toBe(true)
  }
})
