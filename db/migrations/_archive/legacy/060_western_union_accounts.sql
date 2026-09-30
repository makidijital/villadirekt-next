-- ============================================================================
-- Migration 060 — western_union_accounts (Western Union ödeme bilgileri)
-- ============================================================================
-- AMAÇ:
--   Western Union ödeme yöntemi için AYRI veri kaynağı. EFT/Havale
--   `payment_accounts` tablosunu KULLANMAYA DEVAM EDER; WU tamamen kendi
--   tablosuna sahip olur → mevcut EFT akışı byte-identical kalır.
--
--   Akış:
--     EFT/Havale     → payment_accounts        (DOKUNULMADI)
--     Western Union  → western_union_accounts  (BU MİGRASYON)
--
-- TASARIM:
--   • payment_accounts ile aynı "single-active" mantığı: app katmanı
--     (western-union-account.service) aynı anda tek aktif kayıt tutar.
--   • Erişim modeli: migration 034 (payment_accounts) ile BİREBİR aynı —
--     public erişim YOK; yalnız aktif admin CRUD yapar (yetkilendirme
--     uygulama katmanında); mail akışı server-only reader kullanır.
--
-- DOKUNULMAYANLAR:
--   payment_accounts · payment_methods · settings · reservations.
--
-- İDEMPOTENT: create table if not exists / create or replace
--   or replace. Tekrar çalıştırmaya güvenli.
--
-- ROLLBACK:
--   drop trigger if exists western_union_accounts_touch_updated_at on public.western_union_accounts;
--   drop function if exists public.trg_western_union_accounts_touch_updated_at();
--   drop table if exists public.western_union_accounts;
-- ============================================================================

-- ---- 1) Tablo ----
create table if not exists public.western_union_accounts (
  id             uuid primary key default gen_random_uuid(),
  recipient_name text not null,
  country        text,
  city           text,
  phone          text,
  instructions   text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.western_union_accounts is
  'Western Union ödeme alıcı bilgileri. EFT/Havale payment_accounts''tan '
  'tamamen ayrı; single-active app katmanında enforce edilir. Mail akışı '
  'western-union-account.server.ts (server-only) ile aktif kaydı okur.';

-- ---- 2) updated_at auto-touch trigger (settings pattern) ----
create or replace function public.trg_western_union_accounts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists western_union_accounts_touch_updated_at
  on public.western_union_accounts;
create trigger western_union_accounts_touch_updated_at
  before update on public.western_union_accounts
  for each row
  execute function public.trg_western_union_accounts_touch_updated_at();


