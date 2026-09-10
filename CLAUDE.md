@AGENTS.md

# Notabene — Regeln für die Arbeit an diesem Repo

Ein Rechercheassistent: Nutzer legen Notebooks an, laden Quellen hoch (PDF, Text, Markdown,
URL, eingefügter Text) und stellen Fragen dazu. Jede Antwort ist mit klickbaren Inline-Zitaten
belegt, ein Klick öffnet die Quelle an der exakten Textstelle. Dazu ein Studio, das aus den
ausgewählten Quellen einen zweistimmigen Audio-Überblick erzeugt.

Stack: **Next.js 16 (App Router) · TypeScript · Supabase (Postgres + pgvector, Auth, Storage) ·
Tailwind CSS v4 · Vercel AI SDK v7**. Gehostet auf Vercel (`fra1`), Datenbank in `eu-central-1`.

Die eine Leitlinie, aus der alles Folgende hergeleitet ist:

> **Jede Zeile muss in einem Satz erklärbar sein — inklusive der Begründung, warum es nicht
> anders gemacht wurde.**

Daraus folgt: lieber eine Lösung weniger, dafür mit Grund. Lieber eine handgeschriebene
SQL-Migration mit Kommentaren als ein generiertes Schema. Lieber ein Test, der eine Invariante
beweist, als drei, die Getter abklopfen.

`AGENTS.md` oben wird von `next dev` selbst geschrieben und enthält die Next-16-Hinweise; diese
Datei hier ergänzt die Projektregeln.

## Struktur

- **`src/app/`** — Routen. `app/**` ist authentifiziert und trägt `noindex`; alles außerhalb
  ist öffentlich und statisch. Die Trennung ist nicht kosmetisch: die öffentliche Seite hält die
  Lighthouse-Werte, weil sie **kein Client-JS außer Theme-Umschalter und Anmeldeknopf** lädt.
  Der Chat-Client und der PDF-Betrachter dürfen ausschließlich unter `(app)/` und nur per
  `next/dynamic` geladen werden — `pdfjs-dist` allein wiegt rund ein Megabyte.
- **`src/app/globals.css`** — die Design-Tokens. Zwei Ebenen: semantische Variablen pro Theme,
  darüber `@theme inline`, das `--color-*` darauf mappt. **Der Dark-Block muss vor `.light`
  stehen** — `:root`, `.dark` und `.light` haben dieselbe Spezifität, bei Gleichstand gewinnt die
  spätere Regel; andersherum wird der Umschalter wirkungslos, ohne Fehlermeldung.
  Geprüft von `src/lib/__tests__/theme-tokens.test.ts`.
- **`src/components/`** — wiederverwendbare Komponenten. Dünne Schale: Orchestrierung, kein
  ableitbares Verhalten. Was ohne I/O entscheidbar ist, gehört nach `src/lib/`.
- **`src/lib/`** — reiner Kern. Jede nicht-triviale Funktion hier ist ohne Netz, ohne Datenbank
  und ohne Browser testbar und hat einen Test in `__tests__/` daneben. Das ist die Regel, die
  Testbarkeit überhaupt erst ermöglicht — nicht eine Abdeckungsquote.
- **`e2e/`** — Playwright. Dateinamen nummeriert wie `docs/testplan.md` (`a0-…`, `a1-…`), damit
  ein roter Test sofort einem Prüfpunkt zuzuordnen ist. Die Suite läuft **ausschließlich gegen
  den lokalen Supabase-Stack**: sie legt Konten an und schreibt Zeilen. `scripts/e2e.mjs` holt
  die Zugangsdaten aus `supabase status` und bricht ab, wenn nichts läuft — damit kann sie gar
  nicht versehentlich auf die echte Datenbank zeigen.
- **`supabase/migrations/`** — handgeschriebenes SQL, durchnummeriert. Über jeder Policy und
  jedem Index steht der Grund. Die Migrationen sind **wiederholbar**: `supabase db reset` läuft
  im Alltag oft, also darf keine an einem bereits vorhandenen Objekt scheitern.
  Erweiterungen (`vector`, `pg_cron`, `pg_net`) werden hier angelegt, nicht im Dashboard —
  im Dashboard gilt es für ein Projekt, hier für jede Umgebung.
- **`design/`** — der Design-Canvas. Verbindliche Referenz für Farben, Radien und Schriften,
  entstanden vor der ersten Komponente. Bewusst **nicht** gitignoriert.
- **`docs/adr/`** — jede Entscheidung, die jemand hinterfragen könnte, mit Kontext, Alternativen
  und Konsequenzen. Eine bewusste Nicht-Entscheidung gehört genauso hinein.
- **`_intern/`** — gitignoriert, gehört nicht zur Abgabe. Nie in den Index aufnehmen.

## Befehle

```
pnpm dev              Entwicklungsserver
pnpm verify           format:check + lint + typecheck + test — das Tor vor jedem Commit
pnpm test             Vitest (reine Funktionen)
pnpm supabase:start   lokaler Postgres/Auth/Storage in Docker (Ports 5442x)
pnpm test:e2e         lokaler Stack → Produktions-Build → Playwright
pnpm supabase:reset   lokale Datenbank leeren und alle Migrationen neu anwenden
pnpm format           Prettier schreiben
```

`pnpm typecheck` ruft zuerst `next typegen` auf. Ohne das fehlen die generierten Route-Typen
(`LayoutProps`, `PageProps`) und `tsc` scheitert auf einem frischen Clone.

## Konventionen

- **Sprache**: Code, Bezeichner, Dateinamen und Commit-Nachrichten Englisch. Deutsch bleiben
  UI-Texte, Fehlermeldungen, LLM-Prompts und Testnamen.
- **Commits**: Conventional Commits, kleingeschrieben, der Betreff beschreibt das _Verhalten_,
  nicht die Datei. Eine Scheibe = ein Commit. Gearbeitet wird auf Branches, gemergt über Pull
  Requests, damit der Review-Verlauf in der Historie steht.
- **YAGNI ist eine harte Regel, keine Empfehlung.** Kein Plugin-System, kein Adapter-Interface,
  keine Abstraktion „für später". Bei zwei Anbietern sind zwei Einträge in einem typisierten
  Record die richtige Antwort, keine Registry-Architektur.
- **Abhängigkeiten**: ESLint bleibt auf 9 und TypeScript auf 5, obwohl 10 bzw. 7 verfügbar sind.
  Das ist geprüft, nicht bequem: `eslint-plugin-react@7.37.5` — transitiv über
  `eslint-config-next` — stirbt unter ESLint 10 mit
  `contextOrFilename.getFilename is not a function`. Siehe `docs/adr/0002-toolchain-versionen.md`.

## Design

- Komponenten benutzen **ausschließlich semantische Utilities** (`bg-surface`, `text-ink`,
  `border-hairline`), niemals einen Hex-Wert und **keinen einzigen `dark:`-Prefix**. Die Palette
  ist einmal definiert und wird unter `.light` überschrieben. Ohne diese Regel zerfällt Dark Mode
  in dreihundert Einzelfälle. Einzige Ausnahme sind die Hilfsklassen `.only-dark` / `.only-light`
  in `globals.css`, die der Theme-Umschalter braucht, um ohne State auszukommen.
- **Dark ist der Default**, auch für Erstbesucher. Die Landing Page wird gegen `#0E1424`
  entworfen und gemessen, nicht gegen Weiß.
- **Gold (`--accent`) ist Akzent, nicht Zweitfarbe** — erlaubt an genau drei Stellen: aktives
  Zitat-Highlight, „Quelle bereit"-Badge, Studio-Akzentlinie. Ohne diese Grenze wird aus einem
  Akzent innerhalb von zwei Wochen eine zweite Primärfarbe.
- **Jeder Zustand hat eine Darstellung**: leer, ladend, fehlgeschlagen. Jeder Fehler nennt den
  Grund und bietet genau eine Handlung an. Nie „Etwas ist schiefgelaufen". Eine
  Sackgassen-Fehlermeldung ist ein Fehler, kein Schönheitsmangel.
- Skeletons haben die Maße des echten Inhalts, sonst zählt der Sprung als CLS.

## Kommentare

Der Code wird in einem Gespräch Zeile für Zeile durchgegangen. Kommentare sind hier deshalb
tragend, nicht dekorativ.

- Kommentare erklären **warum**, nie **was**. `// increment i` ist verboten.
  `// (select auth.uid()) statt auth.uid(): erzeugt einen InitPlan, sonst pro Zeile ausgewertet`
  ist Pflicht.
- **Jede SQL-Migration** trägt über jeder Policy und jedem Index den Grund.
- **Jede nicht offensichtliche Zahl** ist eine benannte Konstante mit Kommentar: Chunk-Größe,
  Overlap, `rrf_k`, Embedding-Dimension, Lease-Dauer, Audio-Deckel.
- **Jede Abweichung vom Naheliegenden** verweist auf ihren ADR.
- Jede nicht-triviale Datei hat einen Kopfkommentar: ein Satz, was sie tut — und was sie bewusst
  _nicht_ tut.

## Sicherheits-Invarianten

Diese Regeln gelten ab der Datenbank-Scheibe und sind nicht verhandelbar.

- **RLS auf jeder Tabelle, mit echten Policies.** Kein „deny-all und Autorisierung in der App":
  dann ist jede neue Route eine neue Gelegenheit, die Prüfung zu vergessen.
- In jeder Policy: **`(select auth.uid())`** statt `auth.uid()` (InitPlan statt Auswertung pro
  Zeile), **immer `to authenticated`** (sonst wird die Policy auch für `anon` evaluiert) und
  **immer ein Index auf der Spalte, nach der die Policy filtert**.
- **Der `service_role`-Client (`src/lib/supabase/admin.ts`) wird ausschließlich im
  Ingestion-Worker benutzt**, und erst nachdem die aufrufende Route den Besitz über den
  RLS-Client verifiziert hat. `src/lib/__tests__/admin-client-isolation.test.ts` folgt dem
  Import-Graph und schlägt fehl, sobald er aus `src/app/**` erreichbar wird — auch indirekt
  über eine Zwischenschicht. Die Fehlermeldung zeigt die ganze Kette.
- **Drei Ebenen, absichtlich verschieden:** die Middleware leitet um (Bequemlichkeit), das
  Layout unter `src/app/app/` prüft beim Rendern (Korrektheit), RLS in der Datenbank ist die
  eigentliche Grenze (Sicherheit). Fielen die ersten beiden aus, käme trotzdem nichts heraus.
- **`getUser()`, nie `getSession()`,** wo über Zugriff entschieden wird. `getSession` liest das
  Cookie und vertraut ihm; `getUser` prüft die Signatur beim Auth-Server.
- **Das Projekt wurde ohne „automatically expose new tables" angelegt.** Neue Tabellen sind für
  die Data-API zunächst unsichtbar; jeder Zugriff wird pro Tabelle per `grant` bewusst gewährt.
  Für `anon` ergibt eine Abfrage auf `notebooks` deshalb `401 permission denied` und nicht etwa
  eine leere Liste — RLS ist damit das zweite Netz, nicht das einzige.
- **Datenbankfunktionen, die PostgREST exponiert, sind `SECURITY INVOKER`.** Mit
  `SECURITY DEFINER` liefen sie als `postgres`, umgingen RLS und wären ein Datenleck mit
  Aufruf-Interface.
- **Fehlender Zugriff ergibt 404, nie 403.** Ein 403 bestätigt, dass die Ressource existiert.
- **Nie stumm scheitern.** Fehler werden als `status='failed'` samt `error_message` persistiert.
- Beim URL-Import holt der Server eine vom Nutzer angegebene Adresse: `localhost`, `127.0.0.0/8`,
  `169.254.169.254`, private Netze und Nicht-HTTP(S)-Schemata werden **vor** dem Abruf abgelehnt,
  die Antwortgröße gedeckelt.
- Quelltext aus Dokumenten ist Daten, nie Anweisung. Er wird klar vom System-Prompt getrennt und
  niemals als HTML gerendert.

## Plattform-Grenzen, die das Design bestimmen

Keine davon ist Detailwissen — jede hat eine Architekturentscheidung erzwungen.

- **Vercel begrenzt Request- und Response-Bodies auf 4,5 MB.** Deshalb lädt der Browser per
  Signed URL direkt in Supabase Storage hoch, und die Route bekommt nur den Pfad. Audio wird aus
  demselben Grund per Signed URL ausgeliefert, nie durch eine Function.
- **Funktionslaufzeit auf Hobby: 300 s.** `export const maxDuration = 300` auf Ingestion und TTS.
- **`after()` ist fire-and-forget.** Ohne Lease und Versuchszähler in der Tabelle plus einen
  `pg_cron`-Reaper hängt eine abgebrochene Verarbeitung für immer auf „processing".
- **pgvector indiziert höchstens 2000 Dimensionen**, und approximative Indizes filtern _nach_ dem
  Scan — RLS ist ein Filter. Ein HNSW-Index würde bei mehreren Notebooks den Recall still
  zusammenbrechen lassen. Deshalb zunächst kein Vektor-Index; siehe `docs/adr/`.
- **Supabase Free pausiert nach etwa einer Woche ohne Datenbankaktivität**, und der Storage
  fasst 1 GB. Deshalb der doppelte Keepalive und der 3-Minuten-Deckel auf Audio.
