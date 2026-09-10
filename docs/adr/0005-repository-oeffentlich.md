# 0005 — Das Repository ist öffentlich

**Datum:** 2026-09-10 · **Status:** angenommen

## Kontext

Das Repository lief zunächst privat. Drei Dinge sprachen dafür, das zu ändern — und zwei davon
waren keine Bequemlichkeit, sondern Funktionsverlust.

**Der automatische Review lief nicht.** CodeRabbit meldete zwar eine Zusammenfassung, aber keine
einzige zeilenweise Anmerkung, mit dem Hinweis „the PR author is not assigned a seat". Dazu ein
Kontingent von einem Review pro Stunde, das jeder Push zurücksetzte. Für öffentliche
Repositories entfällt beides: voller Funktionsumfang, kein Sitzplatzproblem, keine Drosselung.
Der erste Lauf nach der Umstellung lieferte 19 Befunde, darunter ein echter Open Redirect
(`docs/adr/0004` verweist auf den Vorgang).

**GitHub-Actions-Minuten.** Private Repositories haben 2.000 Minuten im Monat, öffentliche
keine Grenze. Die e2e-Suite startet einen Supabase-Stack; das summiert sich.

**Und es muss ohnehin öffentlich sein.** Wer den Link bekommt, soll ihn öffnen können, ohne
vorher eine Einladung anzunehmen.

## Entscheidung

Öffentlich, ab dem 10.09.2026.

Vor der Umstellung wurde die **gesamte Historie** geprüft, nicht nur der aktuelle Stand — was
einmal in einem Commit stand, bleibt über die Events-API und über Forks abrufbar, auch nach
einem Force-Push:

- Kein Schlüsselmuster in 16 Commits (bekannte Präfixe plus die allgemeine Regel aus
  `.claude/hooks/no-secrets.sh`)
- Keine Zuweisung an einen geheim klingenden Namen mit echtem Wert
- Nichts aus `_intern/` je committet, `.env.local` nie
- Keine Nennung früherer Arbeitgeber, Kunden oder Projekte

## Konsequenzen

- **Die Commit-Historie ist Teil der Abgabe.** Sie war es vorher schon gedacht, jetzt ist sie es
  tatsächlich. Das ist der Grund, warum Commits eine Begründung tragen und nicht nur eine
  Dateiliste.
- **Geplante Workflows werden nach 60 Tagen ohne Repo-Aktivität deaktiviert** — eine Regel, die
  nur für öffentliche Repositories gilt. Betrifft `keepalive.yml`; steht dort als Kommentar und
  in `docs/deployment.md`.
- **Die in den Commits hinterlegte E-Mail-Adresse ist öffentlich.** Bewusst in Kauf genommen; wer
  das nicht möchte, nimmt GitHubs `noreply`-Adresse.
- Der `no-secrets`-Hook bleibt scharf und prüft seit `956fa85` auch den ausgehenden
  Commit-Bereich, nicht nur den Arbeitsbaum. Bei einem öffentlichen Repository ist der
  Unterschied nicht theoretisch.

## Was daran nicht offen ist

Die Anwendung selbst. Notebooks, Quellen und Chats liegen hinter Auth und RLS; öffentlich ist
der Quelltext, nicht die Daten. `docs/adr/0004` beschreibt, warum die Datenbank diese Grenze
zieht und nicht der Anwendungscode — bei offenem Quelltext ist das keine Feinheit mehr, sondern
die Voraussetzung dafür, dass Offenlegung überhaupt vertretbar ist.
