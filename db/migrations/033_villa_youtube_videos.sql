-- ============================================================================
-- Migration 033 — Villa YouTube Videos
-- ============================================================================
-- AMAÇ:
--   Her villaya 0..N adet YouTube video bağlamak. Future-proof array
--   yapısı; ilk aşamada admin tek video da girebilir.
--
-- TASARIM KARARLARI:
--   • JSONB array — JSON encoded list of objects:
--       [{"id": "dQw4w9WgXcQ", "url": "https://youtu.be/dQw4w9WgXcQ"}, ...]
--     • id  : normalize edilmiş 11 karakterlik YouTube video ID
--             ([A-Za-z0-9_-]{11}). Application layer'da validate edilir.
--     • url : kullanıcının girdiği orijinal URL (audit / debug için).
--   • NULL default — eski villalar etkilenmez; boş video → null.
--     ([] empty array yerine null seçildi çünkü "hiç video yok"
--     semantic'i daha net; existing queries `select *` ile bu
--     kolonu null olarak alır, application layer null-safe okur.)
--   • Index YOK — bu alanla query/sort/filter yapılmaz; saklama amaçlı.
--   • Check constraint YOK — JSON schema validation application
--     layer'ında (lib/youtube.helper.ts) yapılır. DB seviyesinde JSON
--     yapısı zorlamak future flexibility'yi azaltır.
--   • Trigger YOK.
--   • RLS YOK (villa table'ı şu an RLS-free; mevcut policy ile uyumlu).
--
-- BACKWARD-COMPATIBILITY:
--   • Eski villalar: kolon NULL değerle eklenir.
--   • Eski INSERT'ler bu kolonu vermez → null kalır.
--   • Eski SELECT * sorguları yeni kolonu da getirir; consumer'lar
--     null-safe okumalıdır (application: `villa.youtube_videos ?? []`).
--   • Type contract (services + frontend) opsiyonel alan olarak ekler;
--     mevcut caller'lar etkilenmez.
--
-- VALIDATION:
--   • Application layer (admin form + service):
--       1) URL parse → 11-char video ID
--       2) ID regex: ^[A-Za-z0-9_-]{11}$
--       3) Duplicate ID engelleme (aynı villa içinde)
--       4) Sadece YouTube domain'leri kabul (youtube.com / youtu.be)
--   • DB layer: ham JSONB; trust the application boundary.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   alter table public.villa drop column if exists youtube_videos;
-- ============================================================================

alter table public.villa
  add column if not exists youtube_videos jsonb;

-- Verbose comment for DBA / future developer.
comment on column public.villa.youtube_videos is
  'YouTube video listesi (JSONB array). Format: [{"id": "11charID", "url": "original"}]. '
  'Validation application layer''ında (lib/youtube.helper.ts > parseYouTubeId). '
  'NULL = hiç video yok. Eski kayıtlarda NULL; backward-compat şart. '
  'Index/trigger/RLS/constraint YOK — saklama amaçlı serbest JSONB. '
  'Migration 033.';