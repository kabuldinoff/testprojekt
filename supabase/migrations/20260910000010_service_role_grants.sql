-- ═══════════════════════════════════════════════════════════════════════════
-- Rechte für den Verarbeitungslauf — ausdrücklich, und lokal wie in Produktion
-- dieselben.
--
-- ── Wie das aufgefallen ist ───────────────────────────────────────────────
--
-- Beim ersten Durchstich gegen die Live-Umgebung blieb jede Quelle auf
-- `pending` stehen. Die Ursache stand nicht im Anwendungsprotokoll, sondern in
-- der Datenbank: `service_role` hatte auf **keiner** Tabelle Rechte.
--
--     permission denied for table sources          (SQLSTATE 42501)
--
-- Der Grund ist eine Entscheidung aus Migration 0001, die weiter reicht als
-- beabsichtigt. Das Projekt wurde ohne „automatically expose new tables"
-- angelegt, damit neue Tabellen nicht versehentlich über die Data-API
-- erreichbar sind. Diese Einstellung betrifft aber nicht nur `anon` und
-- `authenticated` — sie schaltet die Standardrechte für **alle** diese Rollen
-- ab, `service_role` eingeschlossen.
--
-- Lokal fiel das nie auf, weil die Supabase-CLI ihrer lokalen Datenbank diese
-- Rechte ohnehin gibt. Es ist derselbe Riss wie bei `claim_source` in
-- Migration 0006, nur größer: eine Umgebungsdifferenz, die kein Test sehen
-- konnte, weil beide Umgebungen verschieden waren.
--
-- ── Warum das hier nicht einfach „alles gewähren" heißt ───────────────────
--
-- Der naheliegende Weg wäre `grant all on all tables to service_role` gewesen.
-- Er hätte das Symptom behoben und den Riss gelassen: lokal großzügig, in
-- Produktion knapp, und beim nächsten Mal fällt es wieder erst live auf.
--
-- Deshalb wird hier **zuerst entzogen und dann einzeln gewährt**. Danach gilt
-- lokal dasselbe wie in Produktion, und `e2e/b2-upload-ingest` prüft es bei
-- jedem Lauf mit: vergisst eine spätere Migration das Recht für eine neue
-- Tabelle, wird die Verarbeitung rot — auf dem Entwicklungsrechner, nicht im
-- Live-Betrieb.
--
-- Das ist zugleich die ehrlichere Aussage über `service_role`: Diese Rolle
-- umgeht RLS vollständig. Was sie darf, sollte man aufzählen können.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on all tables in schema public from service_role;

-- Auch für künftige Tabellen. Ohne diese Zeile bekäme die nächste Migration
-- ihre Rechte lokal geschenkt und in Produktion nicht — genau der Riss, den
-- diese Migration schließt.
alter default privileges in schema public revoke all on tables from service_role;

-- ── Was der Verarbeitungslauf tatsächlich anfasst ─────────────────────────
-- Abgeleitet aus src/lib/sources/ingest.ts und src/lib/llm/usage.ts. Jede
-- Zeile hier entspricht genau einem Zugriff dort.

-- Zustand, Lease und Versuchszähler fortschreiben (claim, fail, finish).
--
-- `select` gehört dazu, obwohl der Anwendungscode `sources` nie liest: Die
-- Übernahme läuft über `claim_source`, und die Funktion endet auf
-- `update … returning`. Ein RETURNING gibt Spalten zurück und verlangt dafür
-- Leserecht — mit `update` allein scheitert sie mit
-- `permission denied for table sources`, obwohl der Schreibzugriff erlaubt
-- ist. `claim_source` ist zudem SECURITY INVOKER und läuft damit unter genau
-- dieser Rolle.
--
-- Nachgemessen: mit `grant update` allein waren fünf e2e-Tests rot.
grant select, update on public.sources to service_role;

-- Den Besitzer nachschlagen, damit der Verbrauch der richtigen Person
-- zugeordnet wird.
grant select on public.notebooks to service_role;

-- Abschnitte neu schreiben: erst die alten löschen, dann die neuen anlegen.
-- Ein zweiter Lauf soll wiederholbar sein, nicht additiv.
--
-- `select` gehört auch hier dazu, und aus demselben Grund wie oben bei
-- `sources`: Ein `delete … where source_id = …` liest die Spalte in der
-- Bedingung, und Postgres verlangt dafür Leserecht. Mit `insert, delete`
-- allein antwortet PostgREST mit
-- `403 permission denied for table source_chunks` — obwohl das Löschen
-- ausdrücklich gewährt ist.
--
-- Das ist die Stelle, an der eine Rechteliste unintuitiv wird: Schreibrechte
-- reichen nicht, sobald man auswählt, *was* geschrieben oder gelöscht wird.
-- Nachgemessen, nicht überlegt — der Fehler kam als roter e2e-Test.
grant select, insert, delete on public.source_chunks to service_role;

-- Das Verbrauchsprotokoll. Nur schreiben — gelesen wird es vom Nutzer selbst
-- über seine eigene Policy.
grant insert on public.llm_calls to service_role;

-- Nicht gewährt und bewusst nicht: `messages`, `notes`, `profiles`,
-- `heartbeat`. Der Verarbeitungslauf hat dort nichts zu suchen, und eine
-- Rolle, die RLS umgeht, soll nicht mehr können als sie braucht.
--
-- Storage steht nicht in `public` und ist von diesen Zeilen unberührt: der
-- Download der hochgeladenen Datei läuft über die Storage-API, wo
-- `service_role` seine eigene Sonderstellung hat.
