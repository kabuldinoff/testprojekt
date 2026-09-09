import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    // Unit-Tests liegen neben ihrem Modul in __tests__/ und decken reine
    // Funktionen ab. Alles, was einen Browser oder eine Datenbank braucht,
    // gehört nach e2e/ und läuft unter Playwright — nicht hier.
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node'
  }
})
