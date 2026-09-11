-- ═══════════════════════════════════════════════════════════════════════════
-- Audio-Überblick: aus den Quellen eines Notebooks ein zweistimmiges Gespräch.
--
-- Eine Zeile pro Notebook, nicht viele. Das Vorbild kennt genau einen
-- Überblick je Notebook, und ein zweiter wäre nicht „noch einer", sondern die
-- Frage, welcher der aktuelle ist. Neu erzeugen ersetzt.
--
-- Der Zustandsautomat ist derselbe wie bei den Quellen — Lease, Versuchszähler,
-- pg_cron-Reaper — mit einem zusätzlichen Ausgang:
--
--   pending      → angefordert
--   processing   → ein Lauf hat übernommen (siehe lease_expires_at)
--   ready        → Skript und Audiodatei liegen vor
--   script_only  → das Skript steht, die Sprachausgabe scheiterte
--   failed       → endgültig gescheitert, mit Grund
--
-- `script_only` ist der Grund, warum dieser Automat einen Zustand mehr hat als
-- der der Quellen. Die Sprachausgabe ist der teuerste und unzuverlässigste
-- Schritt: ein erschöpftes Tageskontingent äußert sich als 429, und das
-- passiert ausgerechnet bei einer Vorführung. Das Skript ist dann trotzdem da
-- und wird als lesbares Transkript angezeigt — statt eines Ladebalkens, der
-- nie fertig wird.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.audio_overviews (
  id uuid primary key default gen_random_uuid(),

  -- Eindeutig: ein Notebook hat höchstens einen Überblick. Das Erzeugen läuft
  -- deshalb als Upsert, und ein zweiter Klick erzeugt keinen zweiten Lauf.
  notebook_id uuid not null unique references public.notebooks (id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'script_only', 'failed')),

  -- Das Gesprächsskript, so wie es an die Sprachausgabe ging. Es wird immer
  -- gespeichert, auch wenn die Vertonung klappt: als Transkript zum Mitlesen
  -- und als das, was `script_only` übrig lässt.
  script text,

  -- Pfad im privaten `audio`-Bucket. Ausgeliefert wird ausschließlich über
  -- Signed URLs — auch weil eine Vercel-Function keine 8 MB durchreichen darf.
  storage_path text,
  duration_seconds integer,

  error_message text,

  -- Dieselbe Mechanik wie bei den Quellen: siehe Migration 0004.
  attempts smallint not null default 0,
  lease_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Die Spalte, nach der die Policy filtert. Durch `unique` existiert der Index
-- bereits — er wird hier nur benannt, damit niemand ihn „ergänzt".
comment on constraint audio_overviews_notebook_id_key on public.audio_overviews is
  'Dient zugleich als Index für die RLS-Policy: ein Lookup statt eines Seq Scans.';

create trigger audio_overviews_touch_updated_at
  before update on public.audio_overviews
  for each row execute function public.touch_updated_at();

alter table public.audio_overviews enable row level security;

-- Lesen und Anfordern darf der Besitzer. `(select auth.uid())` steckt in
-- owns_notebook(): einmal pro Statement ausgewertet statt einmal pro Zeile.
create policy "audio_overviews: lesen im eigenen Notebook"
  on public.audio_overviews for select to authenticated
  using (public.owns_notebook(notebook_id));

-- Anfordern heißt eine Zeile mit `pending` anlegen. Den Rest schreibt der
-- Verarbeitungslauf.
create policy "audio_overviews: anfordern im eigenen Notebook"
  on public.audio_overviews for insert to authenticated
  with check (public.owns_notebook(notebook_id));

-- Neu erzeugen setzt die bestehende Zeile zurück. Ohne UPDATE bliebe nur
-- löschen und neu anlegen — zwei Schritte, zwischen denen ein Abbruch die
-- Zeile verschwinden ließe.
create policy "audio_overviews: neu erzeugen im eigenen Notebook"
  on public.audio_overviews for update to authenticated
  using (public.owns_notebook(notebook_id))
  with check (public.owns_notebook(notebook_id));

create policy "audio_overviews: löschen im eigenen Notebook"
  on public.audio_overviews for delete to authenticated
  using (public.owns_notebook(notebook_id));

grant select, insert, update, delete on public.audio_overviews to authenticated;

-- Der Verarbeitungslauf. Nach der Regel aus Migration 0010: entzogen ist
-- alles, gewährt wird einzeln — und `select` gehört dazu, weil
-- `update … where` die Spalte der Bedingung liest.
grant select, update on public.audio_overviews to service_role;

-- ── Storage ────────────────────────────────────────────────────────────────
-- Privat. Ausgeliefert wird über Signed URLs, nie über eine öffentliche
-- Adresse — und nie durch eine Function: Vercel begrenzt Antwortkörper auf
-- 4,5 MB, ein dreiminütiger Überblick ist rund 8 MB groß.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  false,
  12582912, -- 12 MiB. Gemessen: 2,75 MB pro Minute bei 24 kHz/16 Bit/Mono,
            -- der Deckel liegt bei drei Minuten. 12 MiB lassen Spielraum,
            -- ohne dass ein Fehler unbegrenzt Platz kostet.
  array['audio/wav']
)
on conflict (id) do nothing;

-- Layout wie beim Quellen-Bucket: {user_id}/{notebook_id}.wav. Der erste
-- Pfadabschnitt ist die Nutzer-ID und kommt aus dem geprüften Token, nicht
-- aus dem Request.
create policy "audio-bucket: eigene Dateien lesen"
  on storage.objects for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Kein INSERT für Nutzer: Anders als bei den Quellen lädt hier niemand etwas
-- hoch. Die Datei entsteht ausschließlich im Verarbeitungslauf, und der
-- schreibt mit dem Secret Key an dieser Policy vorbei. Eine Upload-Policy
-- wäre eine Tür, die nur von innen gebraucht wird.

-- ── Übernahme ──────────────────────────────────────────────────────────────
-- Wortgleich zur Begründung bei `claim_source` in Migration 0004: Die
-- Bedingung steht im UPDATE selbst, nicht in einem vorherigen SELECT. Nur so
-- ist die Übernahme atomar — sonst könnten der Reaper und ein neuer Aufruf
-- denselben Überblick gleichzeitig übernehmen und zweimal vertonen. Das wäre
-- hier teurer als bei den Quellen: die Sprachausgabe ist der Schritt mit dem
-- knappsten Kontingent.
create function public.claim_audio_overview(
  p_notebook_id uuid,
  p_lease_minutes integer,
  p_max_attempts integer
)
returns table (
  id uuid,
  notebook_id uuid,
  status text,
  attempts smallint
)
language sql
as $$
  update public.audio_overviews a
  set status = 'processing',
      lease_expires_at = now() + make_interval(mins => p_lease_minutes),
      attempts = a.attempts + 1,
      error_message = null
  where a.notebook_id = p_notebook_id
    and a.attempts < p_max_attempts
    and (a.status = 'pending' or (a.status = 'processing' and a.lease_expires_at < now()))
  returning a.id, a.notebook_id, a.status, a.attempts;
$$;

comment on function public.claim_audio_overview(uuid, integer, integer) is
  'Übernimmt einen Audio-Überblick für einen Erzeugungslauf. Ein Statement, damit Reaper und Nutzeraufruf nicht beide vertonen.';

-- Nur der Verarbeitungslauf ruft das auf. Ausdrücklich gewährt, nicht der
-- Plattform überlassen — siehe Migration 0010.
revoke all on function public.claim_audio_overview(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_audio_overview(uuid, integer, integer) to service_role;

-- ── Reaper ─────────────────────────────────────────────────────────────────
-- Dieselbe Rolle wie `reap_stale_ingests`: `after()` ist fire-and-forget, und
-- ohne diesen Job bliebe ein abgebrochener Lauf für immer auf `processing`.
--
-- Ein eigener Job und keine Erweiterung des bestehenden: Die beiden Tabellen
-- haben verschiedene Zustände — `audio_overviews` kennt zusätzlich
-- `script_only` — und eine Funktion, die beides gleichzeitig aufräumt, müsste
-- bei jeder Änderung an einer der beiden erneut gelesen werden.
create function public.reap_stale_audio_overviews()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  betroffen integer;
begin
  update public.audio_overviews
  set status = 'pending',
      lease_expires_at = null,
      error_message = 'Ein Erzeugungsversuch wurde abgebrochen. Es wird erneut versucht.'
  where status = 'processing'
    and lease_expires_at is not null
    and lease_expires_at < now();

  get diagnostics betroffen = row_count;
  return betroffen;
end;
$$;

revoke all on function public.reap_stale_audio_overviews() from public, anon, authenticated;

-- Jede Minute, wie beim Ingest. Die Wiederaufnahme macht auch hier der Client
-- mit der Sitzung des Nutzers — der Job setzt nur den Zustand zurück.
select cron.schedule('reap-stale-audio-overviews', '* * * * *',
  $$ select public.reap_stale_audio_overviews() $$);
