# 0002 — ESLint bleibt auf 9, TypeScript auf 5

**Datum:** 2026-09-10 · **Status:** angenommen

## Kontext

Zum Zeitpunkt des Projektstarts sind ESLint 10 und TypeScript 7 verfügbar. `pnpm` meldet die
installierte ESLint-9-Linie ausdrücklich als **deprecated**. In einem Repo, das in einem
Gespräch durchgegangen wird, ist eine veraltete Abhängigkeit eine Frage, die garantiert kommt —
und „nicht drüber nachgedacht" wäre die schlechteste Antwort.

## Entscheidung

**ESLint bleibt auf `^9.39.5`.** Das ist geprüft, nicht bequem. Mit ESLint 10 bricht der Lauf
sofort ab:

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
  at .../eslint-plugin-react@7.37.5/lib/util/version.js:31
```

`eslint-plugin-react@7.37.5` kommt transitiv über `eslint-config-next@16.3.4` herein und ist mit
der ESLint-10-API nicht kompatibel. Die Peer-Range von `eslint-config-next` erlaubt `>=9.0.0`
formal — die tatsächliche Abhängigkeit tut es nicht.

**TypeScript bleibt auf `^5.9.3`.** TypeScript 7 ist die native Neuimplementierung. Sie mag
funktionieren, aber sie müsste es gleichzeitig mit `next build`, `next typegen`, dem
TypeScript-ESLint-Parser und `vitest` tun. Das ist Risiko ohne Gegenwert für dieses Projekt.
`create-next-app` für `next@16.3.4` scaffoldet ebenfalls `^5`.

**React bleibt auf `19.2.8`**, exakt der Version, die `create-next-app` für dieses Next pinnt,
obwohl 19.3.0 verfügbar ist.

Alles andere ist aktuell: Next 16.3.4, Tailwind 4.3.3, Vitest 5, Playwright 1.63, Prettier 3.9.

## Alternativen

**ESLint 10 mit einem `pnpm.overrides` auf eine neuere `eslint-plugin-react`.** Möglich, aber es
überschreibt eine Abhängigkeit, die Next selbst mitbringt — der nächste `next`-Sprung kollidiert
damit still. Ein Override, um eine Deprecation-Meldung loszuwerden, tauscht ein sichtbares
Problem gegen ein unsichtbares.

**ESLint ganz gegen Biome tauschen.** Schneller, eine Abhängigkeit weniger, aber `eslint-config-next`
bringt die Next-spezifischen Regeln mit, die hier echten Wert haben — eine davon hat während der
Entwicklung ein React-19-Anti-Pattern im Theme-Umschalter gefunden (`setState` synchron in einem
Effect). Das wäre der Preis gewesen.

## Konsequenzen

- `pnpm install` gibt eine Deprecation-Warnung für ESLint aus. Das ist bekannt und dokumentiert,
  nicht übersehen.
- Sobald `eslint-config-next` eine mit ESLint 10 kompatible `eslint-plugin-react` mitbringt, ist
  der Wechsel ein Einzeiler. Der Test dafür ist einfach: hochziehen, `pnpm lint` laufen lassen.
