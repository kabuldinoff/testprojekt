-- ═══════════════════════════════════════════════════════════════════════════
-- Grundlage: Erweiterungen, das Profil zu jedem Konto, und der Zugriffshelfer.
--
-- Zwei Regeln gelten ab hier für jede Tabelle im Projekt und stehen deshalb
-- hier einmal ausführlich:
--
--   (select auth.uid())  statt  auth.uid()
--     Der Wrapper macht aus dem Funktionsaufruf einen InitPlan: Postgres wertet
--     ihn einmal pro Statement aus statt einmal pro Zeile. Bei einem Scan über
--     zehntausende Chunks ist das später der dominierende Kostenfaktor.
--
--   to authenticated
--     Ohne Rollenangabe wird die Policy auch für die anon-Rolle evaluiert.
--     Unnötige Arbeit, und eine Einladung für den nächsten Fehler.
--
-- Dazu kommt: das Projekt wurde mit abgeschaltetem "expose new tables"
-- angelegt. Neue Tabellen sind für die Data-API also zunächst unsichtbar, und
-- jeder Zugriff wird pro Tabelle bewusst gewährt. Deshalb steht unter jeder
-- Tabelle ein eigener grant-Block.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Die Data-API liefert nichts von selbst aus ─────────────────────────────
-- Auf dem gehosteten Projekt ist das eine Einstellung beim Anlegen
-- ("automatically expose new tables", bewusst abgewählt). Der lokale Stack
-- kennt diese Einstellung nicht: dort erbt jede neue Tabelle das
-- Standard-grant an anon und authenticated.
--
-- Ohne diese beiden Zeilen unterscheiden sich die Umgebungen genau in der
-- Frage, um die es geht — und der Isolationstest prüft lokal etwas anderes als
-- das, was in Produktion gilt. Genau das ist passiert: derselbe Test lieferte
-- lokal 401 und in CI 200.
--
-- Dieselbe Überlegung wie bei den Erweiterungen: was für die Sicherheit zählt,
-- gehört in die Migration und nicht in eine Checkbox.
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;

-- pgvector wird erst mit den Quellen gebraucht, gehört aber hierher: eine
-- Erweiterung nachträglich einzuschalten ist ein Deploy-Schritt mehr, und
-- "extensions" ist das Schema, das Supabase dafür vorsieht.
create extension if not exists vector with schema extensions;

-- ── profiles ───────────────────────────────────────────────────────────────
-- Spiegel zu auth.users. Notwendig, weil auth.users im geschützten
-- auth-Schema liegt: die Data-API kommt nicht heran, und ein Fremdschlüssel
-- aus dem eigenen Schema darauf ist die einzige saubere Verbindung.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Öffentlich lesbares Gegenstück zu auth.users. Enthält bewusst nichts, was nicht auch der Besitzer sehen dürfte.';

alter table public.profiles enable row level security;

-- Nur das eigene Profil, und nur lesen und ändern. Kein insert: die Zeile legt
-- der Trigger unten an. Kein delete: das erledigt der Fremdschlüssel, wenn das
-- Konto gelöscht wird.
create policy "profiles: eigenes lesen"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: eigenes ändern"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, update on public.profiles to authenticated;

-- Legt das Profil an, sobald ein Konto entsteht. Als Trigger und nicht in der
-- Anwendung, weil ein Konto auch über die Supabase-Oberfläche oder einen
-- Magic Link entstehen kann — jeder Pfad, der auth.users schreibt, ist damit
-- abgedeckt, ohne dass die Anwendung davon wissen muss.
--
-- SECURITY DEFINER ist hier notwendig und zulässig: die Funktion läuft im
-- Kontext des Auth-Systems, gibt keine Daten zurück und setzt search_path
-- explizit, damit sie nicht über eine untergeschobene Funktion entführt werden
-- kann.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;   -- idempotent: ein zweiter Aufruf darf nicht scheitern
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
