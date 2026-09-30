-- ============================================================================
-- Migration 050 — villa_locations Filter Curation (show_in_filter + group)
-- ============================================================================
-- AMAÇ:
--   Arama sidebar'ında HANGİ bölgelerin görüneceğine ve hangi başlık
--   (grup) altında listeleneceğine admin karar verebilsin. Alt bölgeler
--   SEO için DB'de kalır; yalnız filtre GÖSTERİMİ kürasyona tabi.
--
-- YENİ KOLONLAR (additive — parent_id YOK, veri modeli değişmez):
--   • show_in_filter   boolean NOT NULL DEFAULT false
--       → bu lokasyon arama filtresinde checkbox olarak görünsün mü?
--   • filter_group_name text (nullable)
--       → filtrede hangi başlık (grup) altında listelensin?
--         (örn. "Kalkan / İslamlar" → grup "Kalkan")
--
-- KORUNAN (DOKUNULMAZ):
--   • id / name / slug / cover_image / created_at — aynen.
--   • villa.location_id FK, arama (.in("location_id", ...)),
--     URL (/arama?bolgeler=<slug>), sitemap, breadcrumb — etkilenmez.
--   • RLS: public read mevcut policy yeni kolonları otomatik kapsar.
--
-- BACKFILL (migration içinde — "Migration dışında veri taşıma yapma"
-- kuralına uygun; tek seferlik, idempotent guard'lı):
--   • name içinde "/" YOKSA (üst bölge: Kaş, Kalkan, Fethiye) →
--       show_in_filter = true,  filter_group_name = name
--   • name içinde "/" VARSA (alt bölge: "Kalkan / İslamlar") →
--       show_in_filter = false, filter_group_name = "/" öncesi kısım
--   Sonuç: deploy sonrası filtre TEMİZ (yalnız üst bölgeler görünür);
--   admin alt bölgeleri dilerse tek tek açar. Mevcut "hepsi görünür"
--   karmaşası giderilir, kırılma olmaz.
-- ============================================================================

BEGIN;

ALTER TABLE public.villa_locations
  ADD COLUMN IF NOT EXISTS show_in_filter boolean NOT NULL DEFAULT false;

ALTER TABLE public.villa_locations
  ADD COLUMN IF NOT EXISTS filter_group_name text;

-- Backfill — yalnız henüz kürasyon yapılmamış satırlar (idempotent).
UPDATE public.villa_locations
SET
  filter_group_name = CASE
    WHEN position('/' in name) > 0 THEN btrim(split_part(name, '/', 1))
    ELSE btrim(name)
  END,
  show_in_filter = CASE
    WHEN position('/' in name) > 0 THEN false
    ELSE true
  END
WHERE filter_group_name IS NULL;

-- Filtre sorguları için hafif index (gösterim curation lookup).
CREATE INDEX IF NOT EXISTS villa_locations_filter_idx
  ON public.villa_locations (show_in_filter, filter_group_name);

COMMIT;


-- ----------------------------------------------------------------------------
-- DOĞRULAMA (uygulamadan sonra)
-- ----------------------------------------------------------------------------
--   SELECT name, slug, show_in_filter, filter_group_name
--   FROM public.villa_locations
--   ORDER BY filter_group_name, name;
--   → Üst bölgeler show_in_filter=true; alt bölgeler false ama
--     doğru gruba bağlı.


-- ----------------------------------------------------------------------------
-- ROLLBACK (gerekirse)
-- ----------------------------------------------------------------------------
--   BEGIN;
--     DROP INDEX IF EXISTS public.villa_locations_filter_idx;
--     ALTER TABLE public.villa_locations DROP COLUMN IF EXISTS filter_group_name;
--     ALTER TABLE public.villa_locations DROP COLUMN IF EXISTS show_in_filter;
--   COMMIT;
-- ============================================================================
