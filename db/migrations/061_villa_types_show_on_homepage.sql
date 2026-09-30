-- ============================================================================
-- Migration 061 — villa_types.show_on_homepage (homepage kategori kürasyonu)
-- ============================================================================
-- AMAÇ:
--   Homepage "Kategoriler" slider'ında HANGİ kategorilerin görüneceğini
--   admin seçsin. villa_locations.show_in_filter (mig 050) pattern'inin
--   kategori karşılığı.
--
-- YENİ KOLON (additive):
--   • show_on_homepage boolean NOT NULL DEFAULT true
--       → DEFAULT true: deploy sonrası MEVCUT davranış korunur (tüm
--         kategoriler görünmeye devam eder); admin istemediklerini kapatır.
--
-- KORUNAN (DOKUNULMAZ):
--   • id / name / slug / cover_image / created_at — aynen.
--   • villa_type_relations (M:N), /arama villa-turleri filtresi, sitemap,
--     reservation flow — etkilenmez.
--   • RLS (mig 037 public read) yeni kolonu otomatik kapsar.
--
-- İDEMPOTENT: ADD COLUMN IF NOT EXISTS. Tekrar çalıştırmaya güvenli.
--
-- ⚠️ DEPLOY SIRASI: Bu migration kod deploy'undan ÖNCE/ile uygulanmalı.
--   Kod tarafı `getCachedVillaTypes` kolonu okuyacak; kolon yoksa
--   (select("*") kullanıldığı için) HATA vermez, alan undefined gelir ve
--   CategoryCollection filtresi `!== false` ile undefined'ı GÖRÜNÜR sayar
--   → migration öncesi de mevcut "hepsi görünür" davranışı bozulmaz.
--
-- ROLLBACK:
--   alter table public.villa_types drop column if exists show_on_homepage;
-- ============================================================================

alter table public.villa_types
  add column if not exists show_on_homepage boolean not null default true;

comment on column public.villa_types.show_on_homepage is
  'Homepage Kategoriler slider gösterimi (mig 050 show_in_filter pattern). '
  'DEFAULT true → mevcut davranış korunur; admin /maki-admin/types''tan kapatır.';