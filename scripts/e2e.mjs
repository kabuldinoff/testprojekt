#!/usr/bin/env node
/**
 * Führt die End-to-End-Suite gegen den LOKALEN Supabase-Stack aus.
 *
 * Warum ein Skript und keine .env.test-Datei: die Zugangsdaten des lokalen
 * Stacks stehen in keiner Datei, die man committen möchte — sie sehen aus wie
 * Geheimnisse, der no-secrets-Hook würde zu Recht anschlagen, und ein
 * Reviewer müsste jedes Mal prüfen, ob das nun echte Schlüssel sind. Hier
 * werden sie stattdessen zur Laufzeit von `supabase status` geholt.
 *
 * Der zweite Grund ist wichtiger: so kann die Suite gar nicht versehentlich
 * gegen die echte Datenbank laufen. Sie legt Testnutzer an und löscht Daten —
 * auf einer Produktionsdatenbank wäre das ein sehr kurzer, sehr schlechter Tag.
 *
 * NEXT_PUBLIC_-Werte werden zur Build-Zeit ins Bundle eingebacken. Deshalb
 * muss der Build mit denselben Variablen laufen wie die Tests, und nicht nur
 * der Server. Next überschreibt bereits gesetzte Prozessvariablen nicht — die
 * hier gesetzten Werte gewinnen also gegen .env.local.
 */
import { execFileSync, spawnSync } from 'node:child_process'

function localStackEnv() {
  let raw
  try {
    raw = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch {
    console.error(
      '\nDer lokale Supabase-Stack läuft nicht.\n' +
        'Erst starten:  pnpm supabase:start\n' +
        '(Braucht Docker. Die Ports liegen auf 5442x, damit sie sich nicht mit\n' +
        ' einem anderen lokalen Supabase-Projekt beißen.)\n'
    )
    process.exit(1)
  }

  const values = Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/))
      .filter((m) => m !== null)
      .map((m) => [m[1], m[2]])
  )

  for (const key of ['API_URL', 'PUBLISHABLE_KEY', 'SECRET_KEY']) {
    if (!values[key]) {
      console.error(`\n\`supabase status\` liefert kein ${key}. Stack neu starten.\n`)
      process.exit(1)
    }
  }

  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: values.SECRET_KEY,
    // Die Tests brauchen den Postfach-Server, um Bestätigungslinks zu lesen.
    E2E_MAILPIT_URL: values.MAILPIT_URL ?? 'http://127.0.0.1:54424'
  }
}

const env = localStackEnv()

for (const [label, args] of [
  ['Build', ['exec', 'next', 'build']],
  ['Playwright', ['exec', 'playwright', ...process.argv.slice(2)]]
]) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env })
  if (result.status !== 0) {
    console.error(`\n${label} fehlgeschlagen.`)
    process.exit(result.status ?? 1)
  }
}
