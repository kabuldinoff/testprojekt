-- ═══════════════════════════════════════════════════════════════════════════
-- Quellen und ihre Textabschnitte.
--
-- Eine Quelle ist eine hochgeladene Datei, eine abgerufene Webseite oder ein
-- eingefügter Text. Ihre Verarbeitung läuft asynchron und kann scheitern,
-- deshalb trägt sie einen Zustand und nicht nur Inhalt.
--
-- Die Vektorspalte fehlt hier bewusst. Sie kommt mit der Scheibe, die
-- Embeddings erzeugt — eine Spalte anzulegen, die niemand füllt, wäre eine
-- Behauptung über die Zukunft.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── sources ────────────────────────────────────────────────────────────────
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,

  -- Text statt enum, wie schon bei notebooks.chat_provider: eine neue Art
  -- hinzuzufügen ist dann eine geänderte CHECK-Klausel und kein Eingriff in
  -- einen Typ, an dem andere Objekte hängen.
  kind text not null check (kind in ('pdf', 'text', 'markdown', 'url', 'paste')),

  title text not null check (length(trim(title)) between 1 and 300),

  -- Genau eines von beiden ist gesetzt, je nach Art. Als CHECK und nicht nur
  -- als Absprache: eine Quelle ohne Herkunft ist unverarbeitbar, und der
  -- Fehler fiele sonst erst im Worker auf, wo er als "Verarbeitung
  -- fehlgeschlagen" beim Nutzer landet statt als abgelehnte Eingabe.
  storage_path text,
  source_url text,
  constraint sources_herkunft check (
    (kind in ('pdf', 'text', 'markdown') and storage_path is not null and source_url is null)
    or (kind = 'url' and source_url is not null and storage_path is null)
    or (kind = 'paste' and storage_path is not null and source_url is null)
  ),

  -- Der Zustandsautomat der Verarbeitung.
  --   pending    → angelegt, Datei liegt im Storage, noch nichts passiert
  --   processing → ein Lauf hat sie übernommen (siehe lease_expires_at)
  --   ready      → Abschnitte liegen vor
  --   failed     → endgültig gescheitert, mit Grund in error_message
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  error_message text,

  -- Lease und Versuchszähler machen aus `after()` einen belastbaren Ablauf.
  -- `after()` ist fire-and-forget: stirbt die Instanz mitten in der
  -- Verarbeitung, bliebe die Quelle für immer auf 'processing'. Ein
  -- pg_cron-Lauf sucht abgelaufene Leases und stößt sie erneut an — bis
  -- MAX_ATTEMPTS, danach 'failed' mit Grund.
  attempts smallint not null default 0,
  lease_expires_at timestamptz,

  char_count integer,
  page_count integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.sources.lease_expires_at is
  'Bis wann der laufende Verarbeitungsversuch als lebendig gilt. Danach darf ihn der Reaper übernehmen.';

-- Die Spalte, nach der die RLS-Policy filtert. Ohne diesen Index wird jeder
-- Lesezugriff zum Seq Scan, sobald mehr als eine Handvoll Quellen existiert.
create index sources_notebook_id_idx on public.sources (notebook_id);

-- Die Liste im UI: neueste zuerst, pro Notebook.
create index sources_notebook_created_idx on public.sources (notebook_id, created_at desc);

-- Der Reaper fragt genau nach dieser Kombination. Ein Teilindex, weil
-- 'processing' im Normalbetrieb ein winziger Bruchteil der Zeilen ist — ein
-- vollständiger Index wäre größer und langsamer für dieselbe Antwort.
create index sources_abgelaufene_leases_idx
  on public.sources (lease_expires_at)
  where status = 'processing';

alter table public.sources enable row level security;

-- Alle vier Policies gehen über den Notebook-Besitz. Der Helfer aus
-- Migration 0002 kapselt die Frage, damit sie hier nicht viermal ausformuliert
-- werden muss und beim Ändern nicht dreimal richtig und einmal falsch ist.
create policy "sources: lesen, was zum eigenen Notebook gehört"
  on public.sources for select to authenticated
  using (public.owns_notebook(notebook_id));

-- with check statt using: beim Einfügen gibt es keine alte Zeile. Ohne das
-- könnte man eine Quelle in ein fremdes Notebook legen.
create policy "sources: anlegen im eigenen Notebook"
  on public.sources for insert to authenticated
  with check (public.owns_notebook(notebook_id));

-- Beides nötig: using entscheidet, welche Zeilen änderbar sind, with check
-- verhindert das Verschieben in ein fremdes Notebook.
create policy "sources: ändern im eigenen Notebook"
  on public.sources for update to authenticated
  using (public.owns_notebook(notebook_id))
  with check (public.owns_notebook(notebook_id));

-- Ohne diese Policy wäre Löschen gesperrt statt offen, und das äußert sich als
-- Löschvorgang, der stillschweigend nichts tut.
create policy "sources: löschen im eigenen Notebook"
  on public.sources for delete to authenticated
  using (public.owns_notebook(notebook_id));

grant select, insert, update, delete on public.sources to authenticated;

create trigger sources_touch_updated_at
  before update on public.sources
  for each row execute function public.touch_updated_at();

-- ── Obergrenze pro Notebook ────────────────────────────────────────────────
-- Als Trigger und nicht in der Anwendung: die Grenze schützt ein kostenloses
-- Kontingent (Storage und später Embedding-Aufrufe), und eine Prüfung, die nur
-- im Anwendungscode steht, lässt sich über die Data-API umgehen.
create function public.enforce_source_limit()
returns trigger
language plpgsql
as $$
declare
  vorhanden integer;
begin
  select count(*) into vorhanden from public.sources where notebook_id = new.notebook_id;
  if vorhanden >= 20 then
    raise exception 'Ein Notebook fasst höchstens 20 Quellen.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger sources_limit
  before insert on public.sources
  for each row execute function public.enforce_source_limit();

-- ── source_chunks ──────────────────────────────────────────────────────────
create table public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,

  -- Denormalisiert, bewusst. Die Policy könnte den Besitz über sources →
  -- notebooks joinen; stattdessen steht die Antwort direkt in der Zeile. Das
  -- ist eine Abweichung von 3NF und der Grund dafür ist Messbarkeit: die
  -- Abschnittstabelle wird die größte im Projekt, und jede Suche filtert
  -- zuerst nach Notebook.
  notebook_id uuid not null references public.notebooks (id) on delete cascade,

  chunk_index integer not null,
  content text not null,

  -- Seitenzahl und Zeichenbereich sind das, was ein Zitat später anklickbar
  -- macht: die Antwort verweist auf einen Abschnitt, und die Quelle wird an
  -- genau dieser Stelle geöffnet und markiert. Ohne diese drei Spalten könnte
  -- man nur die Datei nennen, nicht die Stelle.
  page_number integer,
  char_start integer not null,
  char_end integer not null,

  created_at timestamptz not null default now(),

  -- Macht die Verarbeitung wiederholbar: ein zweiter Lauf löscht die alten
  -- Abschnitte und legt dieselben Indizes neu an, statt Dubletten zu erzeugen.
  unique (source_id, chunk_index)
);

create index source_chunks_notebook_id_idx on public.source_chunks (notebook_id);
create index source_chunks_source_id_idx on public.source_chunks (source_id);

alter table public.source_chunks enable row level security;

-- Nur lesen. Abschnitte entstehen ausschließlich im Verarbeitungslauf, der mit
-- dem Secret Key arbeitet und an RLS vorbeigeht — es gibt keinen Grund, warum
-- ein Client sie schreiben können sollte.
create policy "source_chunks: lesen, was zum eigenen Notebook gehört"
  on public.source_chunks for select to authenticated
  using (public.owns_notebook(notebook_id));

grant select on public.source_chunks to authenticated;

-- ── Storage ────────────────────────────────────────────────────────────────
-- Privater Bucket. Ausgeliefert wird ausschließlich über Signed URLs, nie über
-- eine öffentliche Adresse.
--
-- Das Größenlimit steht hier und nicht nur im Anwendungscode: der Browser lädt
-- direkt zu Storage hoch, an der Anwendung vorbei. Eine Prüfung, die nur in
-- der Route steht, sieht diese Datei nie.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sources',
  'sources',
  false,
  10485760, -- 10 MiB. Größere Dokumente sprengen die 300-Sekunden-Grenze der
            -- Verarbeitungsfunktion, bevor sie am Speicherplatz scheitern.
  array['application/pdf', 'text/plain', 'text/markdown']
)
on conflict (id) do nothing;

-- Der erste Pfadabschnitt ist die Nutzer-ID. Damit hängt die Zugriffsprüfung
-- an etwas, das der Client nicht fälschen kann: auth.uid() kommt aus dem
-- geprüften Token, nicht aus dem Request.
--
-- Layout: {user_id}/{notebook_id}/{source_id}
create policy "sources-bucket: eigene Dateien lesen"
  on storage.objects for select to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "sources-bucket: eigene Dateien hochladen"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Löschen wird gebraucht, wenn eine Quelle entfernt wird. Ohne diese Policy
-- bliebe die Datei liegen und zählte weiter gegen das Speicherkontingent,
-- ohne dass irgendetwas darauf hinweist.
create policy "sources-bucket: eigene Dateien löschen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
