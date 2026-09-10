-- ═══════════════════════════════════════════════════════════════════════════
-- Notebooks — die Einheit, an der in diesem Produkt alles hängt.
--
-- Jede spätere Tabelle (Quellen, Chunks, Chats, Notizen, Studio-Artefakte)
-- gehört zu genau einem Notebook, und der Zugriff darauf entscheidet sich
-- ausschließlich über dessen Besitz. Deshalb steht hier auch der Helfer, den
-- alle folgenden Policies benutzen.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  emoji text check (length(emoji) <= 8),
  description text check (length(description) <= 2000),

  -- Das Chat-Modell ist pro Notebook wechselbar, das Embedding-Modell nicht.
  -- Ein Vektorraum lässt sich nicht mischen: ein Wechsel würde eine
  -- Neuindexierung aller Quellen erfordern. Deshalb steht hier nur der Chat.
  chat_provider text not null default 'gemini' check (chat_provider in ('gemini', 'mistral')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.notebooks.chat_provider is
  'Nur der Chat ist umschaltbar. Embeddings liegen fest bei Mistral (EU), weil ein Wechsel des Vektorraums ein Re-Ingest aller Quellen bedeutet.';

-- Der Index, auf den sich jede Policy dieses Projekts stützt. Ohne ihn wird
-- jeder Lesezugriff zum Seq Scan, sobald mehr als eine Handvoll Notebooks
-- existiert — eine nicht indizierte Policy-Spalte ist der häufigste Grund für
-- eine RLS-Anwendung, die "plötzlich" langsam wird.
create index notebooks_owner_id_idx on public.notebooks (owner_id);

-- Sortierung der Übersicht: zuletzt bearbeitet zuerst, pro Besitzer.
create index notebooks_owner_updated_idx on public.notebooks (owner_id, updated_at desc);

alter table public.notebooks enable row level security;

create policy "notebooks: eigene lesen"
  on public.notebooks for select to authenticated
  using ((select auth.uid()) = owner_id);

-- with check statt using: beim Einfügen gibt es noch keine alte Zeile, gegen
-- die using prüfen könnte. Ohne with check könnte ein Nutzer ein Notebook mit
-- fremdem owner_id anlegen.
create policy "notebooks: eigene anlegen"
  on public.notebooks for insert to authenticated
  with check ((select auth.uid()) = owner_id);

-- Beides nötig: using entscheidet, welche Zeilen überhaupt geändert werden
-- dürfen, with check verhindert, dass die Änderung den Besitzer umschreibt und
-- das Notebook damit verschenkt.
create policy "notebooks: eigene ändern"
  on public.notebooks for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "notebooks: eigene löschen"
  on public.notebooks for delete to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.notebooks to authenticated;

-- ── Der Zugriffshelfer für alle abhängigen Tabellen ────────────────────────
-- Ohne ihn müsste jede Policy auf source_chunks, messages, notes … über zwei
-- Ebenen joinen. Das ist nicht nur langsam, es erzeugt bei Tabellen, die
-- gegenseitig aufeinander verweisen, auch rekursive Policy-Auswertung.
--
-- SECURITY DEFINER ist hier zulässig: die Funktion gibt keine Daten zurück,
-- sondern nur ja/nein, sie setzt search_path explizit, und sie prüft genau die
-- Frage, die sie im Namen trägt. Sie ist damit keine Umgehung von RLS, sondern
-- deren Baustein.
--
-- stable, nicht volatile: das erlaubt Postgres, das Ergebnis innerhalb eines
-- Statements wiederzuverwenden statt es pro Zeile neu zu berechnen.
create function public.owns_notebook(notebook uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notebooks n
    where n.id = notebook
      and n.owner_id = (select auth.uid())
  );
$$;

comment on function public.owns_notebook(uuid) is
  'Baustein für die Policies aller notebook-abhängigen Tabellen. SECURITY DEFINER, gibt nur ja/nein zurück, setzt search_path explizit.';

revoke all on function public.owns_notebook(uuid) from public;
grant execute on function public.owns_notebook(uuid) to authenticated;

-- ── updated_at ─────────────────────────────────────────────────────────────
-- Als Trigger und nicht in der Anwendung: sonst hat jede Route, die ein
-- Notebook anfasst, ihre eigene Gelegenheit, es zu vergessen.
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notebooks_touch_updated_at
  before update on public.notebooks
  for each row execute function public.touch_updated_at();
