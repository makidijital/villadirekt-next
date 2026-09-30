-- ============================================================================
-- Migration 018 — Admin FAQs Permission
-- ============================================================================
-- AMAÇ:
--   Mevcut aktif admin kullanıcılara global FAQ yönetim yetkisini ekler.
--   Sidebar "Sık Sorulan Sorular" linkinin görünmesi için
--   sidebar_permissions JSONB array'inde "faqs" key'i bulunmalı.
--
-- PATTERN:
--   013_admin_homepage_collection_permission.sql ve
--   016_admin_messages_permission.sql ile birebir aynı yaklaşım.
--   Idempotent: zaten "faqs" varsa dokunulmaz.
--
-- BACKWARD-COMPATIBILITY:
--   • Bu yetki gelmemiş admin'ler "Sık Sorulan Sorular" menüsünü
--     göremez (UI level filter); FAQ functionality kullanılamaz ama
--     sistem hiçbir şekilde kırılmaz.
--   • Public homepage FAQ section bu migration'dan BAĞIMSIZ;
--     anon kullanıcılar her zaman görür (RLS / public read).
-- ============================================================================

update public.admin_users
set sidebar_permissions =
  case
    when sidebar_permissions is null then '["faqs"]'::jsonb
    else sidebar_permissions || '["faqs"]'::jsonb
  end
where is_active = true
  and (
    sidebar_permissions is null
    or not (sidebar_permissions ? 'faqs')
  );