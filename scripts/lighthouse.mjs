#!/usr/bin/env node
/**
 * Misst die öffentlichen Seiten mit Lighthouse und bricht unter 90 ab.
 *
 * ── Warum ein Skript und nicht `lhci autorun` direkt ──────────────────────
 *
 * Zwei Dinge muss jemand setzen, bevor Lighthouse startet, und beide sind
 * leicht zu vergessen:
 *
 * 1. **Der Browser.** Lighthouse sucht ein installiertes Chrome. Auf einem
 *    Rechner, auf dem nur der Playwright-Browser liegt, findet es keines und
 *    bricht mit einer Meldung ab, die nach einem Konfigurationsfehler
 *    aussieht. Hier wird derselbe Browser benutzt, gegen den auch die
 *    End-to-End-Tests laufen — eine Installation weniger, und gemessen wird,
 *    womit getestet wird.
 *
 * 2. **Die Umgebungsvariablen.** `next start` braucht sie, sonst wirft
 *    `publicEnv()` beim Rendern und die Seite antwortet mit 500 — Lighthouse
 *    meldete dann einen Wert von 0 und niemand wüsste warum. Gemessen wird
 *    gegen den lokalen Stack, aus demselben Grund wie bei den Tests: damit
 *    eine Messung nicht versehentlich auf die echte Datenbank zeigt.
 *
 * Gemessen wird nur, was öffentlich ist. Der angemeldete Bereich hat andere
 * Ziele — dort liegt der schwere Chat-Client — und ohne Sitzung wäre die
 * Messung ohnehin die der Anmeldeseite.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { localStackEnv } from './lib/local-stack.mjs'

/** Der Browser aus dem Playwright-Zwischenspeicher, plattformabhängig. */
function findeBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH

  const wurzeln =
    process.platform === 'darwin'
      ? [join(homedir(), 'Library/Caches/ms-playwright')]
      : [join(homedir(), '.cache/ms-playwright')]

  const kandidaten = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-linux/chrome',
    'chrome-linux64/chrome'
  ]

  for (const wurzel of wurzeln) {
    if (!existsSync(wurzel)) continue
    // Neueste Revision zuerst: Die Verzeichnisse heißen chromium-<zahl>.
    const versionen = readdirSync(wurzel)
      .filter((n) => n.startsWith('chromium-'))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    for (const version of versionen) {
      for (const kandidat of kandidaten) {
        const pfad = join(wurzel, version, kandidat)
        if (existsSync(pfad)) return pfad
      }
    }
  }
  return null
}

const browser = findeBrowser()
if (!browser) {
  console.error(
    '\nKein Browser gefunden.\n' +
      'Entweder `pnpm exec playwright install chromium` ausführen oder CHROME_PATH setzen.\n'
  )
  process.exit(1)
}

const env = { ...process.env, ...localStackEnv(), CHROME_PATH: browser }

for (const [label, args] of [
  ['Build', ['exec', 'next', 'build']],
  ['Lighthouse', ['exec', 'lhci', 'autorun']]
]) {
  const ergebnis = spawnSync('pnpm', args, { stdio: 'inherit', env })
  if (ergebnis.status !== 0) {
    console.error(`\n${label} fehlgeschlagen.`)
    process.exit(ergebnis.status ?? 1)
  }
}
