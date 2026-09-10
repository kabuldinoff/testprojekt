-- ═══════════════════════════════════════════════════════════════════════════
-- Heartbeat — hält das Projekt im kostenlosen Tarif wach.
--
-- Supabase pausiert ein Free-Projekt nach etwa einer Woche ohne
-- Datenbankaktivität. Ein pausiertes Projekt bedeutet einen toten Link genau
-- dann, wenn ihn jemand zum ersten Mal öffnet.
--
-- Zwei unabhängige Netze, absichtlich verschieden:
--   1. pg_cron schreibt hier hinein — braucht keinen externen Dienst und kann
--      von außen nicht abgeschaltet werden.
--   2. Ein GitHub-Actions-Lauf liest über die REST-API — ein echter externer
--      Request, und damit zweifelsfrei "user database activity".
--
-- Die Tabelle enthält bewusst nichts als einen Zeitstempel. Sie ist Infra-
-- struktur, keine Anwendungsdaten.
-- ═══════════════════════════════════════════════════════════════════════════

-- pg_cron und pg_net gehören in die Migration, nicht nur ins Dashboard.
-- Im Dashboard aktiviert gilt es für genau ein Projekt; hier gilt es für jede
-- Umgebung, in der die Migrationen laufen — den lokalen Stack eingeschlossen.
-- Ohne das scheitert `supabase start` an "schema cron does not exist", und die
-- Migration wäre nur auf der einen Datenbank lauffähig, auf der jemand einmal
-- den richtigen Schalter umgelegt hat.
create extension if not exists pg_cron;

-- Wird noch nicht benutzt, gehört aber hierher: pg_net erlaubt es pg_cron
-- später, den Ingestion-Reaper per HTTP zurück in die App zu rufen. Eine
-- Erweiterung nachträglich einzuschalten ist ein Deploy-Schritt mehr.
create extension if not exists pg_net with schema extensions;

create table public.heartbeat (
  id smallint primary key default 1 check (id = 1), -- genau eine Zeile, für immer
  at timestamptz not null default now()
);

insert into public.heartbeat (id, at) values (1, now());

alter table public.heartbeat enable row level security;

-- Lesbar für jeden, auch unangemeldet: der GitHub-Actions-Lauf hat kein Konto
-- und benutzt den Publishable Key. Der Inhalt ist ein Zeitstempel — es gibt
-- nichts zu schützen, und eine Policy, die "wirklich nichts Geheimes" sagt,
-- ist ehrlicher als eine Ausnahme im Anwendungscode.
create policy "heartbeat: für alle lesbar"
  on public.heartbeat for select to anon, authenticated
  using (true);

grant select on public.heartbeat to anon, authenticated;

-- Geschrieben wird ausschließlich von pg_cron, das als Superuser läuft und an
-- RLS vorbeigeht. Es gibt deshalb bewusst keine insert/update-Policy: kein
-- Client soll hier je schreiben können.
-- unschedule zuerst: cron.schedule wirft bei einem bereits existierenden Job
-- nicht, überschreibt ihn aber auch nicht zuverlässig. So ist die Migration
-- wiederholbar, was sie sein muss — `supabase db reset` läuft im Alltag oft.
select cron.unschedule('heartbeat')
where exists (select 1 from cron.job where jobname = 'heartbeat');

select cron.schedule(
  'heartbeat',
  '17 4 */2 * *', -- alle zwei Tage, 17 nach, um die volle Stunde zu meiden
  $$ update public.heartbeat set at = now() where id = 1 $$
);
