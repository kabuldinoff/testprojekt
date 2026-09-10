import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Die wichtigste Sicherheitsregel des Projekts, als Test statt als Kommentar.
 *
 * `src/lib/supabase/admin.ts` benutzt den Secret Key und umgeht RLS
 * vollständig. Aus einer Route, die direkt auf eine Nutzeraktion antwortet,
 * darf er nicht erreichbar sein — auch nicht über mehrere Ebenen.
 *
 * Ein Kommentar hält diese Regel nicht: ein Import ist schnell geschrieben und
 * im Diff unauffällig. Dieser Test folgt dem Import-Graph und schlägt fehl,
 * sobald `admin.ts` von `src/app/` aus erreichbar wird. Die Fehlermeldung
 * zeigt die vollständige Kette.
 *
 * Die erste Fassung benutzte eine Regex auf `from '…'`. Sie übersah drei
 * Formen, mit denen sich die Regel lautlos umgehen ließ:
 *   import '@/lib/x'            — Seiteneffekt-Import ohne Bindung
 *   await import('@/lib/x')     — dynamischer Import
 *   export * from '@/lib/x'     — Re-Export
 * `ts.preProcessFile` erkennt alle. TypeScript liegt ohnehin als
 * Entwicklungsabhängigkeit vor, es kommt also nichts Neues dazu.
 *
 * Ebenfalls aus der ersten Fassung entfernt: eine Ausnahmeliste, die die Suche
 * beim Ingestion-Ordner abbrach. Damit galt ein Weg
 * `src/app/… → src/lib/ingest/… → admin.ts` als unbedenklich — dabei ist genau
 * das der Verstoß, um den es geht. Wo `admin.ts` legitim benutzt werden darf,
 * entscheidet nicht dieser Test, sondern von wo aus man dorthin gelangt.
 */

const SRC = resolve(process.cwd(), 'src')
const ADMIN = resolve(SRC, 'lib/supabase/admin.ts')

/** Wurzeln, aus denen `admin.ts` unerreichbar bleiben muss. */
const FORBIDDEN_ROOTS = ['app']

/**
 * Die einzigen Dateien unter `src/app/`, die `admin.ts` erreichen dürfen.
 *
 * Wichtig ist die Art der Ausnahme. Eine frühere Fassung hatte eine
 * Ausnahmeliste, die die **Suche abbrach** — damit galt jeder Weg durch einen
 * ausgenommenen Ordner als unbedenklich, und genau das war die Lücke. Hier
 * werden stattdessen **Einstiegspunkte** benannt: diese Datei darf, jede
 * andere nicht, und indirekte Wege werden weiterhin vollständig verfolgt.
 *
 * Die Liste wird unten selbst geprüft. Ein zusätzlicher Eintrag ist damit
 * eine sichtbare Änderung an einem Test und keine stille Erweiterung.
 */
const PERMITTED: Array<{ file: string; reason: string }> = [
  {
    file: 'app/api/sources/[sourceId]/ingest/route.ts',
    reason:
      'Die Verarbeitung läuft in after(), also nach der Antwort. Dort ist der Request beendet ' +
      'und das Sitzungs-Token kann während eines bis zu fünf Minuten langen Laufs ablaufen. ' +
      'Die Route prüft den Besitz vorher über den RLS-Client; erst danach übernimmt der Worker.'
  }
]

const PERMITTED_FILES = new Set(PERMITTED.map((p) => resolve(SRC, p.file)))

function listFiles(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(listFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Löst einen Import-Spezifier auf eine Datei unter `src/` auf, sonst null. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = resolve(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(fromFile, '..', specifier)
  else return null // ein Paket aus node_modules

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx')
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // existiert nicht — nächster Kandidat
    }
  }
  return null
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  // Argumente: readImportFiles, detectJavaScriptImports — zusammen erfassen
  // sie statische, dynamische, Seiteneffekt- und Re-Export-Importe.
  const { importedFiles } = ts.preProcessFile(source, true, true)
  return importedFiles
    .map((ref) => resolveImport(file, ref.fileName))
    .filter((f): f is string => f !== null)
}

/** Breitensuche über den Import-Graph. Gibt die Kette zum Ziel zurück, sonst null. */
function pathToAdmin(entry: string): string[] | null {
  const queue: string[][] = [[entry]]
  const seen = new Set<string>([entry])

  while (queue.length > 0) {
    const chain = queue.shift()!
    const current = chain[chain.length - 1]!
    if (current === ADMIN) return chain

    for (const next of importsOf(current)) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push([...chain, next])
    }
  }
  return null
}

describe('der service-role-Client bleibt unerreichbar', () => {
  it('admin.ts existiert und ist der geprüfte Pfad', () => {
    expect(statSync(ADMIN).isFile()).toBe(true)
  })

  for (const root of FORBIDDEN_ROOTS) {
    it(`keine Datei unter src/${root}/ erreicht admin.ts`, () => {
      const offenders = listFiles(resolve(SRC, root))
        .filter((entry) => !PERMITTED_FILES.has(entry))
        .map((entry) => pathToAdmin(entry))
        .filter((chain): chain is string[] => chain !== null)
        .map((chain) => `\n  ${chain.map((f) => relative(process.cwd(), f)).join('\n    → ')}`)

      expect(offenders, `admin.ts ist erreichbar über:${offenders.join('')}`).toEqual([])
    })
  }

  it('die Ausnahmeliste enthält genau das, was sie enthalten soll', () => {
    // Damit das Hinzufügen einer Ausnahme eine bewusste Änderung an zwei
    // Stellen ist und nicht nur ein stiller Eintrag in einer Liste.
    expect(PERMITTED.map((p) => p.file)).toEqual(['app/api/sources/[sourceId]/ingest/route.ts'])
    for (const { file, reason } of PERMITTED) {
      expect(statSync(resolve(SRC, file)).isFile(), `${file} existiert nicht mehr`).toBe(true)
      expect(reason.length, `${file} hat keine Begründung`).toBeGreaterThan(60)
    }
  })

  // Dass die ausgenommene Datei ihre Bedingung auch einhält — Besitzprüfung
  // vor dem Worker — lässt sich hier nicht feststellen. Ein Import-Graph
  // kennt keine Reihenfolge. Zwei Zusicherungen der Form „irgendwo im
  // Quelltext steht getUser()" standen hier und blieben grün, wenn die
  // Prüfung entfernt oder nach dem Worker aufgerufen wird.
  //
  // Geprüft wird das stattdessen dort, wo es beobachtbar ist: in
  // `ingest-route-guard.test.ts` wird die Route ausgeführt und festgestellt,
  // dass `ingestSource` bei fehlender Anmeldung und bei fremder Quelle nicht
  // aufgerufen wird.

  // Ein Sicherheitstest, der nicht rot werden kann, beweist nichts. Diese
  // Fälle prüfen den Prüfer — sie sind die Formen, an denen die erste Fassung
  // vorbeigelaufen ist.
  describe('der Prüfer erkennt alle Import-Formen', () => {
    const formen = {
      'statischer Import': "import x from '@/lib/supabase/admin'",
      'Seiteneffekt-Import': "import '@/lib/supabase/admin'",
      'dynamischer Import': "const x = await import('@/lib/supabase/admin')",
      'Re-Export': "export * from '@/lib/supabase/admin'"
    }

    for (const [name, quelltext] of Object.entries(formen)) {
      it(name, () => {
        const { importedFiles } = ts.preProcessFile(quelltext, true, true)
        expect(importedFiles.map((f) => f.fileName)).toContain('@/lib/supabase/admin')
      })
    }
  })
})
