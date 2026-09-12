-- ══════════════════════════════════════════════════════════════════════════
-- Drosselung teurer Vorgänge — Chat, Verarbeitung, Vertonung.
--
-- ── Wovor das schützt ────────────────────────────────────────────────────
--
-- Nicht vor einem Angreifer, sondern vor einer Rechnung, die es nicht gibt:
-- Die AI-Anbieter laufen im kostenlosen Tarif, und was hier verbraucht wird,
-- ist ein Tageskontingent. Ein versehentlicher Neulade-Reflex, eine offene
-- Schleife im Browser oder ein neugieriger Gast reichen, um das Kontingent zu
-- leeren — und dann steht das Produkt still, ohne dass irgendetwas kaputt ist.
--
-- Das Repository ist öffentlich und die Registrierung offen. Beides ist so
-- gewollt (ADR 0005), macht die Drosselung aber zur Bedingung dafür.
--
-- ── Warum in der Datenbank und nicht im Speicher der Function ────────────
--
-- Weil es auf Vercel keinen Speicher gibt, den zwei Aufrufe teilen. Jede
-- Anfrage kann eine andere Instanz treffen; ein Zähler in einer Modulvariablen
-- zählt dann pro Instanz und begrenzt nichts. Redis wäre die übliche Antwort
-- und hier ein zweiter Anbieter, ein zweites Geheimnis und eine zweite
-- Ausfallquelle — für einen Zähler, den Postgres atomar kann.
-- ══════════════════════════════════════════════════════════════════════════

create table public.rate_limits (
  -- Wer. Kommt **nicht** vom Aufrufer, sondern aus dem Token — siehe Funktion.
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Welcher Topf: 'chat', 'ingest', 'audio'. Als Text und nicht als Enum:
  -- Ein neuer Topf wäre sonst eine Migration mit `alter type`, und der Gewinn
  -- an Typsicherheit ist null — die Namen stehen in einer typisierten
  -- Konstante in src/lib/rate-limit.ts.
  bucket text not null,

  -- Beginn des laufenden Fensters. Läuft es ab, wird die Zeile überschrieben
  -- statt eine neue angelegt: Eine Historie wäre hier Ballast, der mit jedem
  -- Aufruf wächst.
  window_start timestamptz not null default now(),

  count integer not null default 0,

  primary key (user_id, bucket)
);

comment on table public.rate_limits is
  'Zähler je Nutzer und Topf. Nur über public.consume_rate_limit beschreibbar.';

alter table public.rate_limits enable row level security;

-- **Keine Policy, und das ist die Entscheidung.**
--
-- Ein Zähler, den der Gezählte ändern darf, ist keiner. Ohne Policy und ohne
-- `grant` kommt `authenticated` an diese Tabelle überhaupt nicht heran — weder
-- lesend noch schreibend. Der einzige Weg führt über die Funktion unten, und
-- die kann nur hochzählen.
--
-- Deshalb steht hier auch kein `grant ... to authenticated`. Das ist Absicht
-- und keine Lücke; `e2e/a2-rls-isolation` hält es fest.

-- ── Der Verbrauch, atomar ────────────────────────────────────────────────
--
-- **Grenze und Fenster stehen hier und kommen nicht vom Aufrufer.**
--
-- Die erste Fassung nahm beides als Parameter entgegen — die Route hätte
-- `consume_rate_limit('chat', 40, '1 hour')` gerufen. Das war wirkungslos, und
-- zwar vollständig: Ein angemeldeter Nutzer ruft dieselbe Funktion direkt über
-- PostgREST mit `p_window => '0 seconds'` auf, das Fenster gilt sofort als
-- abgelaufen, der Zähler springt auf eins — und der anschließende Aufruf der
-- Route sieht einen frischen Topf. Nachgemessen: bei Grenze 3 fünfmal `true`
-- statt dreimal.
--
-- Eine Drosselung, deren Parameter der Gedrosselte mitbringt, ist keine. Die
-- Werte gehören deshalb dorthin, wo er nicht hinkommt; `src/lib/rate-limit/
-- limits.ts` spiegelt sie für Oberfläche und Tests, und
-- `src/lib/__tests__/rate-limit.test.ts` liest diese Datei und vergleicht.
--
-- `security definer`, und das ist die dokumentierte Ausnahme von der Regel in
-- CLAUDE.md. Die Regel lautet: von PostgREST exponierte Funktionen sind
-- `security invoker`, weil `definer` als `postgres` läuft und RLS umgeht. Der
-- Grund dahinter ist, dass eine solche Funktion fremde Daten herausgeben
-- könnte.
--
-- Hier trifft der Grund nicht zu, und die Regel würde die Funktion unmöglich
-- machen:
--
--   * Sie **muss** eine Tabelle schreiben, die der Aufrufer nicht schreiben
--     darf — das ist ihr ganzer Zweck.
--   * Sie gibt nichts heraus als einen Wahrheitswert über den **eigenen**
--     Topf des Aufrufers.
--   * Sie nimmt **keine** Nutzer-ID entgegen. Sie liest sie aus dem Token.
--     Damit gibt es kein Argument, über das jemand fremdes Kontingent
--     verbrauchen oder ausspähen könnte — der häufigste Fehler bei genau
--     diesem Muster.
--   * `set search_path = public` verhindert, dass ein untergeschobenes Schema
--     die Bedeutung von `rate_limits` verschiebt.
create function public.consume_rate_limit(p_bucket text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_limit integer;
  v_window interval;
  v_count integer;
begin
  -- Ohne Anmeldung gibt es nichts zu verbrauchen. Die Routen prüfen das
  -- ohnehin vorher; hier steht es, damit die Funktion für sich genommen
  -- richtig ist.
  if v_user is null then
    return false;
  end if;

  -- Die Zahlen und ihre Begründung stehen in src/lib/rate-limit/limits.ts.
  -- Kurz: 40 Fragen und 30 Quellen je Stunde sind mehr, als ein Mensch in
  -- einer Stunde tut; Audio zählt als einziges über den Tag, weil das
  -- Kontingent der Sprachausgabe so bemessen ist.
  case p_bucket
    when 'chat' then
      v_limit := 40; v_window := interval '1 hour';
    when 'ingest' then
      v_limit := 30; v_window := interval '1 hour';
    when 'audio' then
      v_limit := 6; v_window := interval '24 hours';
    else
      -- Nicht stillschweigend durchlassen und nicht stillschweigend sperren.
      -- Ein unbekannter Topf heißt, dass jemand in der Anwendung einen
      -- angelegt und hier vergessen hat; das soll auffallen.
      raise exception 'unbekannter Drossel-Topf: %', p_bucket;
  end case;

  -- Ein einziges Statement, und das ist der Punkt. Lesen, prüfen, schreiben
  -- als drei Schritte hätte zwischen Schritt eins und drei eine Lücke, in der
  -- ein zweiter Aufruf denselben Stand liest — zwei gleichzeitige Anfragen
  -- kämen beide durch, obwohl nur eine durfte. Genau das passiert bei einem
  -- Doppelklick.
  --
  -- `on conflict` sperrt die Zeile für die Dauer des Statements, und die
  -- Fensterprüfung steht im `set`: Ist das Fenster abgelaufen, beginnt es neu
  -- bei eins, sonst wird erhöht.
  insert into public.rate_limits as r (user_id, bucket, window_start, count)
  values (v_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set window_start = case when now() - r.window_start >= v_window then now() else r.window_start end,
        count        = case when now() - r.window_start >= v_window then 1 else r.count + 1 end
  returning r.count into v_count;

  -- Über der Grenze wird trotzdem gezählt. Wer weiter klopft, verlängert
  -- damit seine Sperre nicht — das Fenster läuft ab wann es abläuft —, aber
  -- der Zähler bleibt die ehrliche Auskunft darüber, wie viel versucht wurde.
  return v_count <= v_limit;
end;
$$;

comment on function public.consume_rate_limit is
  'Zählt einen Vorgang im Topf des angemeldeten Nutzers und meldet, ob er noch erlaubt war. Grenze und Fenster stehen in der Funktion, nicht im Aufruf.';

-- Ausdrücklich entziehen, bevor gewährt wird: Postgres vergibt auf einer neuen
-- Funktion standardmäßig `execute` an `public`. Ohne diese Zeile dürfte auch
-- `anon` sie aufrufen — folgenlos, weil ohne Token kein Topf existiert, aber
-- nichts, was man der Voreinstellung überlässt. Dasselbe Muster wie in
-- Migration 0011 bei `claim_audio_overview`.
revoke all on function public.consume_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text) to authenticated;

-- Der Index, den die Aufräumfunktion braucht. Ohne ihn wird das Wegräumen
-- alter Zeilen zum Seq Scan über die am schnellsten wachsende Tabelle.
create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- ── Aufräumen ────────────────────────────────────────────────────────────
--
-- Ohne das wächst die Tabelle mit jedem Nutzer und Topf und schrumpft nie:
-- Eine Zeile, deren Fenster vor Wochen ablief, ist Ballast, der bei jedem
-- Upsert mit gesperrt wird.
--
-- Als Funktion und nicht als `delete` im Anwendungscode, damit `pg_cron` sie
-- direkt aufrufen kann — wie beim Reaper.
create function public.reap_rate_limits()
returns integer
language sql
security definer
set search_path = public
as $$
  with weg as (
    -- Eine Stunde Sicherheitsabstand auf das längste Fenster im Produkt.
    -- Knapper zu räumen hieße, eine Zeile zu löschen, die gleich wieder
    -- gebraucht wird.
    delete from public.rate_limits where window_start < now() - interval '25 hours'
    returning 1
  )
  select coalesce(count(*), 0)::integer from weg;
$$;

-- Nur der Job darf das. Ohne diese Zeile stünde die Funktion über PostgREST
-- offen — nachgemessen: Sie war **ohne Token** aufrufbar und antwortete mit 0.
-- Der Schaden wäre gering (sie löscht nur abgelaufene Fenster), die Lücke
-- trotzdem echt. `reap_stale_ingests` macht es seit Migration 0005 richtig;
-- diese hier hatte es schlicht vergessen.
revoke all on function public.reap_rate_limits() from public, anon, authenticated;

-- Einmal täglich reicht: Es geht um Speicher, nicht um Korrektheit. Ein
-- abgelaufenes Fenster wird beim nächsten Aufruf ohnehin zurückgesetzt.
select cron.schedule(
  'reap-rate-limits',
  '17 4 * * *',
  $$select public.reap_rate_limits()$$
);
