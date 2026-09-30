-- ============================================================================
-- Migration 020 — Admin Reviews Permission (Faz 33)
-- ============================================================================
-- AMAÇ:
--   Mevcut aktif admin kullanıcılara villa yorum moderation yetkisini ekler.
--   Sidebar "Yorumlar" linkinin görünmesi için sidebar_permissions JSONB
--   array'inde "reviews" key'i bulunmalı.
--
-- PATTERN:
--   013_admin_homepage_collection_permission.sql,
--   016_admin_messages_permission.sql ve
--   018_admin_faqs_permission.sql ile birebir aynı idempotent yaklaşım.
--   Tekrar çalıştırılabilir: zaten "reviews" varsa dokunulmaz.
--
-- BACKWARD-COMPATIBILITY:
--   • Bu yetki gelmemiş admin'ler "Yorumlar" menüsünü göremez
--     (UI level filter); review moderation kullanılamaz ama sistem
--     hiçbir şekilde kırılmaz.
--   • Public villa detail sayfası bu migration'dan BAĞIMSIZ; anon
--     kullanıcılar approved yorumları her zaman görür (RLS / public read).
--   • Reservation, pricing, availability, BookingSidebar, gallery,
--     storage, auth middleware, search, sitemap — etkilenmez.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   update public.admin_users
--   set sidebar_permissions = sidebar_permissions - 'reviews'
--   where sidebar_permissions ? 'reviews';
-- ============================================================================

update public.admin_users
set sidebar_permissions =
  case
    when sidebar_permissions is null then '["reviews"]'::jsonb
    else sidebar_permissions || '["reviews"]'::jsonb
  end
where is_active = true
  and (
    sidebar_permissions is null
    or not (sidebar_permissions ? 'reviews')
  );