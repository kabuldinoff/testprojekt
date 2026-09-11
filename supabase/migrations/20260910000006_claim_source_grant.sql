-- ═══════════════════════════════════════════════════════════════════════════
-- Ausführungsrecht auf claim_source für den Verarbeitungslauf.
--
-- ── Wie das aufgefallen ist ───────────────────────────────────────────────
--
-- Migration 0004 nimmt `claim_source` per `revoke all … from public, anon,
-- authenticated` aus der Reichweite der Clients. Was sie nicht tut: dem
-- Verarbeitungslauf das Recht ausdrücklich geben. Dass er die Funktion
-- trotzdem aufrufen konnte, war eine Voreinstellung der Plattform — und
-- Voreinstellungen sind nicht überall dieselben.
--
-- Gemessen: mit Supabase-CLI 2.114.0 endete jede Verarbeitung lokal mit
--
--     permission denied for function claim_source   (SQLSTATE 42501)
--
-- und die Quelle blieb auf `pending` stehen. Mit der im Projekt gepinnten
-- 2.117.0 lief dieselbe Migration durch und `service_role` durfte. Zwei
-- Umgebungen, dasselbe SQL, verschiedenes Verhalten.
--
-- ── Warum das hier steht und nicht in 0004 ────────────────────────────────
--
-- 0004 ist bereits angewandt. Eine angewandte Migration wird nicht
-- nachträglich umgeschrieben — Supabase führt Buch darüber, und eine
-- geänderte Datei liefe nie wieder. Die Ergänzung ist deshalb eine eigene
-- Migration.
--
-- Es ist derselbe Gedanke wie in 0001 bei „automatically expose new tables":
-- was für Zugriff und Sicherheit zählt, gehört in die Migration und nicht in
-- eine Voreinstellung, die man nicht sieht und nicht mitliefert.
-- ═══════════════════════════════════════════════════════════════════════════

grant execute on function public.claim_source(uuid, integer, integer) to service_role;

-- Die Gegenprobe bleibt bestehen: kein Client darf den Zustand einer Quelle
-- umschreiben. Sie steht hier noch einmal, damit ein späteres `grant execute
-- … to public` nicht unbemerkt beides öffnet.
revoke execute on function public.claim_source(uuid, integer, integer)
  from public, anon, authenticated;
