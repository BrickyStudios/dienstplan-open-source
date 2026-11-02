-- Höchstens EINE offene Schichttausch-Anfrage pro (eigener) Schicht.
-- Verhindert race-sicher, dass für dieselbe requester_shift_id mehrere offene Anfragen entstehen
-- (App prüft zusätzlich vorab; dieser partielle Unique-Index ist die harte DB-Garantie).
--
-- Einmalig im Supabase-SQL-Editor ausführen (deployt NICHT automatisch mit).
-- Idempotent: der Dedup-Schritt ist auf einer frischen DB ein No-Op.

-- 1) BESTANDS-BEREINIGUNG: existieren aus der Zeit vor dem Fix schon mehrere OFFENE Anfragen
--    für dieselbe Schicht, würde der Unique-Index scheitern (23505). Daher pro requester_shift_id
--    nur die NEUESTE offene Anfrage behalten, alle älteren offenen auf 'failed' setzen.
with ranked as (
  select id,
         row_number() over (partition by requester_shift_id order by created_at desc) as rn
  from shift_swap_requests
  where status in ('pending_leitung', 'pending_colleague')
)
update shift_swap_requests s
   set status = 'failed',
       resolved_at = now()
  from ranked r
 where s.id = r.id
   and r.rn > 1;

-- 2) Jetzt den partiellen Unique-Index anlegen.
create unique index if not exists uniq_open_swap_per_shift
  on shift_swap_requests (requester_shift_id)
  where status in ('pending_leitung', 'pending_colleague');
