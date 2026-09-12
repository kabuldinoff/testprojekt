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

## Die Region ist keine Kosmetik

`vercel.json` legt `fra1` fest — Frankfurt. Die Datenbank steht in `eu-central-1`, ebenfalls
Frankfurt. Ohne diese Festlegung landen die Funktionen in der Voreinstellung `iad1` (Virginia),
und dann kostet **jede einzelne Datenbankabfrage** rund 150 ms Hin- und Rückweg über den
Atlantik. Eine Seite, die drei Abfragen macht, ist damit eine halbe Sekunde langsamer, ohne dass
eine Zeile Code schlecht wäre.

Der zweite Grund wiegt für dieses Produkt schwerer: Das Datenfluss-Panel sagt dem Nutzer, dass
seine Quellen in der EU indexiert werden. Liefe die Anwendung, die diese Daten anfasst, in
Virginia, wäre die Aussage bestenfalls die halbe Wahrheit.

JSON erlaubt keine Kommentare, deshalb steht die Begründung hier und nicht in der Datei.

## Zuerst ausrollen, dann fertigstellen

Das Deployment wurde bewusst **vorgezogen**, sobald das Produkt vorführbar war — statt es ans
Ende zu stellen, wo es im Plan stand.

Der Grund ist Risikoverteilung, nicht Ungeduld. Was bei einer Erstinbetriebnahme schiefgeht, hat
fast nie mit dem Code zu tun: fehlende Umgebungsvariablen, eine Funktionsregion, die nicht zur
Datenbank passt, Redirect-URLs, die noch auf `localhost` zeigen, ein Build, der lokal läuft und
dort nicht. Jede dieser Überraschungen ist in zehn Minuten behoben, wenn Zeit ist — und
unbezahlbar teuer, wenn keine mehr ist.

Der Preis ist, dass das Deployment zweimal angefasst wird. Der zweite Durchgang ist dann aber
Routine statt Erstinbetriebnahme.

## Umgebungsvariablen

`.env.example` listet, was gebraucht wird. In Vercel werden dieselben Namen als
Projektvariablen gesetzt. Zwei Fallen:

- `NEXT_PUBLIC_*` wird **zur Build-Zeit** ins Bundle eingebacken. Eine Änderung wirkt erst nach
  einem neuen Build, nicht nach einem Neustart.
- `SUPABASE_SECRET_KEY` darf **nie** ein `NEXT_PUBLIC_`-Präfix bekommen. Damit läge er im
  Browser-Bundle und wäre öffentlich.

Nicht gesetzt werden dürfen `GOOGLE_BASE_URL` und `MISTRAL_BASE_URL`. Sie existieren für den
Test-Stub und lenken die SDK-Aufrufe um — samt API-Schlüssel. `src/lib/env.ts` lässt deshalb nur
Loopback-Adressen zu und wirft sonst; siehe ADR 0006.

## Was außerhalb dieses Repos eingestellt werden muss

Vier Dinge stehen nicht im Code und werden beim ersten Ausrollen regelmäßig vergessen:

1. **Supabase → Authentication → URL Configuration.** Die _Site URL_ muss auf die
   Produktionsadresse zeigen, und `https://<domain>/auth/callback` gehört in die Liste der
   erlaubten Weiterleitungen.

   Das ist der teuerste Punkt auf dieser Liste, weil er **nicht scheitert, sondern schweigt.**
   Nachgemessen am lokalen Stack, Ziel jeweils als `?redirect_to=`:

   | angefordert                     | in der Mail      | HTTP |
   | ------------------------------- | ---------------- | ---- |
   | `…/auth/callback` (freigegeben) | dieselbe Adresse | 200  |
   | `…/irgendwo-anders`             | **die Site URL** | 200  |
   | `https://boese.example/abholen` | **die Site URL** | 200  |

   Fehlt der Eintrag, ersetzt GoTrue das Ziel stillschweigend durch die Site URL. Der
   Bestätigungscode landet dann auf der Startseite, wo ihn niemand einlöst, und verfällt — ohne
   Fehlermeldung, an keiner Stelle. Die letzte Zeile zeigt zugleich, wozu die Liste da ist: Ohne
   sie ließe sich ein Anmeldelink auf eine fremde Domain umbiegen.

   `supabase/config.toml` hält dieselbe Liste für den lokalen Stack; das Dashboard liest sie
   **nicht** von dort.

2. **Supabase → Authentication → Emails → Confirm signup.** Betreff und Inhalt aus
   `supabase/templates/confirmation.html` einfügen. Die gehostete Fassung liest keine Dateien aus
   dem Repo — die Datei ist die Quelle, das Dashboard die Kopie. Ohne diesen Schritt verschickt
   das Projekt die englische Standardvorlage von Supabase.

3. **Das E-Mail-Kontingent kennen.** Der eingebaute Mailer im kostenlosen Tarif verschickt
   **zwei Nachrichten pro Stunde, projektweit** — nicht pro Adresse. Gemessen: Nach zwei
   Registrierungen war auch eine völlig unbekannte Adresse blockiert. Die Anwendung nennt das
   inzwischen beim Namen (`src/lib/auth/messages.ts`), aber für eine Vorführung heißt es: nicht
   kurz vorher testweise registrieren. Wer mehr braucht, hinterlegt eigenes SMTP; das ist bewusst
   nicht eingerichtet.

4. **Vercel → Settings → Functions.** Die Region muss `fra1` sein. `vercel.json` legt das fest;
   die Einstellung im Dashboard sollte damit übereinstimmen, sonst ist unklar, welche gilt.

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
