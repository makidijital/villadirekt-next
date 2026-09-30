-- ============================================================================
-- Migration 022 — Offer Requests (Faz 40)
-- ============================================================================
-- AMAÇ:
--   Guest concierge teklif alma sayfası (/teklif-al) submission'larını
--   saklamak. Admin /maki-admin/offer-requests sayfasında listelenir
--   ve status (pending/contacted/offered/closed) takibi yapılır.
--
-- TASARIM:
--   • Tüm tercih alanları (regions, villa_types, features) text[] —
--     opsiyonel FK yerine slug/id snapshot tutar (forward-compat,
--     join'siz query)
--   • status text + check constraint
--   • Yeniden çalıştırılabilir (idempotent)
--
-- ============================================================================

create table if not exists public.offer_requests (
  id              uuid primary key default gen_random_uuid(),
  travel_group    text,
  start_date      date,
  end_date        date,
  adults          int default 1,
  children        int default 0,
  region_tokens   text[] default '{}',
  villa_type_tokens text[] default '{}',
  feature_tokens  text[] default '{}',
  budget_min      int,
  budget_max      int,
  budget_currency text default 'TRY',
  full_name       text not null,
  phone           text not null,
  email           text,
  note            text,
  status          text not null default 'pending'
    check (status in ('pending', 'contacted', 'offered', 'closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create index if not exists offer_requests_status_idx
  on public.offer_requests (status);
create index if not exists offer_requests_created_at_idx
  on public.offer_requests (created_at desc);


-- ---- Admin sidebar permission grant (idempotent) ----
update public.admin_users
set sidebar_permissions =
  case
    when sidebar_permissions is null then '["offer_requests"]'::jsonb
    else sidebar_permissions || '["offer_requests"]'::jsonb
  end
where is_active = true
  and (
    sidebar_permissions is null
    or not (sidebar_permissions ? 'offer_requests')
  );

comment on table public.offer_requests is
  'Guest concierge offer request submissions (Faz 40). Kayıt public form '
  'route''undan oluşur; yönetim admin panelinden yapılır. '
  'Status: pending/contacted/offered/closed.';