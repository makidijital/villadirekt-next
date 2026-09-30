-- ===============================================================
-- 🛡️ Migration 064 — admin_users.sidebar_permissions backfill
--                     ('discount_collection')
-- ===============================================================
-- AMAÇ:
--   Migration 062 ile eklenen "İndirimli Koleksiyon" admin sayfası
--   sidebar'da permissionKey: "discount_collection" ile filtreleniyor.
--   Mevcut admin user'ların sidebar_permissions JSONB array'inde bu
--   key YOK → sidebar'da satır görünmez. (Migration 013'ün
--   'homepage_collection' backfill'inin birebir paraleli.)
--
--   Bu migration mevcut TÜM admin_users satırlarına idempotent olarak
--   'discount_collection' ekler:
--     - Array'de zaten varsa → DOKUNULMAZ (jsonb @> containment check)
--     - Yoksa → || operator ile append
--
--   Yeni admin user oluşturma akışı SIDEBAR_PERMISSIONS catalog'undan
--   default tüm key'leri verdiği için (admin-user.service.ts'te
--   `SIDEBAR_PERMISSIONS.map(p => p.key)` default) yeni kayıtlar
--   otomatik bu permission'a sahip olur.
--
-- KORUNAN BEHAVIOR:
--   - Diğer permission'lar dokunulmaz (sadece eksik olanı append).
--   - admin_users schema'sı değişmez.
--   - Permission resolver (filterMenuByPermissions) aynı.
--
-- IDEMPOTENT: jsonb containment check sayesinde N kere koşulabilir.
-- ===============================================================

UPDATE admin_users
SET sidebar_permissions =
  CASE
    WHEN sidebar_permissions IS NULL THEN
      '["discount_collection"]'::jsonb
    ELSE
      sidebar_permissions || '["discount_collection"]'::jsonb
  END
WHERE
  sidebar_permissions IS NULL
  OR NOT (sidebar_permissions @> '["discount_collection"]'::jsonb);