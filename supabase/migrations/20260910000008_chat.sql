-- ═══════════════════════════════════════════════════════════════════════════
-- Der Chat: Nachrichten mit Belegen, und ein Protokoll der Modellaufrufe.
--
-- ── Zwei Abweichungen vom ursprünglichen Entwurf, beide absichtlich ───────
--
-- **Keine `chats`-Tabelle.** Geplant war eine Ebene dazwischen, damit ein
-- Notebook mehrere Unterhaltungen haben kann. Gebraucht wird sie nicht: das
-- Produkt hat einen Gesprächsfaden pro Notebook, so wie das Vorbild. Eine
-- Tabelle, deren einziger Zweck eine Ein-zu-eins-Beziehung ist, kostet einen
-- Join in jeder Abfrage und eine Policy mehr — für eine Funktion, die es
-- nicht gibt. Kommt sie je, ist das eine Migration mit einem Fremdschlüssel.
--
-- **Keine Kostenspalte.** Geplant war `cost_micro`. Dafür bräuchte es eine
-- Preistabelle im Code, und die Preise könnte ich hier nur behaupten. Was die
-- Anbieter tatsächlich zurückgeben, sind Token — die stehen unten und sind
-- überprüfbar. Aus Token lassen sich Kosten jederzeit ausrechnen; aus einer
-- falsch abgetippten Preistabelle wird nie eine richtige Zahl.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── messages ───────────────────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),

  -- Direkt am Notebook, ohne Zwischenebene. Damit hat diese Policy dieselbe
  -- Form wie jede andere in diesem Schema: ein Indexzugriff auf notebook_id
  -- plus owns_notebook(). Gleiche Form heißt, dass eine Abweichung auffällt.
  notebook_id uuid not null references public.notebooks (id) on delete cascade,

  role text not null check (role in ('user', 'assistant')),
  content text not null,

  -- Die Belege zur Antwort, in der Reihenfolge ihrer Nummern im Text.
  --
  -- Als jsonb und nicht als eigene Tabelle: ein Zitat hat außerhalb seiner
  -- Nachricht keine Bedeutung, wird nie einzeln abgefragt und nie ohne sie
  -- geladen. Eine Verweistabelle brächte einen Join und eine dritte Policy,
  -- ohne dass je jemand nach „allen Zitaten" fragte.
  --
  -- Bewusst eine Momentaufnahme mitsamt der zitierten Passage, kein
  -- Fremdschlüssel auf source_chunks. Löscht der Nutzer eine Quelle, bleibt
  -- die alte Antwort damit überprüfbar — bei einem Rechercheassistenten ist
  -- ein Beleg, der verschwindet, schlimmer als ein veralteter.
  --
  -- Der Preis sind rund 1200 Zeichen je Beleg. Der zweite Gewinn wiegt ihn
  -- auf: es gibt genau einen Weg zur Passage. Nachladen hieße, sie während
  -- des Gesprächs aus dem Strom und nach dem Neuladen aus der Datenbank zu
  -- holen — zwei Wege zu denselben Daten, die unterschiedlich falsch sein
  -- können.
  citations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(citations) = 'array'),

  -- Welches Modell geantwortet hat. Gehört an die Nachricht und nicht ans
  -- Notebook: der Nutzer kann mitten im Gespräch umschalten, und dann ist die
  -- Frage „womit wurde das erzeugt?" pro Nachricht verschieden zu beantworten.
  -- Bei Fragen des Nutzers bleibt es leer.
  provider text check (provider in ('gemini', 'mistral')),
  model text,

  created_at timestamptz not null default now()
);

-- Die Spalte, nach der die Policy filtert — und zugleich die Sortierung, in
-- der der Verlauf gelesen wird. Ein zusammengesetzter Index bedient beides.
create index messages_notebook_created_idx
  on public.messages (notebook_id, created_at);

alter table public.messages enable row level security;

-- `(select auth.uid())` steckt in owns_notebook(): als InitPlan einmal pro
-- Statement ausgewertet statt einmal pro Zeile.
create policy "messages: lesen, was zum eigenen Notebook gehört"
  on public.messages for select to authenticated
  using (public.owns_notebook(notebook_id));

-- Schreiben darf nur, wem das Notebook gehört. `with check` und nicht
-- `using`: bei INSERT gibt es keine bestehende Zeile zu prüfen, sondern nur
-- die entstehende. Ohne diese Policy könnte ein angemeldeter Nutzer Fragen
-- und Antworten in fremde Verläufe schreiben — sichtbar für den Besitzer,
-- ununterscheidbar von dessen eigenen.
create policy "messages: schreiben ins eigene Notebook"
  on public.messages for insert to authenticated
  with check (public.owns_notebook(notebook_id));

-- ── Warum es keine UPDATE-Policy gibt ─────────────────────────────────────
-- Löschen ja, Ändern nein. Ein Gesprächsverlauf, in dem sich Vergangenes
-- nachträglich ändern lässt, ist als Beleg wertlos — und die Belege sind der
-- Sinn dieses Produkts. Wer neu anfangen will, löscht.
--
-- Die Abwesenheit ist deshalb die Aussage, nicht eine Lücke in der Liste.
-- Sie wirkt auch zweifach: unten wird `update` gar nicht erst gewährt, der
-- Versuch scheitert also schon an der Rechteprüfung, bevor RLS befragt wird.
-- Eine Policy mit `using (false)` wäre unerreichbar und legte nahe, sie täte
-- etwas.
create policy "messages: löschen im eigenen Notebook"
  on public.messages for delete to authenticated
  using (public.owns_notebook(notebook_id));

grant select, insert, delete on public.messages to authenticated;

-- ── llm_calls ──────────────────────────────────────────────────────────────
-- Was an Modelle geschickt wurde, wie viel und wie lange es gedauert hat.
--
-- Der Zweck ist nicht Abrechnung — im kostenlosen Kontingent ist der Betrag
-- null. Der Zweck ist, ein Ausreißen zu bemerken, bevor das Kontingent
-- erschöpft ist: eine Quelle, die in einer Schleife neu verarbeitet wird,
-- fällt hier als Zeilenzahl auf und sonst nirgends.
create table public.llm_calls (
  id uuid primary key default gen_random_uuid(),

  -- Wer den Aufruf ausgelöst hat. Nicht über das Notebook hergeleitet: ein
  -- gelöschtes Notebook soll das Protokoll nicht mitnehmen, sonst verschwindet
  -- genau der Verbrauch aus der Statistik, der das Kontingent gekostet hat.
  user_id uuid not null references public.profiles (id) on delete cascade,
  notebook_id uuid references public.notebooks (id) on delete set null,

  kind text not null check (kind in ('embed', 'chat', 'tts')),
  provider text not null check (provider in ('gemini', 'mistral')),
  model text not null,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  duration_ms integer not null default 0,

  created_at timestamptz not null default now()
);

-- Die einzige Abfrage auf dieser Tabelle: „was hat dieser Nutzer zuletzt
-- verbraucht". Die Spalte, nach der die Policy filtert, steht vorn; die
-- absteigende Zeit dahinter bedient dieselbe Abfrage ohne Sortierschritt.
create index llm_calls_user_created_idx on public.llm_calls (user_id, created_at desc);

alter table public.llm_calls enable row level security;

-- Lesen und Schreiben, jeweils nur die eigenen Zeilen.
--
-- Die erste Fassung ließ das Schreiben weg, mit der Begründung, ein
-- Verbrauchsnachweis müsse unfälschbar sein. Das hielt der Prüfung nicht
-- stand: die einzige Route, die dann noch schreiben könnte, hätte dafür den
-- Secret-Key-Client gebraucht — in einer Route, die direkt auf eine
-- Nutzeraktion antwortet. Damit wäre die Invariante gefallen, dass erhöhte
-- Rechte ausschließlich im Verarbeitungslauf vorkommen, und zwar für eine
-- Statistikzeile.
--
-- Das Bedrohungsmodell trägt die Härte auch gar nicht. Dieses Protokoll soll
-- ein Ausreißen bemerken — eine Quelle in einer Verarbeitungsschleife, ein
-- Kontingent, das sich unerklärt leert. Das sind eigene Fehler, keine
-- Angriffe. Wer sein eigenes Protokoll verfälscht, schadet nur der eigenen
-- Statistik und gewinnt nichts.
--
-- `with check` bindet die Zeile an den Aufrufer: eine fremde user_id lässt
-- sich nicht eintragen.
--
-- UPDATE und DELETE gibt es bewusst nicht, und zwar aus demselben Grund wie
-- bei `messages`: ein Verbrauchsprotokoll, das sich nachträglich umschreiben
-- oder leeren lässt, beantwortet die Frage nicht mehr, für die es da ist —
-- „wo ist das Kontingent geblieben". Auch hier greift die Rechteprüfung
-- zuerst: das `grant` unten nennt nur `select, insert`.
create policy "llm_calls: die eigenen Aufrufe lesen"
  on public.llm_calls for select to authenticated
  using (user_id = (select auth.uid()));

create policy "llm_calls: eigene Aufrufe protokollieren"
  on public.llm_calls for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.llm_calls to authenticated;
