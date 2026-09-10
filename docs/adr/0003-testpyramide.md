# 0003 — Zwei Teststufen, keine dritte

**Datum:** 2026-09-10 · **Status:** angenommen

## Kontext

Die naheliegende Aufteilung für eine React-Anwendung ist dreistufig: Unit-Tests für Funktionen,
Komponententests für gerendertes UI, End-to-End-Tests für Abläufe. Die mittlere Stufe ist
erfahrungsgemäß die teuerste — sie braucht eine DOM-Umgebung, Mocks für alles Serverseitige, und
sie bricht bei jeder Umstrukturierung des Markups, ohne dass sich das Verhalten geändert hätte.

## Entscheidung

Zwei Stufen:

- **Vitest** über reine Funktionen in `src/lib/`. Kein DOM, keine Mocks, keine
  React-Testbibliothek. Environment `node`.
- **Playwright** gegen den **Produktions-Build** (nicht den Dev-Server) für alles, was einen
  Browser braucht.

Getragen wird das von einer Strukturregel, nicht von Disziplin: **was ohne I/O entscheidbar ist,
lebt in `src/lib/` und ist damit ohne Umgebung testbar.** Komponenten und Route Handler bleiben
Orchestrierung. Wenn ein Route Handler eine Bedingung enthält, die man auch ohne Request
auswerten könnte, sitzt sie an der falschen Stelle — und genau das macht die mittlere Teststufe
entbehrlich.

## Alternativen

**Testing Library plus jsdom für Komponenten.** Verworfen: jsdom ist kein Browser. Genau die
Dinge, die hier tatsächlich schiefgehen können — ob ein Token im gebauten Bundle ankommt, ob der
Theme-Wechsel ohne Blitz passiert, ob die selbst gehosteten Schriften greifen — kann jsdom nicht
beantworten. Ein Test, der grün ist und die interessante Frage nicht stellt, ist schlechter als
keiner.

**Playwright gegen `next dev`.** Schneller im Start, aber der Dev-Server zeigt nicht das echte
Bundle, nicht das echte Caching und nicht die echten Server-Komponenten. Gebaut wird deshalb im
npm-Script (`test:e2e` = `next build && playwright test`) und nicht im `webServer` der
Playwright-Konfiguration — sonst sagt ein Fehlschlag nicht, ob der Build oder der Server
gescheitert ist.

## Konsequenzen

- E2E-Dateien sind wie `docs/testplan.md` nummeriert (`a0-…`, `a1-…`), damit ein roter Test
  sofort einem Prüfpunkt zuzuordnen ist.
- Der Playwright-Browser wird **nicht** bei `pnpm install` geladen. Es sind einige hundert
  Megabyte, die nur auf Maschinen gebraucht werden, die die Suite auch ausführen. In CI ist der
  Download über den Playwright-Versionsschlüssel gecacht.
- Der erste Unit-Test ist keine Fingerübung, sondern prüft den Theme-Vertrag aus ADR 0001 —
  vollständige Tokens in beiden Blöcken und die tragende Reihenfolge. Er hätte den Fehler
  gefunden, der während der Entwicklung tatsächlich auftrat.

## Bewusst nicht enthalten

Eine Abdeckungsquote als Schwelle. Sie belohnt Tests für Getter und sagt nichts darüber, ob die
Invarianten geprüft sind. Was zählt, steht im Testplan.
