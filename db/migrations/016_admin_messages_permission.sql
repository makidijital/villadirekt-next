-- ===============================================================
-- 🛡️ Migration 016 — admin_users.sidebar_permissions backfill
-- ===============================================================
-- AMAÇ:
--   Migration 015 ile eklenen "Mesajlar" admin sayfası
--   permissionKey: "messages" ile filtrelenir. Mevcut admin
--   user'ların sidebar_permissions JSONB array'inde bu key
--   yoksa idempotent eklenir.
--
--   Yeni admin user oluşturma flow'u SIDEBAR_PERMISSIONS
--   catalog'undan default tüm key'leri verdiği için (admin-user.service.ts'te
--   `SIDEBAR_PERMISSIONS.map(p => p.key)`) yeni kayıtlar otomatik
--   bu permission'a sahip olacak.
--
-- IDEMPOTENT: jsonb @> containment check.
-- ===============================================================

UPDATE admin_users
SET sidebar_permissions =
  CASE
    WHEN sidebar_permissions IS NULL THEN '["messages"]'::jsonb
    ELSE sidebar_permissions || '["messages"]'::jsonb
  END
WHERE
  sidebar_permissions IS NULL
  OR NOT (sidebar_permissions @> '["messages"]'::jsonb);