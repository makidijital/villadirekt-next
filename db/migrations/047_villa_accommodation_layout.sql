-- ============================================================================
-- Migration 047 — Villa Accommodation Layout (Bedrooms + Bathrooms)
-- ============================================================================
-- AMAÇ:
--   Villa bazında Airbnb tarzı detaylı oda düzeni. Mevcut `bedrooms` /
--   `bathrooms` toplam sayı alanları KORUNUR; bu kolonlar ek detaydır.
--
-- TASARIM KARARLARI (migration 033 youtube_videos paterniyle birebir):
--   • 2 JSONB array kolon — `bedroom_layout` + `bathroom_layout`.
--   • NULL default — eski villalar etkilenmez; "düzen yok" semantic'i
--     [] yerine NULL ile net (application layer null-safe okur).
--   • Index YOK — bu alanlarla query/sort/filter yapılmaz; saklama amaçlı.
--   • Check constraint YOK — JSON şema validation application layer'da
--     (lib/villa-layout.helper.ts > normalizeBedroomLayout / normalizeBathroomLayout).
--   • Trigger YOK. RLS YOK (villa tablosu mevcut policy ile uyumlu).
--
-- VERİ ŞEKLİ:
--   bedroom_layout:
--     [
--       { "name": "Ana Yatak Odası", "beds": [{ "type": "double", "count": 1 }] },
--       { "name": "1. Yatak Odası",  "beds": [{ "type": "single", "count": 2 }] }
--     ]
--     bed.type ∈ { double, single, queen, king, bunk, sofa }
--   bathroom_layout:
--     [
--       { "name": "1. Banyo", "type": "full" },
--       { "name": "2. Banyo", "type": "shower_wc" }
--     ]
--     type ∈ { full, shower_wc, wc }
--
-- BACKWARD-COMPATIBILITY:
--   • Eski villalar: kolonlar NULL eklenir.
--   • Eski INSERT/UPDATE'ler bu kolonları vermez → NULL kalır.
--   • Eski SELECT * sorguları yeni kolonları null olarak alır; consumer
--     null-safe okur (application: `normalizeBedroomLayout(row.bedroom_layout)`).
--   • Public villa detay sayfası: veri yoksa "Konaklama Düzeni" section
--     HİÇ render edilmez.
--
-- ROLLBACK:
--   alter table public.villa drop column if exists bedroom_layout;
--   alter table public.villa drop column if exists bathroom_layout;
-- ============================================================================

alter table public.villa
  add column if not exists bedroom_layout jsonb,
  add column if not exists bathroom_layout jsonb;

comment on column public.villa.bedroom_layout is
  'Airbnb tarzı oda düzeni (JSONB array). [{name, beds:[{type,count}]}]. '
  'Validation application layer (lib/villa-layout.helper.ts). NULL = düzen girilmemiş.';

comment on column public.villa.bathroom_layout is
  'Banyo düzeni (JSONB array). [{name, type}]. type ∈ full|shower_wc|wc. '
  'Validation application layer (lib/villa-layout.helper.ts). NULL = düzen girilmemiş.';