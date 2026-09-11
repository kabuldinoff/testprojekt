-- ═══════════════════════════════════════════════════════════════════════════
-- Der Reaper gab erschöpfte Läufe in eine Sackgasse zurück.
--
-- ── Der Fehler ────────────────────────────────────────────────────────────
--
-- `reap_stale_ingests` (Migration 0005) setzt jede Quelle mit abgelaufener
-- Lease auf `pending` zurück — ohne zu prüfen, ob überhaupt noch ein Versuch
-- übrig ist. `claim_source` verlangt aber `attempts < p_max_attempts`.
--
-- Stirbt also der **letzte** erlaubte Versuch, entsteht ein Zustand, aus dem
-- es keinen Weg mehr gibt: Die Quelle steht auf `pending`, kein Lauf kann sie
-- übernehmen, und die Oberfläche fragt endlos nach, weil `pending` für sie
-- „kommt gleich" heißt. Ein hängender Ladebalken, den keine Fehlermeldung
-- erklärt — genau die Sorte Zustand, die dieser Zustandsautomat verhindern
-- sollte.
--
-- Nachgemessen: Quelle mit `attempts = 3` und abgelaufener Lease, Reaper
-- laufen lassen, dann `claim_source` — keine Zeile. Dauerhaft.
--
-- Aufgefallen ist es im Review des Audio-Überblicks, dessen Reaper denselben
-- Bauplan hat. Dort steht es von Anfang an richtig; hier wird es nachgezogen.
--
-- ── Die Behebung ──────────────────────────────────────────────────────────
--
-- Wer keinen Versuch mehr hat, endet in `failed` mit einem Grund. Das ist
-- kein neuer Zustand, sondern der, den der Automat für genau diesen Fall
-- schon kennt — er wurde nur nicht erreicht.
--
-- `create or replace`, weil Migration 0005 längst angewandt ist: Eine
-- angewandte Migration wird nicht umgeschrieben, sondern ergänzt.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.reap_stale_ingests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  betroffen integer;
begin
  -- Die Grenze steht als Literal da und nicht als Parameter, weil sie zur
  -- Bedingung in `claim_source` passen muss: Beide beziehen sich auf dieselbe
  -- Zahl, und ein Parameter hier würde nur vortäuschen, dass sie frei wählbar
  -- wäre. Sie steht im Anwendungscode als `MAX_ATTEMPTS`.
  update public.sources
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      lease_expires_at = null,
      error_message = case
        when attempts >= 3
          then 'Die Verarbeitung wurde mehrfach abgebrochen und wird nicht erneut versucht.'
        else 'Ein Verarbeitungsversuch wurde abgebrochen. Es wird erneut versucht.'
      end
  where status = 'processing'
    and lease_expires_at is not null
    and lease_expires_at < now();

  get diagnostics betroffen = row_count;
  return betroffen;
end;
$$;

comment on function public.reap_stale_ingests() is
  'Setzt Quellen mit abgelaufener Lease zurück — auf pending, solange Versuche übrig sind, sonst auf failed. Läuft per pg_cron jede Minute.';

-- Die Rechte gelten weiter; `create or replace` lässt sie unangetastet. Zur
-- Sicherheit noch einmal ausgeschrieben, damit ein späteres Lesen dieser
-- Datei nicht den Eindruck erweckt, hier sei etwas offen geblieben.
revoke all on function public.reap_stale_ingests() from public, anon, authenticated;

-- ── Bestehende Sackgassen auflösen ────────────────────────────────────────
-- Zeilen, die vor dieser Migration in den Zustand geraten sind, kommen von
-- allein nicht mehr heraus. In Produktion sollte es keine geben; hier steht
-- es trotzdem, weil eine Reparatur, die nur für die Zukunft gilt, den bereits
-- betroffenen Nutzer nicht interessiert.
update public.sources
set status = 'failed',
    error_message = 'Die Verarbeitung wurde mehrfach abgebrochen und wird nicht erneut versucht.'
where status = 'pending' and attempts >= 3;
