-- ============================================================================
-- Migration 057 — Shared Favorite Lists: scheduled cleanup of expired rows
-- ============================================================================
-- AMAÇ:
--   shared_favorite_lists tablosunda expires_at değeri geçmiş satırları
--   otomatik silmek. Application layer her share için TTL set ediyor
--   (7 gün); süresi dolanlar boş yere tabloda birikmesin.
--
--   shared_villa_lists (migration 036) ile BİREBİR AYNI mimari:
--   pg_cron + cleanup function. Yeni yaklaşım üretilmedi.
--
-- STRATEJİ:
--   • pg_cron extension (eski sağlayıcıda yerleşik) ile saat başı (`0 * * * *`)
--     `delete from shared_favorite_lists where expires_at < now()` çalıştır.
--   • Cleanup function `public.cleanup_expired_shared_favorite_lists()` —
--     hem manuel çağrılabilir hem cron'dan tetiklenir.
--   • İdempotent: `create extension if not exists`, `create or replace`,
--     `cron.unschedule` + `cron.schedule` pattern.
--   • shared_favorite_lists'te revoked_at kolonu YOK → yalnız expires_at
--     filtresi (036'daki delete ile aynı semantik).
--
-- DEFANSİF NOTLAR:
--   • pg_cron extension eski sağlayıcı tarafında yüklü olmalı. Self-hosted
--     Postgres'te yoksa migration 'extension does not exist' ile düşer.
--     Bu durumda admin veritabanı yönetim paneli → Database → Extensions'tan
--     pg_cron'u enable edip migration'ı tekrar çalıştırabilir.
--   • Cleanup function `security definer` DEĞIL (036 ile aynı; pg_cron
--     postgres rolünde çalışır).
--
-- ⚠️ shared_villa_lists / 036 sistemine DOKUNULMAZ — bu tamamen ayrı,
--    favorites'e özel paralel kurulum.
--
-- ROLLBACK (gerekirse):
--   select cron.unschedule('shared-favorite-lists-cleanup');
--   drop function if exists public.cleanup_expired_shared_favorite_lists();
-- ============================================================================

-- ---- 1) Cleanup function ----
create or replace function public.cleanup_expired_shared_favorite_lists()
returns integer
language plpgsql
as $$
declare
  deleted_count integer;
begin
  delete from public.shared_favorite_lists
   where expires_at is not null
     and expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.cleanup_expired_shared_favorite_lists() is
  'Expired shared favorite lists cleanup. expires_at < now() satırları '
  'siler ve silinen satır sayısını döner. pg_cron tarafından saat '
  'başı tetiklenir; manuel çağrı da güvenli (idempotent). 7 günlük TTL '
  'application layer (shared-favorites.service) tarafından set edilir.';

-- ---- 2) pg_cron extension (eski sağlayıcıda yerleşik) ----
do $$
begin
  -- pg_cron extension'ı oluşturmaya çalış; yüklü değilse warning at,
  -- migration kesilmesin (dashboard'dan manuel enable gerekir).
  begin
    create extension if not exists pg_cron;
  exception
    when others then
      raise notice 'pg_cron extension yüklenemedi (%). Cron job atlanıyor; cleanup function manuel çağrılabilir.', sqlerrm;
  end;
end $$;

-- ---- 3) Schedule — saat başı ----
do $$
begin
  -- pg_cron yoksa cron schema da yok; bu blok hata atmasın diye guard'lı.
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    -- Aynı isimde job varsa düşür (idempotent re-run).
    perform cron.unschedule('shared-favorite-lists-cleanup')
    where exists (
      select 1 from cron.job where jobname = 'shared-favorite-lists-cleanup'
    );

    -- Saat başı çalıştır: 0 * * * * → her saatin 0. dakikası
    perform cron.schedule(
      'shared-favorite-lists-cleanup',
      '0 * * * *',
      $cron$select public.cleanup_expired_shared_favorite_lists()$cron$
    );
  else
    raise notice
      'pg_cron yüklü değil; saat başı cleanup zamanlanamadı. '
      'Manuel: select public.cleanup_expired_shared_favorite_lists();';
  end if;
end $$;