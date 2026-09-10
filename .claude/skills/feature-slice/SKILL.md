---
name: feature-slice
description: Eine vertikale Scheibe von der Migration bis zum Test fertigstellen — Migration, RLS-Policy, Datenbankfunktion, Route Handler, UI, Unit- und E2E-Test, ADR, Commit. Verwenden, wenn eine neue Funktion gebaut wird, wenn der require-tests-Hook nachfragt, oder wenn jemand "Scheibe", "Slice" oder "neues Feature" sagt.
---

# Eine Scheibe fertigstellen

Eine Scheibe ist nicht fertig, wenn sie funktioniert, sondern wenn sie erklärbar ist. Diese
Reihenfolge ist kein Vorschlag: sie steht so da, weil jeder Schritt den nächsten absichert.

## 0 · Vorbedingungen

Bevor irgendetwas geschrieben wird, drei Sätze in den Scratchpad:

1. **Was kann der Nutzer danach, was vorher nicht ging?** Ein Satz, aus Nutzersicht. Wenn er
   sich nicht formulieren lässt, ist es keine Scheibe, sondern ein Refactoring — dann gilt
   dieses Skill nicht.
2. **Was ist bewusst nicht drin?** Wird später zum Abschnitt „Bewusst nicht enthalten" im ADR.
3. **Welche Invariante aus CLAUDE.md ist betroffen?** Meist eine der Sicherheits-Invarianten.

`pnpm verify` muss grün sein, bevor es losgeht. Auf einer roten Basis zu bauen kostet später
die doppelte Zeit beim Suchen.

## 1 · Datenbank zuerst

Neue Tabelle oder Spalte → Migration in `supabase/migrations/`, handgeschrieben und
durchnummeriert.

Über **jeder** Policy und **jedem** Index steht der Grund als SQL-Kommentar. Die Migration wird
im Gespräch vorgelesen — sie ist Dokumentation, die zufällig ausführbar ist.

Danach `rls-review` aufrufen. Nicht überspringen, auch nicht bei einer „offensichtlichen"
Tabelle: genau dort wird die Policy für `UPDATE` vergessen.

## 2 · Reiner Kern vor der Schale

Alles, was ohne Netz, Datenbank und Browser entscheidbar ist, kommt zuerst — als reine Funktion
in `src/lib/`, mit dem Test daneben in `__tests__/`.

Chunking, Ranking, Zitat-Parsing, Kostenrechnung, Validierung: alles gehört hierher. Wenn ein
Route Handler eine Bedingung enthält, die man auch ohne Request auswerten könnte, sitzt sie an
der falschen Stelle.

## 3 · Route Handler

Nur Orchestrierung: Eingabe mit Zod validieren, Zugriff prüfen, reine Funktion rufen, antworten.

- Zugriff über den RLS-Client. Der `service_role`-Client ist ausschließlich im Ingestion-Worker
  erlaubt und erst, nachdem der Besitz verifiziert wurde.
- Fehlender Zugriff → **404, nie 403.**
- Lang laufende Arbeit → `after()` plus Zustandsspalte, nie inline. Und dann braucht sie Lease
  und Versuchszähler, sonst hängt sie bei einem Abbruch für immer.
- Fehler werden persistiert, nicht geloggt und vergessen.

## 4 · UI

Vorher in `design/canvas.html` nachsehen. Wenn das Muster dort existiert, wird es übernommen und
nicht neu erfunden; wenn nicht, kommt es erst in den Canvas.

- Nur semantische Utilities. Kein Hex-Wert, kein `dark:`.
- **Alle drei Zustände** gestalten: leer, ladend, fehlgeschlagen. Der Fehlerzustand nennt den
  Grund und bietet genau eine Handlung an.
- Interaktive Elemente sind echte `<button>` mit zugänglichem Namen. Gestreamte Bereiche tragen
  `aria-live="polite"`, sonst hören Screenreader nichts.
- Skeletons in den Maßen des echten Inhalts.

## 5 · Tests

Beides, nicht eines:

- **Unit** in `src/lib/**/__tests__/` — die reine Funktion, inklusive der Randfälle, die den
  Ausschlag gaben.
- **E2E** in `e2e/`, nummeriert wie `docs/testplan.md`. Er prüft das Versprechen der Scheibe aus
  Nutzersicht, nicht die Implementierung.

Berührt die Scheibe Zugriffsrechte, wird `e2e/a2-rls-isolation.spec.ts` erweitert — ein zweiter
Nutzer muss beweisbar nichts sehen.

## 6 · ADR

Jede Entscheidung, die jemand hinterfragen könnte, kommt nach `docs/adr/` — mit Kontext,
**Alternativen und warum sie es nicht wurden**, und Konsequenzen. Der Abschnitt „Bewusst nicht
enthalten" aus Schritt 0 gehört ans Ende.

Eine Entscheidung ohne verworfene Alternative liest sich wie Zufall.

## 7 · Übergabe

`pnpm verify` und `pnpm test:e2e` grün. Dann ein Commit:

```
<type>(<scope>): <was der Nutzer jetzt kann — nicht welche Datei sich änderte>

<Absatz: warum so und nicht anders>

- <Datei oder Baustein>: <was er tut>
tests: <Unit- und E2E-Test, die das absichern>
```

Danach Pull Request mit einem Rumpf, der Ziel, Entscheidungen und Tests nennt. CodeRabbit
reviewt automatisch. Befunde entweder beheben — oder **mit Begründung im Thread ablehnen**. Ein
Repo, in dem jeder Bot-Kommentar wortlos übernommen wurde, zeigt Gehorsam; einer mit einem guten
Gegenargument zeigt Urteilsvermögen.
