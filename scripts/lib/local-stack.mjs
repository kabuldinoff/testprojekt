/**
 * Die Zugangsdaten des lokalen Supabase-Stacks, zur Laufzeit geholt.
 *
 * Warum nicht als Datei: sie sehen aus wie Geheimnisse, der no-secrets-Hook
 * würde zu Recht anschlagen, und ein Reviewer müsste jedes Mal prüfen, ob das
 * nun echte Schlüssel sind.
 *
 * Der zweite Grund ist wichtiger: so kann weder die Testsuite noch der
 * lokale Entwicklungsserver versehentlich gegen die echte Datenbank laufen.
 * Ohne laufenden Stack wird abgebrochen, statt auf `.env.local` zurückzufallen
 * — dort steht das Produktionsprojekt.
 *
 * Geteilt von `e2e.mjs` und `dev-local.mjs`, damit es nur eine Stelle gibt,
 * an der diese Zuordnung falsch sein kann.
 */
import { execFileSync } from 'node:child_process'

export function localStackEnv() {
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
    // NEXT_PUBLIC_-Werte werden zur Build-Zeit ins Bundle eingebacken. Next
    // überschreibt bereits gesetzte Prozessvariablen nicht — die hier
    // gesetzten Werte gewinnen also gegen .env.local.
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: values.SECRET_KEY,
    MAILPIT_URL: values.MAILPIT_URL ?? 'http://127.0.0.1:54424'
  }
}
