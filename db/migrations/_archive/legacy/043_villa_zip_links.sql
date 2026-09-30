-- ============================================================================
-- Migration 043 — VILLA ZIP DOWNLOAD LINKS (admin-only tablo + consume RPC)
-- ============================================================================
-- AMAÇ:
--   Admin panelden bir villa için süreli/iptal-edilebilir "ZIP indirme
--   linki" üretimi. Link sahibi villanın TÜM görsellerini tek ZIP olarak
--   (runtime stream; FİZİKSEL ZIP YOK) indirir.
--
--   Tablo `shared_villa_lists` (035) desenini izler: token + expires_at +
--   revoked_at + lazy 404. Görseller zaten public bucket'ta; token gizli
--   veriyi değil KONTROLLÜ/SAYILAN/İPTAL-EDİLEBİLİR bulk indirme kanalını
--   korur.
--
-- ERİŞİM MODELİ:
--   • Tablo admin-only: public ERİŞEMEZ; yalnız aktif admin
--     (create/revoke/list) ve sunucu tarafı yönetim bağlantısı.
--   • Public download route (server-only) `consume_villa_zip_token`
--     RPC'sini çağırır: token doğrula (revoked/expired hariç) + atomik
--     download_count++ + villa_id döndür. SECURITY DEFINER → tablo yalnız
--     bu kontrollü yüzeyden okunur.
--
-- ÖZELLİKLER: idempotent · transaction-safe · fail-safe · rollback-safe.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) GUARD garanti (idempotent)
-- ----------------------------------------------------------------------------
create index if not exists idx_admin_users_auth_user_id
  on public.admin_users (auth_user_id);


-- ----------------------------------------------------------------------------
-- 1) TABLO (idempotent)
-- ----------------------------------------------------------------------------
create table if not exists public.villa_zip_links (
  id             uuid primary key default gen_random_uuid(),
  villa_id       uuid not null references public.villa (id) on delete cascade,
  token          text not null,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  download_count integer not null default 0,
  created_at     timestamptz not null default now(),
  created_by     uuid       -- admin_users.id (nullable; FK YOK — soft ref)
);

-- Token unique + O(1) lookup
create unique index if not exists villa_zip_links_token_idx
  on public.villa_zip_links (token);
-- Admin listeleme: villa bazlı, yeni→eski
create index if not exists villa_zip_links_villa_created_idx
  on public.villa_zip_links (villa_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 3) CONSUME RPC — token doğrula + atomik download_count++ + villa_id döndür
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER: tablo admin-only olsa da bu RPC tek satırı
-- token ile okur/günceller. Yalnız geçerli (revoked değil + süresi dolmamış)
-- token için download_count'u atomik artırır ve villa_id döner; aksi → null.
-- Download route (server-only) bunu çağırır. Listeleme/enumerate YOK.
create or replace function public.consume_villa_zip_token(p_token text)
returns uuid
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  update public.villa_zip_links
     set download_count = download_count + 1
   where token = p_token
     and revoked_at is null
     and expires_at > now()
  returning villa_id;
$$;

revoke all on function public.consume_villa_zip_token(text) from public;


-- ----------------------------------------------------------------------------
-- DOĞRULAMA / ROLLBACK
-- ----------------------------------------------------------------------------
-- select public.consume_villa_zip_token('<token>');  -- villa_id veya null
-- ROLLBACK:
--   drop function if exists public.consume_villa_zip_token(text);
--   drop table if exists public.villa_zip_links;
-- ============================================================================
