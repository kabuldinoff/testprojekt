# Deployment

Zwei Dinge müssen in Produktion ankommen, und sie kommen auf **verschiedenen Wegen** dorthin.
Das ist Absicht.

| Was             | Weg                         | Ausgelöst durch             |
| --------------- | --------------------------- | --------------------------- |
| Anwendung       | Vercel baut aus `main`      | automatisch bei jedem Merge |
| Datenbankschema | `supabase db push` von Hand | ein Mensch, bewusst         |

## Warum das Schema nicht automatisch mitgeht

Die naheliegende Frage lautet: Migrationen liegen doch im selben Repository — warum wendet sie
niemand automatisch an, wenn sie auf `main` landen?

Weil ein Anwendungs-Deploy und eine Schemaänderung sich in einem Punkt grundlegend
unterscheiden: **ein Deploy ist zurücknehmbar, eine Migration nicht.** Ein fehlerhafter Build
wird durch den vorherigen ersetzt und die Sache ist erledigt. Ein `drop column`, das durchlief,
ist durch kein Rollback der Welt rückgängig zu machen — die Daten sind weg. Was automatisch
passiert, passiert auch nachts um zwei, wenn ein Merge durchrutscht.

Supabase bietet eine GitHub-Integration an, die genau das automatisiert. Sie ist beim Anlegen
des Projekts bewusst **nicht** verbunden worden. Der Preis ist ein Handgriff pro Schemaänderung;
der Gegenwert ist, dass jede Schemaänderung einen Zeitpunkt und eine Person hat.

Für ein größeres Team mit mehreren Umgebungen wäre die Rechnung eine andere. Dann gehörte die
Automatisierung dazu — zusammen mit einer Staging-Datenbank, gegen die sie zuerst läuft.

## Schema ausrollen

Einmalig pro Maschine:

```bash
supabase login                                 # öffnet den Browser
supabase link --project-ref <projekt-ref>      # fragt nach dem Datenbank-Passwort
```

Danach, für jede Änderung:

```bash
supabase db reset        # lokal: Datenbank neu aufbauen, alle Migrationen anwenden
pnpm test:e2e            # lokal grün?
supabase db diff         # zeigt, was gegenüber der Produktionsdatenbank fehlt
supabase db push         # anwenden
```

`supabase db diff` vor `push` ist kein optionaler Schritt. Er ist der Moment, in dem man sieht,
was gleich unwiderruflich passiert.

## Migrations-Disziplin

- **Eine angewandte Migration wird nicht mehr geändert.** Sie bekommt eine Nachfolgerin. Eine
  nachträglich editierte Migration läuft auf keiner Datenbank erneut — die Umgebungen laufen
  dann auseinander, und niemand merkt es, bis etwas Fremdes passiert.
- **Kein `if not exists` auf jedem DDL.** Migrationen laufen genau einmal gegen eine Datenbank;
  Supabase führt darüber Buch in `supabase_migrations.schema_migrations`. Eine Kollision ist ein
  Signal, kein Ärgernis — sie zu unterdrücken verdeckt sie nur.
- **Erweitern, wandern, verengen.** Eine Spalte umzubenennen heißt: neue Spalte anlegen, beide
  eine Version lang schreiben, dann die alte entfernen. Sonst ist der Moment zwischen Migration
  und Deploy ein Ausfall.
- **Was für die Sicherheit zählt, gehört in die Migration** und nicht in eine Einstellung im
  Dashboard. Ein Häkchen gilt für ein Projekt und ist in keinem Diff sichtbar; eine Migration
  gilt für jede Umgebung, in der sie läuft. Aus genau diesem Grund stehen `create extension` und
  das `revoke` der Standard-Grants in `0001` — die lokale und die gehostete Datenbank hatten
  vorher unterschiedliche Zugriffsregeln, und ein Test lieferte deshalb lokal `401` und in CI
  `200`.

## Umgebungsvariablen

`.env.example` listet, was gebraucht wird. In Vercel werden dieselben Namen als
Projektvariablen gesetzt. Zwei Fallen:

- `NEXT_PUBLIC_*` wird **zur Build-Zeit** ins Bundle eingebacken. Eine Änderung wirkt erst nach
  einem neuen Build, nicht nach einem Neustart.
- `SUPABASE_SECRET_KEY` darf **nie** ein `NEXT_PUBLIC_`-Präfix bekommen. Damit läge er im
  Browser-Bundle und wäre öffentlich.

## Die Datenbank wach halten

Supabase pausiert ein Projekt im kostenlosen Tarif nach etwa einer Woche ohne
Datenbankaktivität. Ein pausiertes Projekt bedeutet einen toten Link genau dann, wenn ihn jemand
zum ersten Mal öffnet.

Zwei unabhängige Netze:

1. **`pg_cron` in der Datenbank selbst** (`supabase/migrations/…heartbeat.sql`) — braucht keinen
   externen Dienst und lässt sich von außen nicht abschalten.
2. **`.github/workflows/keepalive.yml`** — ein echter externer HTTP-Request alle zwei Tage, und
   damit zweifelsfrei „user database activity" im Sinne von Supabase.

⚠️ GitHub deaktiviert geplante Workflows in öffentlichen Repositories nach **60 Tagen** ohne
Repo-Aktivität. Das Repository ist öffentlich (siehe `docs/adr/0005`), die Regel gilt hier also.
Verschwindet der Lauf still, ist das der Grund — im Actions-Tab wieder einschalten.
