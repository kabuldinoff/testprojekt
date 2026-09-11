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
import { spawn, spawnSync } from 'node:child_process'

import { localStackEnv } from './lib/local-stack.mjs'

/**
 * Fester Port, weil er in drei Prozesse muss: Stub, Build und Server. Er
 * liegt im selben 5443x-Bereich wie der übrige lokale Stack, damit er sich
 * nicht mit einem anderen Projekt beißt.
 */
const STUB_PORT = 54430
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`

function testEnv() {
  const stack = localStackEnv()
  return {
    ...process.env,
    ...stack,
    // Die Tests brauchen den Postfach-Server, um Bestätigungslinks zu lesen.
    E2E_MAILPIT_URL: stack.MAILPIT_URL,

    // Platzhalter: `aiEnv()` verlangt sie, der Stub prüft sie nicht. Sie
    // stehen bewusst hier und nicht in einer Datei — ein Wert, der aussieht
    // wie ein Schlüssel, hat in einem öffentlichen Repo nichts zu suchen,
    // auch wenn er keiner ist.
    GOOGLE_GENERATIVE_AI_API_KEY: 'stub',
    MISTRAL_API_KEY: 'stub',
    GEMINI_CHAT_MODEL: 'stub-chat',
    MISTRAL_CHAT_MODEL: 'stub-chat',
    GEMINI_TTS_MODEL: 'stub-tts',
    GOOGLE_BASE_URL: `${STUB_URL}/v1beta`,
    MISTRAL_BASE_URL: `${STUB_URL}/v1`
  }
}

const env = testEnv()

/**
 * Startet den Stub und wartet, bis er wirklich antwortet.
 *
 * `spawn()` bestätigt nur, dass ein Prozess entstanden ist — nicht, dass er
 * `server.listen` erreicht hat. Ist Port 54430 belegt, endet der Stub mit
 * EADDRINUSE, während Build und Playwright munter weiterlaufen: die Tests
 * scheitern dann an „connection refused" an einer Stelle, die mit der
 * Ursache nichts zu tun hat. Schlimmer noch, wenn der Port von etwas anderem
 * belegt ist — dann gingen die Anfragen an einen fremden Dienst.
 *
 * Deshalb wird auf eine echte Antwort gewartet, und ein vorzeitiges Ende des
 * Stubs beendet den ganzen Lauf.
 */
async function startStub() {
  const stub = spawn('node', ['scripts/ai-stub.mjs'], {
    stdio: 'inherit',
    env: { ...env, AI_STUB_PORT: String(STUB_PORT) }
  })

  let beendet = false
  stub.on('exit', (code) => {
    beendet = true
    // Nur melden, wenn wir ihn nicht selbst beendet haben.
    if (!aufraeumen) {
      console.error(`\nDer AI-Stub ist unerwartet beendet (Code ${code}).`)
      console.error(`Meist ist Port ${STUB_PORT} belegt: lsof -i :${STUB_PORT}\n`)
      process.exit(1)
    }
  })
  stub.on('error', (fehler) => {
    beendet = true
    console.error(`\nDer AI-Stub ließ sich nicht starten: ${fehler.message}\n`)
    process.exit(1)
  })

  // Höchstens zehn Sekunden. Der Stub hat keine Abhängigkeiten und ist
  // normalerweise nach Millisekunden da; braucht er länger, stimmt etwas
  // anderes nicht, und Warten hilft dann auch nicht.
  const frist = Date.now() + 10_000
  while (Date.now() < frist) {
    if (beendet) process.exit(1)
    try {
      // Ein Pfad, den der Stub kennt. Antwortet dort etwas anderes als
      // erwartet, ist der Port fremdbesetzt — auch das soll auffallen.
      const antwort = await fetch(`${STUB_URL}/v1/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'mistral-embed', input: ['bereit?'] })
      })
      const daten = await antwort.json()
      if (Array.isArray(daten.data) && daten.data[0]?.embedding?.length === 1024) return stub

      console.error(`\nAuf Port ${STUB_PORT} antwortet etwas, das nicht der AI-Stub ist.\n`)
      process.exit(1)
    } catch {
      await new Promise((weiter) => setTimeout(weiter, 100))
    }
  }

  console.error(`\nDer AI-Stub war nach 10 s nicht erreichbar (${STUB_URL}).\n`)
  process.exit(1)
}

// Merkt sich, dass ein Ende gewollt ist — sonst meldete der exit-Handler des
// Stubs beim regulären Aufräumen einen Fehler.
let aufraeumen = false
const stub = await startStub()

function beenden(code) {
  aufraeumen = true
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
