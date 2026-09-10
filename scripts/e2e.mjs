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
 *
 * Dasselbe gilt für die AI-Anbieter: hier läuft ein Stub statt Google und
 * Mistral. Der Grund steht in scripts/ai-stub.mjs — kurz: gegen ein echtes
 * Modell lässt sich nicht prüfen, dass Beleg [1] auf den richtigen Ausschnitt
 * zeigt, und genau das ist die Zusicherung dieses Produkts. Die Schlüssel
 * hier sind Platzhalter; der Stub sieht sie nie an.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'

/**
 * Fester Port, weil er in drei Prozesse muss: Stub, Build und Server. Er
 * liegt im selben 5443x-Bereich wie der übrige lokale Stack, damit er sich
 * nicht mit einem anderen Projekt beißt.
 */
const STUB_PORT = 54430
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`

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
        ' einem anderen lokalen Supabase-Projekt beißen. CI startet denselben\n' +
        ' Stack, aber ohne Studio, Realtime und die Analytics-Kette — lokal sind\n' +
        ' die zum Debuggen nützlich, im Runner kosten sie nur Minuten.)\n'
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
    E2E_MAILPIT_URL: values.MAILPIT_URL ?? 'http://127.0.0.1:54424',

    // Platzhalter: `aiEnv()` verlangt sie, der Stub prüft sie nicht. Sie
    // stehen bewusst hier und nicht in einer Datei — ein Wert, der aussieht
    // wie ein Schlüssel, hat in einem öffentlichen Repo nichts zu suchen,
    // auch wenn er keiner ist.
    GOOGLE_GENERATIVE_AI_API_KEY: 'stub',
    MISTRAL_API_KEY: 'stub',
    GEMINI_CHAT_MODEL: 'stub-chat',
    MISTRAL_CHAT_MODEL: 'stub-chat',
    GOOGLE_BASE_URL: `${STUB_URL}/v1beta`,
    MISTRAL_BASE_URL: `${STUB_URL}/v1`
  }
}

const env = localStackEnv()

// Der Stub läuft neben Build und Tests. `unref()` wäre falsch — er soll leben,
// solange dieser Prozess lebt, und mit ihm sterben.
const stub = spawn('node', ['scripts/ai-stub.mjs'], {
  stdio: 'inherit',
  env: { ...env, AI_STUB_PORT: String(STUB_PORT) }
})

function beenden(code) {
  stub.kill()
  process.exit(code)
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => beenden(1))

for (const [label, args] of [
  ['Build', ['exec', 'next', 'build']],
  ['Playwright', ['exec', 'playwright', ...process.argv.slice(2)]]
]) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env })
  if (result.status !== 0) {
    console.error(`\n${label} fehlgeschlagen.`)
    beenden(result.status ?? 1)
  }
}

beenden(0)
