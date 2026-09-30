-- ===============================================================
-- 🛡️ Migration 013 — admin_users.sidebar_permissions backfill
-- ===============================================================
-- AMAÇ:
--   Migration 012 ile eklenen "Anasayfa Koleksiyon" admin sayfası
--   sidebar'da permissionKey: "homepage_collection" ile filtreleniyor.
--   Mevcut admin user'ların sidebar_permissions JSONB array'inde
--   bu key YOK → sidebar'da satır görünmez.
--
--   Bu migration mevcut TÜM admin_users satırlarına idempotent olarak
--   'homepage_collection' ekler:
--     - Array'de zaten varsa → DOKUNULMAZ (jsonb @> containment check)
--     - Yoksa → || operator ile append
--
--   Yeni admin user oluşturma akışı SIDEBAR_PERMISSIONS catalog'undan
--   default tüm key'leri verdiği için (admin-user.service.ts'te
--   `SIDEBAR_PERMISSIONS.map(p => p.key)` default) zaten yeni
--   kayıtlar otomatik olarak bu permission'a sahip olacak.
--
-- KORUNAN BEHAVIOR:
--   - Diğer permission'lar dokunulmaz (sadece eksik olanı append).
--   - admin_users tablosu schema'sı değişmez.
--   - Permission resolver (filterMenuByPermissions) aynı.
--
-- IDEMPOTENT: jsonb containment check sayesinde N kere koşulabilir.
-- ===============================================================

UPDATE admin_users
SET sidebar_permissions =
  CASE
    WHEN sidebar_permissions IS NULL THEN
      '["homepage_collection"]'::jsonb
    ELSE
      sidebar_permissions || '["homepage_collection"]'::jsonb
  END
WHERE
  sidebar_permissions IS NULL
  OR NOT (sidebar_permissions @> '["homepage_collection"]'::jsonb);