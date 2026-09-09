import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Nummeriert wie der Testplan in docs/testplan.md, damit ein roter Test
  // sofort einem Prüfpunkt zuzuordnen ist.
  testMatch: /[a-z]\d+-.*\.spec\.ts/,

  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    locale: 'de-DE',
    trace: 'retain-on-failure'
  },

  // Gegen den Produktions-Build testen, nicht gegen den Dev-Server: nur der
  // zeigt das echte Bundle, das echte Caching und die echten Server-Komponenten.
  // Gebaut wird vorher im npm-Script, nicht hier — sonst sagt ein Fehlschlag
  // nicht, ob der Build oder der Server gescheitert ist.
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: BASE_URL,
    // Bewusst immer ein frischer Server, auch lokal. Mit reuseExistingServer
    // greift Playwright einen noch laufenden Prozess ab, der eine ältere
    // Fassung im Speicher hält — die Tests scheitern dann an Code, der längst
    // korrigiert ist. Genau das ist beim Aufbau passiert und hat mehr Zeit
    // gekostet, als der Serverstart je einspart.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe'
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    }
  ]
})
