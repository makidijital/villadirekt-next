-- ============================================================================
-- 🛡️ Migration 093 — admin_users.sidebar_permissions backfill ('blog')
-- ============================================================================
-- AMAÇ:
--   "Blog Yazıları" admin sayfası ÖNCEDEN sidebar'da ve blog translation
--   action'larında `pages` permission key'ini REUSE ediyordu. Artık kendi
--   key'i var ("blog", bkz. app/services/admin-user.service.ts >
--   SIDEBAR_PERMISSIONS ve app/(admin)/maki-admin/layout.tsx).
--
--   Bu migration olmadan: mevcut admin'lerin sidebar_permissions JSONB
--   array'inde "blog" bulunmadığı için "Blog Yazıları" menüsü HERKESTE
--   kaybolurdu. Migration mevcut TÜM admin_users satırlarına idempotent
--   olarak "blog" ekler → hiç kimse blog erişimini KAYBETMEZ.
--
--   (Migration 013 'homepage_collection', 016 'messages', 018 'faqs',
--    064 'discount_collection' backfill'lerinin birebir paraleli.)
--
--   Yeni admin oluşturma akışı SIDEBAR_PERMISSIONS katalogundan default
--   tüm key'leri verdiği için (`SIDEBAR_PERMISSIONS.map(p => p.key)`,
--   app/(admin)/maki-admin/users/page.tsx) yeni kayıtlar otomatik bu
--   permission'a sahip olur.
--
-- KORUNAN BEHAVIOR:
--   • DİĞER permission'lara DOKUNULMAZ — yalnız eksik olan key append
--     edilir (mevcut dizi olduğu gibi korunur).
--   • `pages` key'i KALDIRILMAZ/DEĞİŞTİRİLMEZ — Sayfalar yönetimi aynen
--     çalışmaya devam eder.
--   • `admin_users` ŞEMASI DEĞİŞMEZ: yeni kolon/index/constraint YOK.
--   • `admin_users` DIŞINDA hiçbir tabloya dokunulmaz.
--   • Hiçbir satır SİLİNMEZ; yalnız UPDATE.
--   • Permission resolver (lib/auth/action-authz > loadPermissions /
--     filterMenuByPermissions) DEĞİŞMEZ.
--
-- IDEMPOTENT:
--   `jsonb @>` containment check sayesinde N kere koşulabilir; "blog"
--   zaten varsa satır WHERE'e hiç girmez → DUPLICATE eklenmez.
--
-- ROLLBACK (gerekirse, manuel):
--   UPDATE admin_users
--   SET sidebar_permissions = sidebar_permissions - 'blog'
--   WHERE sidebar_permissions @> '["blog"]'::jsonb;
-- ============================================================================

UPDATE admin_users
SET sidebar_permissions =
  CASE
    WHEN sidebar_permissions IS NULL THEN
      '["blog"]'::jsonb
    ELSE
      sidebar_permissions || '["blog"]'::jsonb
  END
WHERE
  sidebar_permissions IS NULL
  OR NOT (sidebar_permissions @> '["blog"]'::jsonb);
