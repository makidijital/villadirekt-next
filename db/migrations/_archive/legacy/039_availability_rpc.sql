-- ============================================================================
-- Migration 039 — AVAILABILITY RPC (SECURITY DEFINER, PII-SAFE)
-- ============================================================================
-- AMAÇ:
--   reservations / manual_reservations tabloları PII içerir ve admin-only
--   olarak kapatılacaktı. Public availability (arama + per-villa takvim) ise
--   bu tabloları doğrudan okuyordu. Bu migration, public tarafın PII görmeden
--   yalnız "blocked tarih / villa_id" bilgisini alabilmesi için SECURITY
--   DEFINER RPC katmanı kurar.
--
--   ❌ ESKİ:  browser → reservations select * / manual_reservations select *
--   ✅ YENİ:  browser → SECURITY DEFINER RPC → yalnız blocked date range / villa_id
--
--   RPC'ler tablo SAHİBİ (postgres) yetkisiyle çalışır → underlying tablolara
--   erişebilir. Dönen alanlar SADECE: villa_id, start_date, end_date,
--   kind, status. ASLA: name / phone / email / price / commission / payload.
--
-- ÖZELLİKLER: idempotent (CREATE OR REPLACE) · search_path pinned ·
--   minimum projection · 040'tan ÖNCE deploy edilebilir (additive, kırmaz).
--
-- ⚠️ SEMANTIC LOCKSTEP (mevcut app davranışıyla BİREBİR):
--   • reservations blocking allow-list = ('pending','confirmed')
--   • manual_reservations = tüm satırlar blocking (status filtresi yok)
--   • external_calendar_events = is_active=true (yalnız get_blocked_villa_ids;
--     per-villa takvim sidebar'ı external OKUMUYOR → ranges RPC'sine DAHİL DEĞİL)
--   • half-open overlap: start_date < range_end AND end_date > range_start
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) get_blocked_villa_ids — /arama tarih filtresi (getBlockedVillaIds karşılığı)
-- ----------------------------------------------------------------------------
-- Verilen [p_start, p_end) için BLOCKED villa_id kümesi. p_villa_ids verilirse
-- yalnız o alt kümede arar (performans). reservations + manual + external (OR).
create or replace function public.get_blocked_villa_ids(
  p_start date,
  p_end date,
  p_villa_ids uuid[] default null
)
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with src as (
    select r.villa_id
    from public.reservations r
    where p_start < p_end
      and r.status in ('pending','confirmed')
      and r.start_date < p_end
      and r.end_date   > p_start
      and (p_villa_ids is null or r.villa_id = any (p_villa_ids))
    union
    select m.villa_id
    from public.manual_reservations m
    where p_start < p_end
      and m.start_date < p_end
      and m.end_date   > p_start
      and (p_villa_ids is null or m.villa_id = any (p_villa_ids))
    union
    select e.villa_id
    from public.external_calendar_events e
    where p_start < p_end
      and e.is_active = true
      and e.start_date < p_end
      and e.end_date   > p_start
      and (p_villa_ids is null or e.villa_id = any (p_villa_ids))
  )
  select distinct villa_id
  from src
  where villa_id is not null;
$$;


-- ----------------------------------------------------------------------------
-- 2) get_villa_blocked_ranges — per-villa takvim (useBookingEngine /
--    fetchVillaAvailability karşılığı). SADECE tarih + kind + status.
-- ----------------------------------------------------------------------------
-- Sidebar takvimi "pending" ve "confirmed"i farklı renklendirir + manual'ı
-- ayırır → kind + status döndürülür. external DAHİL DEĞİL (mevcut davranış aynen).
create or replace function public.get_villa_blocked_ranges(
  p_villa_id uuid
)
returns table (
  kind       text,
  status     text,
  start_date date,
  end_date   date
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select 'reservation'::text, r.status::text, r.start_date, r.end_date
  from public.reservations r
  where r.villa_id = p_villa_id
    and r.status in ('pending','confirmed')
  union all
  select 'manual'::text, null::text, m.start_date, m.end_date
  from public.manual_reservations m
  where m.villa_id = p_villa_id;
$$;


-- ----------------------------------------------------------------------------
-- 3) check_villa_availability_conflict — booking pre-submit fast-path (opsiyonel
--    UX). reservations(pending/confirmed) + manual overlap → boolean.
-- ----------------------------------------------------------------------------
-- NOT: Asıl atomik garanti DB EXCLUDE constraint (reservations_no_overlap).
-- Bu RPC yalnız INSERT öncesi hızlı feedback için; PII döndürmez (boolean).
create or replace function public.check_villa_availability_conflict(
  p_villa_id uuid,
  p_start date,
  p_end date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.reservations r
    where r.villa_id = p_villa_id
      and r.status in ('pending','confirmed')
      and r.start_date < p_end
      and r.end_date   > p_start
    union all
    select 1 from public.manual_reservations m
    where m.villa_id = p_villa_id
      and m.start_date < p_end
      and m.end_date   > p_start
  );
$$;


-- ----------------------------------------------------------------------------
-- 4) GRANTS — public revoke; execute yalnız uygulama rolüne
-- ----------------------------------------------------------------------------
-- RPC içi tablo erişimi DEFINER (tablo sahibi) yetkisiyle yapılır →
-- availability çalışmaya devam eder, PII açılmaz.
revoke all on function public.get_blocked_villa_ids(date, date, uuid[]) from public;
revoke all on function public.get_villa_blocked_ranges(uuid) from public;
revoke all on function public.check_villa_availability_conflict(uuid, date, date) from public;


-- ----------------------------------------------------------------------------
-- 5) PERFORMANS — overlap index'leri (idempotent)
-- ----------------------------------------------------------------------------
-- half-open overlap predikatları (villa_id + start_date + end_date) için.
-- reservations: partial (yalnız blocking statüler) — daha küçük index.
create index if not exists idx_reservations_avail
  on public.reservations (villa_id, start_date, end_date)
  where status in ('pending','confirmed');

create index if not exists idx_manual_reservations_avail
  on public.manual_reservations (villa_id, start_date, end_date);

-- external_calendar_events overlap index'i migration 031'de mevcut
-- (external_calendar_events_overlap_idx WHERE is_active=true) — tekrar yaratılmaz.


-- ----------------------------------------------------------------------------
-- 6) DOĞRULAMA (manuel — opsiyonel)
-- ----------------------------------------------------------------------------
-- select * from public.get_villa_blocked_ranges('<VILLA_UUID>');
-- select public.get_blocked_villa_ids('2026-07-01','2026-07-05', null);
-- select public.check_villa_availability_conflict('<VILLA_UUID>','2026-07-01','2026-07-05');
--
-- ROLLBACK:
-- drop function if exists public.get_blocked_villa_ids(date, date, uuid[]);
-- drop function if exists public.get_villa_blocked_ranges(uuid);
-- drop function if exists public.check_villa_availability_conflict(uuid, date, date);
-- ============================================================================
