import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Die wichtigste Sicherheitsregel des Projekts, als Test statt als Kommentar.
 *
 * `src/lib/supabase/admin.ts` benutzt den Secret Key und umgeht RLS
 * vollständig. Er darf ausschließlich aus dem Ingestion-Worker erreichbar
 * sein, nie aus einer Route, die direkt auf eine Nutzeraktion antwortet.
 *
 * Ein Kommentar hält diese Regel nicht — ein Import ist schnell geschrieben
 * und im Diff unauffällig. Dieser Test folgt dem Import-Graph vom App-Bereich
 * aus und schlägt fehl, sobald `admin.ts` von dort aus erreichbar wird, auch
 * über mehrere Ebenen.
 */

const SRC = resolve(process.cwd(), 'src')
const ADMIN = resolve(SRC, 'lib/supabase/admin.ts')

/** Verzeichnisse, aus denen admin.ts nicht erreichbar sein darf. */
const FORBIDDEN_ROOTS = ['app']

/** Der einzige Ort, an dem der Import erlaubt ist. Existiert noch nicht. */
const ALLOWED = [resolve(SRC, 'lib/ingest')]

function listFiles(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(listFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Löst einen Import-Spezifier auf eine Datei unter src/ auf, sonst null. */
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
  const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
  return specifiers.map((s) => resolveImport(file, s)).filter((f): f is string => f !== null)
}

/** Breitensuche über den Import-Graph. Gibt den Pfad zum Ziel zurück, sonst null. */
function pathToAdmin(entry: string): string[] | null {
  const queue: string[][] = [[entry]]
  const seen = new Set<string>([entry])

  while (queue.length > 0) {
    const chain = queue.shift()!
    const current = chain[chain.length - 1]!
    if (current === ADMIN) return chain

    for (const next of importsOf(current)) {
      if (seen.has(next)) continue
      if (ALLOWED.some((allowed) => next.startsWith(allowed))) continue
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
      const entries = listFiles(resolve(SRC, root))
      const offenders = entries
        .map((entry) => ({ entry, chain: pathToAdmin(entry) }))
        .filter((r) => r.chain !== null)
        .map((r) => `\n  ${r.chain!.map((f) => relative(process.cwd(), f)).join('\n    → ')}`)

      // Die Fehlermeldung zeigt die ganze Import-Kette. Bei einem indirekten
      // Treffer über drei Ebenen ist genau das die Information, die fehlt.
      expect(offenders, `admin.ts ist erreichbar über:${offenders.join('')}`).toEqual([])
    })
  }
})
