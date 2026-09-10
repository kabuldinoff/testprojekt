-- ═══════════════════════════════════════════════════════════════════════════
-- Der Reaper: holt hängengebliebene Verarbeitungen zurück.
--
-- `after()` ist fire-and-forget. Stirbt die Instanz mitten in der Arbeit,
-- bliebe die Quelle auf `processing` stehen — sichtbar als Ladebalken, der
-- nie fertig wird. Dieser Job setzt abgelaufene Leases zurück auf `pending`,
-- damit sie erneut übernommen werden können.
--
-- ── Eine Planänderung, ausdrücklich ───────────────────────────────────────
--
-- Migration 0003 legte `pg_net` an mit der Begründung, pg_cron werde später
-- per HTTP in die Anwendung zurückrufen. Beim Bauen stellte sich heraus, dass
-- das der falsche Weg ist:
--
-- Die Ingest-Route verlangt eine angemeldete Sitzung — genau deshalb, weil sie
-- den Besitz prüft, bevor der Secret-Key-Client benutzt wird. Ein Datenbank-Job
-- hat keine Sitzung. Ihn aufrufen zu lassen hieße, entweder diese Prüfung zu
-- durchlöchern oder ein zweites Geheimnis einzuführen, das die Datenbank
-- kennt, in Vercel gesetzt sein muss und irgendwo rotiert werden will.
--
-- Der Job setzt deshalb nur den Zustand zurück. Die Wiederaufnahme macht der
-- Client: die Notebook-Seite stößt beim Laden jede Quelle an, die auf
-- `pending` steht — mit der Sitzung des Nutzers, durch dieselbe geprüfte
-- Route wie beim ersten Mal.
--
-- Der Preis: hat niemand das Notebook offen, wartet die Quelle. Das ist
-- vertretbar, denn wer sie sehen will, öffnet das Notebook ohnehin — und die
-- Alternative war ein Dienst-zu-Dienst-Geheimnis für einen Zeitgewinn, den
-- niemand bemerkt.
--
-- Damit wird `pg_net` nicht gebraucht und fliegt wieder raus, statt als
-- ungenutzte Erweiterung stehenzubleiben.
-- ═══════════════════════════════════════════════════════════════════════════

drop extension if exists pg_net;

create function public.reap_stale_ingests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  betroffen integer;
begin
  update public.sources
  set status = 'pending',
      lease_expires_at = null,
      -- Der Grund bleibt sichtbar, bis ein neuer Versuch ihn ersetzt. Ohne
      -- ihn stünde die Quelle wieder auf `pending`, als wäre nichts gewesen.
      error_message = 'Ein Verarbeitungsversuch wurde abgebrochen. Es wird erneut versucht.'
  where status = 'processing'
    and lease_expires_at is not null
    and lease_expires_at < now();

  get diagnostics betroffen = row_count;
  return betroffen;
end;
$$;

comment on function public.reap_stale_ingests() is
  'Setzt Quellen mit abgelaufener Lease auf pending zurück. Läuft per pg_cron jede Minute; die Wiederaufnahme selbst macht der Client mit der Sitzung des Nutzers.';

-- Nur der Job darf das. Kein Client soll fremde Zustände zurücksetzen können.
revoke all on function public.reap_stale_ingests() from public, anon, authenticated;

-- Jede Minute. Die Lease läuft nach fünf Minuten ab, ein Nutzer wartet also
-- höchstens sechs — kurz genug, dass niemand die Seite neu lädt, und lang
-- genug, dass ein normal langsamer Lauf nicht abgeräumt wird.
select cron.schedule('reap-stale-ingests', '* * * * *', $$ select public.reap_stale_ingests() $$);
