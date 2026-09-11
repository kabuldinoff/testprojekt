-- ═══════════════════════════════════════════════════════════════════════════
-- Notizen: was der Nutzer aus dem Gespräch behalten will.
--
-- Der Unterschied zu `messages` ist nicht technisch, sondern inhaltlich: ein
-- Verlauf ist eine Spur, eine Notiz ist eine Entscheidung. Deshalb eine eigene
-- Tabelle und kein Flag auf der Nachricht — eine als Notiz markierte Nachricht
-- wäre an den Verlauf gebunden, und wer den Verlauf löscht, verlöre seine
-- Notizen mit.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.notes (
  id uuid primary key default gen_random_uuid(),

  -- Dieselbe Form wie bei jeder anderen Policy in diesem Schema: ein
  -- Indexzugriff auf notebook_id plus owns_notebook().
  notebook_id uuid not null references public.notebooks (id) on delete cascade,

  title text not null check (length(trim(title)) between 1 and 200),
  content text not null check (length(content) between 1 and 20000),

  -- Woher sie kommt. `chat` heißt: aus einer Antwort übernommen.
  origin text not null default 'user' check (origin in ('user', 'chat')),

  -- Die Belege der übernommenen Antwort, als Momentaufnahme wie bei
  -- `messages.citations`. Eine Notiz aus dem Chat ohne ihre Belege wäre eine
  -- Behauptung ohne Herkunft — genau das, was dieses Produkt vermeiden soll.
  citations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(citations) = 'array'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Die Spalte, nach der die Policy filtert, und zugleich die Sortierung der
-- Liste: zuletzt geändert zuerst.
create index notes_notebook_updated_idx on public.notes (notebook_id, updated_at desc);

-- Hält updated_at aktuell, ohne dass der Client es mitschicken muss — ein vom
-- Client gesetzter Zeitstempel wäre eine Behauptung.
create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_updated_at();

alter table public.notes enable row level security;

-- Alle vier Operationen, und hier ist das keine Formsache: eine Notiz ist das
-- einzige Objekt in diesem Produkt, das der Nutzer selbst schreibt und später
-- überarbeitet. Anders als beim Gesprächsverlauf, wo nachträgliches Ändern die
-- Belegkraft zerstörte, ist Ändern hier der Sinn der Sache.
--
-- `(select auth.uid())` steckt in owns_notebook(): als InitPlan einmal pro
-- Statement ausgewertet statt einmal pro Zeile.
create policy "notes: lesen im eigenen Notebook"
  on public.notes for select to authenticated
  using (public.owns_notebook(notebook_id));

-- `with check` und nicht `using`: beim Einfügen gibt es keine bestehende Zeile
-- zu prüfen, sondern nur die entstehende. Ohne diese Policy könnte ein
-- angemeldeter Nutzer Notizen in fremde Notebooks legen — sichtbar für den
-- Besitzer und nicht von seinen eigenen zu unterscheiden.
create policy "notes: anlegen im eigenen Notebook"
  on public.notes for insert to authenticated
  with check (public.owns_notebook(notebook_id));

-- Zweimal dieselbe Bedingung: `using` prüft die Zeile, wie sie ist, `with
-- check` die Zeile, wie sie danach wäre. Ohne das zweite könnte eine Notiz per
-- Update in ein fremdes Notebook verschoben werden — sie verschwände beim
-- Besitzer und tauchte bei jemand anderem auf.
create policy "notes: ändern im eigenen Notebook"
  on public.notes for update to authenticated
  using (public.owns_notebook(notebook_id))
  with check (public.owns_notebook(notebook_id));

-- Löschen gehört dazu, anders als bei `messages`: eine Notiz ist etwas, das
-- der Nutzer selbst angelegt hat und wieder loswerden können muss. Ein
-- Gesprächsverlauf ist eine Spur, eine Notizsammlung ist ein Arbeitsmittel.
create policy "notes: löschen im eigenen Notebook"
  on public.notes for delete to authenticated
  using (public.owns_notebook(notebook_id));

grant select, insert, update, delete on public.notes to authenticated;
