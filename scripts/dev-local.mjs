#!/usr/bin/env node
/**
 * Entwicklungsserver gegen den LOKALEN Supabase-Stack.
 *
 * `pnpm dev` allein nimmt die Werte aus `.env.local`, und die zeigen auf das
 * Produktionsprojekt. Zum Ausprobieren ist das die falsche Datenbank: dort
 * laufen echte Migrationen, echte Zeilen, und eine Registrierung schickt eine
 * echte E-Mail.
 *
 * Hier läuft alles lokal — Datenbank, Auth, Storage, Postfach — mit einer
 * Ausnahme: **die AI-Anbieter sind echt.** Der Stub aus `ai-stub.mjs` ist für
 * die Tests da, wo es auf Wiederholbarkeit ankommt. Wer die App ansieht, will
 * die echten Antworten sehen; die Schlüssel dafür kommen aus `.env.local` und
 * werden hier nicht angefasst.
 */
import { spawn } from 'node:child_process'

import { localStackEnv } from './lib/local-stack.mjs'

const stack = localStackEnv()
const PORT = process.env.PORT ?? '3000'

console.log(
  [
    '',
    '  Notabene — lokal',
    '',
    `  App        http://localhost:${PORT}`,
    `  Datenbank  ${stack.NEXT_PUBLIC_SUPABASE_URL}   (lokal, nicht Produktion)`,
    `  Postfach   ${stack.MAILPIT_URL}   ← Bestätigungslinks der Registrierung`,
    '',
    '  AI-Anbieter sind echt und verbrauchen Kontingent.',
    ''
  ].join('\n')
)

const next = spawn('pnpm', ['exec', 'next', 'dev', '--port', PORT], {
  stdio: 'inherit',
  env: { ...process.env, ...stack }
})

next.on('exit', (code) => process.exit(code ?? 0))
