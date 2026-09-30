-- ============================================================================
-- Migration 044 — PROPERTY OWNERS (mülk sahipleri) — MİNİMAL
-- ============================================================================
-- AMAÇ:
--   "Bu villa kimin?" — basit mülk sahibi kaydı + villa bağlantısı.
--   CRM/muhasebe/hakediş/owner-login YOK. Yalnız: ad/soyad/telefon/mail/iban.
--
-- KAPSAM:
--   • property_owners tablosu (PII: phone/email/iban) → ADMIN-ONLY;
--     public ASLA okuyamaz (yetkilendirme uygulama katmanında).
--   • villa.owner_id nullable FK → on delete SET NULL (owner silinince villa
--     silinmez, yalnız bağlantı kopar). villa erişim modeli DEĞİŞMEZ
--     (owner_id sadece UUID — PII değil, public select'te zararsız).
--   • sidebar permission backfill ("property_owners") — 013 deseni, idempotent.
--
-- ÖZELLİKLER: idempotent · transaction-safe · fail-safe · rollback-safe.
-- DOKUNULMAYAN: villa/reservation/cache/SEO/security.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) GUARD garanti (idempotent)
-- ----------------------------------------------------------------------------
create index if not exists idx_admin_users_auth_user_id
  on public.admin_users (auth_user_id);


-- ----------------------------------------------------------------------------
-- 1) TABLO (idempotent)
-- ----------------------------------------------------------------------------
create table if not exists public.property_owners (
  id          uuid primary key default gen_random_uuid(),
  first_name  text,
  last_name   text,
  phone       text,
  email       text,
  iban        text,
  created_at  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 2) VILLA BAĞLANTISI — owner_id nullable FK (on delete SET NULL)
-- ----------------------------------------------------------------------------
alter table public.villa
  add column if not exists owner_id uuid;

-- FK constraint idempotent (yoksa ekle)
do $fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'villa_owner_id_fkey'
  ) then
    alter table public.villa
      add constraint villa_owner_id_fkey
      foreign key (owner_id)
      references public.property_owners (id)
      on delete set null;
  end if;
end
$fk$;

-- "Villa Sayısı" sayımı + join için index
create index if not exists idx_villa_owner_id
  on public.villa (owner_id);


-- ----------------------------------------------------------------------------
-- 4) SIDEBAR PERMISSION BACKFILL — "property_owners" (013 deseni, idempotent)
-- ----------------------------------------------------------------------------
update public.admin_users
set sidebar_permissions =
  case
    when sidebar_permissions @> '["property_owners"]'::jsonb
      then sidebar_permissions
    else coalesce(sidebar_permissions, '[]'::jsonb) || '["property_owners"]'::jsonb
  end
where sidebar_permissions is null
   or not (sidebar_permissions @> '["property_owners"]'::jsonb);


-- ----------------------------------------------------------------------------
-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.villa drop constraint if exists villa_owner_id_fkey;
-- alter table public.villa drop column if exists owner_id;
-- drop table if exists public.property_owners;
-- -- (permission backfill geri alma opsiyonel; zararsız bırakılabilir)
-- ============================================================================
