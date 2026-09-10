-- ═══════════════════════════════════════════════════════════════════════════
-- Suche: Embeddings, Volltext, und die Zusammenführung beider.
--
-- Bis hierher liegen Abschnitte als reiner Text in der Datenbank. Diese
-- Migration macht sie auffindbar — auf zwei Wegen, die verschiedene Fehler
-- machen:
--
--   * **Semantisch** (Kosinus-Abstand über Embeddings) findet Umschreibungen.
--     Wer nach „Wie hat sich die Rentabilität entwickelt?" fragt, findet einen
--     Absatz über „Die Marge stieg". Was dieser Weg verfehlt, sind wörtliche
--     Treffer: Eigennamen, Aktenzeichen, Paragrafen, Zahlen. Für ein Embedding
--     sind „§ 14 Abs. 2" und „§ 15 Abs. 2" praktisch dasselbe.
--
--   * **Lexikalisch** (Postgres-Volltext) findet genau diese wörtlichen
--     Treffer und verfehlt jede Umschreibung.
--
-- Beide allein sind in einem Rechercheassistenten sichtbar unzureichend, und
-- zwar auf eine Art, die niemandem auffällt: es kommt eine plausible Antwort,
-- sie stützt sich nur auf die falsche Stelle. Deshalb beide, zusammengeführt
-- per Reciprocal Rank Fusion.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Bestehende Abschnitte ──────────────────────────────────────────────────
-- Die vorhandenen Abschnitte haben kein Embedding. Ließe man die Spalte
-- nullable, wären sie für die Suche unsichtbar — die Quelle stünde weiter auf
-- „bereit" und bliebe unauffindbar. Genau die Sorte stiller Fehler, die dieses
-- Projekt nicht haben will.
--
-- Sie werden deshalb verworfen und ihre Quellen auf `pending` zurückgesetzt.
-- Die Wiederaufnahme macht der Client beim nächsten Öffnen des Notebooks,
-- über dieselbe geprüfte Route wie beim ersten Mal (siehe Migration 0005).
delete from public.source_chunks;

update public.sources
set status = 'pending',
    lease_expires_at = null,
    attempts = 0,
    error_message = 'Die Suche wurde erweitert. Diese Quelle wird neu verarbeitet.'
where status = 'ready';

-- ── Embedding ──────────────────────────────────────────────────────────────
-- 1024 Dimensionen, weil `mistral-embed` genau so viele liefert. Die Zahl ist
-- keine Einstellung, sondern eine Eigenschaft des Modells: ein Vektorraum
-- lässt sich nicht mischen, und ein Modellwechsel bedeutet, alle Quellen neu
-- zu verarbeiten. Deshalb steht sie hier fest und nicht in einer Variablen.
--
-- `not null` ist Absicht. Ein Abschnitt ohne Embedding wäre gespeichert und
-- trotzdem unauffindbar. Die Verarbeitung erzeugt deshalb erst die Vektoren
-- und schreibt dann die Zeilen — schlägt das Einbetten fehl, entsteht gar
-- kein Abschnitt, und die Quelle meldet einen Fehler statt Vollständigkeit
-- vorzutäuschen.
alter table public.source_chunks
  add column embedding extensions.vector(1024) not null;

-- ── Volltext ───────────────────────────────────────────────────────────────
-- Generierte Spalte statt Trigger: der Wert kann nicht aus dem Takt geraten,
-- weil es keinen Weg gibt, `content` zu ändern ohne dass Postgres sie neu
-- berechnet.
--
-- Die Zwei-Argument-Form von `to_tsvector` ist erforderlich — die einstellige
-- ist nur `stable`, weil sie `default_text_search_config` liest, und eine
-- generierte Spalte verlangt `immutable`.
--
-- Konfiguration `german`: Oberfläche und Zielgruppe sind deutsch, und die
-- deutsche Konfiguration bringt Stemming und Stoppwörter mit. Für englische
-- Quellen stemmt sie falsch — das kostet dort etwas Trefferqualität im
-- lexikalischen Zweig, während der semantische unberührt bleibt. Der saubere
-- Weg wäre eine Sprachspalte pro Quelle und ein Index je Konfiguration; das
-- ist heute nicht nötig und wird deshalb nicht gebaut.
alter table public.source_chunks
  add column fts tsvector
  generated always as (to_tsvector('german'::regconfig, content)) stored;

create index source_chunks_fts_idx on public.source_chunks using gin (fts);

-- ── Warum hier kein Vektor-Index steht ─────────────────────────────────────
-- Der naheliegende Schritt wäre jetzt ein HNSW-Index. Er wäre an dieser Stelle
-- ein Fehler, und der Grund ist die Reihenfolge der Auswertung:
--
-- Ein approximativer Index liefert die global nächsten `ef_search` Nachbarn.
-- **Danach** greifen RLS-Policy und die Notebook-Bedingung und streichen
-- alles, was nicht dazugehört. Bei mehreren Notebooks bleiben von vierzig
-- Kandidaten vielleicht zwei übrig — ohne Fehlermeldung, ohne Warnung. Der
-- Recall bricht still zusammen, und man merkt es erst, wenn das Produkt echte
-- Daten hat.
--
-- Ein exakter Scan über die zu erwartenden 20–50k Abschnitte à 1024 float4
-- liegt im zweistelligen Millisekundenbereich, bei 100 % Recall. Das ist die
-- bessere Seite des Tauschs, solange die Datenmenge so aussieht.
--
-- Kommt der Index später, dann zusammen mit
--   set local hnsw.iterative_scan = 'relaxed_order';
--   set local hnsw.ef_search = 100;
-- Ohne das läuft der Nachfolger in genau dieselbe Falle.

-- ── Die Suchfunktion ───────────────────────────────────────────────────────
-- `security invoker` ist hier die eigentliche Sicherheitsaussage, nicht bloß
-- der Standardwert: PostgREST exponiert diese Funktion öffentlich unter
-- /rest/v1/rpc/match_chunks. Mit `security definer` liefe sie als `postgres`,
-- RLS im Rumpf wäre wirkungslos, und jeder angemeldete Nutzer könnte die
-- Abschnitte jedes fremden Notebooks abfragen — ein Datenleck mit
-- Aufrufschnittstelle. Deshalb steht es ausgeschrieben da.
--
-- Zusätzlich filtert die Funktion selbst auf `notebook_id`. Das ist keine
-- Dopplung aus Misstrauen, sondern eine Arbeitsteilung: RLS ist die
-- Sicherheitsgrenze, das Prädikat ist die Performance-Grenze. Ohne das
-- Prädikat müsste der Planer den Index nicht benutzen.
create function public.match_chunks(
  p_notebook uuid,
  p_embedding extensions.vector(1024),
  p_query text,
  -- `null` heißt „alle Quellen". Ein leeres Array heißt „keine" und liefert
  -- korrekterweise nichts: hat der Nutzer alle Quellen abgewählt, darf die
  -- Antwort nicht heimlich doch auf allen beruhen.
  p_source_ids uuid[],
  p_k integer
)
returns table (
  id uuid,
  source_id uuid,
  source_title text,
  chunk_index integer,
  content text,
  page_number integer,
  char_start integer,
  char_end integer,
  score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with konstanten as (
    select
      -- Reciprocal Rank Fusion: der Beitrag eines Treffers ist 1/(k + Rang).
      -- Das `k` dämpft, wie stark die vordersten Plätze dominieren. Bei 0
      -- wäre Platz 1 doppelt so viel wert wie Platz 2; bei 50 sind die
      -- vorderen zwanzig Plätze ähnlich gewichtet, und ein Treffer, der in
      -- *beiden* Listen im vorderen Feld liegt, schlägt einen, der nur in
      -- einer ganz vorn steht. Genau das ist der Zweck der Zusammenführung.
      -- 50 ist der Wert aus der ursprünglichen Veröffentlichung zu RRF.
      50.0::double precision as rrf_k,
      -- Beide Zweige holen mehr Kandidaten, als am Ende gebraucht werden.
      -- Sonst könnte ein Abschnitt, der in einer Liste knapp außerhalb liegt,
      -- seinen Beitrag zur gemeinsamen Wertung nicht leisten.
      (p_k * 4) as kandidaten
  ),

  -- Warum RRF und nicht eine gewichtete Summe: Kosinus-Abstand und
  -- ts_rank_cd sind unvergleichbare Skalen ohne feste Ober- oder Untergrenze.
  -- Sie zu addieren verlangt eine Normalisierung, die pro Anfrage anders
  -- ausfällt. RRF benutzt nur die Rangfolge und braucht deshalb gar keine.
  semantisch as (
    select
      c.id,
      row_number() over (order by c.embedding <=> p_embedding) as rang
    from public.source_chunks c, konstanten k
    where c.notebook_id = p_notebook
      and (p_source_ids is null or c.source_id = any (p_source_ids))
    order by c.embedding <=> p_embedding
    limit (select kandidaten from konstanten)
  ),

  -- `websearch_to_tsquery` versteht Anführungszeichen und `-` wie eine
  -- Suchmaschine und wirft bei unsinniger Eingabe keinen Fehler — anders als
  -- `to_tsquery`, das bei jedem Sonderzeichen abbricht. Bei einer Frage, die
  -- nur aus Stoppwörtern besteht, ist das Ergebnis eine leere Anfrage: dieser
  -- Zweig liefert dann nichts, der semantische trägt allein. Auch das ist
  -- richtig so.
  lexikalisch as (
    select
      c.id,
      row_number() over (order by ts_rank_cd(c.fts, f.frage) desc) as rang
    from public.source_chunks c
    cross join websearch_to_tsquery('german'::regconfig, coalesce(p_query, '')) as f (frage)
    where c.notebook_id = p_notebook
      and (p_source_ids is null or c.source_id = any (p_source_ids))
      and c.fts @@ f.frage
    order by ts_rank_cd(c.fts, f.frage) desc
    limit (select kandidaten from konstanten)
  ),

  -- `full outer join`, weil ein Abschnitt in genau einer der beiden Listen
  -- stehen darf — das ist der Normalfall und zugleich der ganze Sinn der
  -- Übung. Ein `inner join` behielte nur, was beide Wege ohnehin finden.
  vereint as (
    select
      coalesce(s.id, l.id) as id,
      coalesce(1.0 / (k.rrf_k + s.rang), 0.0)
        + coalesce(1.0 / (k.rrf_k + l.rang), 0.0) as score
    from semantisch s
    full outer join lexikalisch l on l.id = s.id
    cross join konstanten k
  )

  select
    c.id,
    c.source_id,
    q.title as source_title,
    c.chunk_index,
    c.content,
    c.page_number,
    c.char_start,
    c.char_end,
    v.score
  from vereint v
  join public.source_chunks c on c.id = v.id
  join public.sources q on q.id = c.source_id
  order by v.score desc, c.chunk_index
  limit p_k;
$$;

comment on function public.match_chunks(uuid, extensions.vector, text, uuid[], integer) is
  'Hybride Suche über die Abschnitte eines Notebooks: semantisch und lexikalisch, zusammengeführt per Reciprocal Rank Fusion. SECURITY INVOKER — RLS greift im Rumpf.';

grant execute on function public.match_chunks(uuid, extensions.vector, text, uuid[], integer) to authenticated;
