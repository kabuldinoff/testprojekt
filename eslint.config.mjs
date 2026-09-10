import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // Schaltet nur Regeln ab, die mit Prettier kollidieren. Formatierung prüft
  // Prettier selbst (`pnpm format:check`), nicht ESLint — zwei Werkzeuge, die
  // dieselbe Datei umformatieren wollen, blockieren sich gegenseitig.
  prettier,

  {
    rules: {
      // Ein ungenutzter Import ist meist ein Rest aus einem Refactor. Ein mit
      // _ präfigiertes Argument ist dagegen eine bewusste Signatur-Erfüllung.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    // Standalone-HTML ohne Build-Schritt — kein ESLint-Ziel.
    'design/**',
    // Von `supabase start` erzeugt (u. a. der Edge-Runtime-Bootstrap, eine
    // einzige 31.000 Zeichen lange Zeile). Git ignoriert das über
    // supabase/.gitignore; ESLint liest verschachtelte .gitignore-Dateien
    // nicht, deshalb hier noch einmal ausdrücklich.
    'supabase/.temp/**',
    'supabase/.branches/**'
  ])
])
