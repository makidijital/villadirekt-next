-- ============================================================================
-- 🛡️ 004 — CMS PAGES MENU NESTING SUPPORT
-- ============================================================================
-- Bu migration `pages` tablosuna nullable bir `menu_parent_id` kolonu ekler.
-- Amaç: admin Menü Yönetimi ekranında CMS sayfalarını manuel menu öğeleri
-- ile aynı tree içinde sıralamak ve nest edebilmek.
--
-- BAĞIMSIZ KAYNAK / SOURCE-OF-TRUTH:
--   Sayfa içeriği (title, slug, body, is_active, ...) AYNEN `pages`
--   tablosunda kalır. Bu kolon yalnız PRESENTATION metadata'sıdır
--   (sıralama + parent reference) — content yönetimini etkilemez.
--
-- NESNESEL DAVRANIŞ:
--   menu_parent_id NULL    → CMS sayfası root seviyesinde görünür
--                            (mevcut davranış; backward-compatible)
--   menu_parent_id UUID    → Cross-table reference. Parent şu olabilir:
--                              (a) menu.id   (manuel menu item)
--                              (b) pages.id  (başka bir CMS sayfası)
--                            Cross-table FK YOK (application-level
--                            integrity). buildTree fonksiyonları
--                            orphan ref'lerini root'a düşürür.
--
-- FRONTEND ETKİSİ:
--   menu.service.ts > getMenu() bu kolonu okuyup mevcut buildTree
--   fonksiyonuna parent_id olarak besler. Default NULL olduğu için
--   migration sonrası hiçbir mevcut sayfanın menu konumu değişmez.
--   /p/[slug] routing, SEO metadata, page creation flow DOKUNULMAZ.
--
-- ROLLBACK:
--   ALTER TABLE pages DROP COLUMN menu_parent_id;
-- ============================================================================

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS menu_parent_id UUID NULL;

COMMENT ON COLUMN pages.menu_parent_id IS
  'Admin Menü Yönetimi: nesting için parent reference (menu.id veya pages.id). FK yok; orphan handling application tarafında. NULL = root.';