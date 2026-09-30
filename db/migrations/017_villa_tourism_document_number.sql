-- ============================================================================
-- Migration 017 — Villa Tourism Document Number
-- ============================================================================
-- AMAÇ:
--   T.C. Kültür ve Turizm Bakanlığı işletme belge numarasını her villa için
--   opsiyonel olarak saklamak. Örnek format: "07-3388".
--
-- TASARIM KARARLARI:
--   • text (varchar yerine) — uzunluk kısıtlaması ileride gerekirse
--     check constraint ile eklenir; şimdi serbest.
--   • NULLABLE — eski villalar etkilenmez (BACKWARD-COMPAT şart).
--   • Default YOK — boş kayıt sessizce null kalır.
--   • Index YOK — bu alanla query / sort yapılmıyor; saklama amaçlı.
--   • check constraint YOK — regex/format validation şu an istenmiyor.
--   • Yeniden çalıştırılabilir (idempotent) — `if not exists` ile guard.
--
-- BACKWARD-COMPATIBILITY:
--   • Eski villalar: kolon null değerle eklenir; read path'leri etkilenmez.
--   • Eski INSERT'ler bu kolonu vermez → null kalır.
--   • RLS / trigger / unique constraint yok → side effect yok.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   alter table public.villa drop column if exists tourism_document_number;
-- ============================================================================

alter table public.villa
  add column if not exists tourism_document_number text;

-- Verbose comment for DBA / future developer.
comment on column public.villa.tourism_document_number is
  'T.C. Kültür ve Turizm Bakanlığı işletme belge numarası (örn. "07-3388"). '
  'Opsiyonel; eski kayıtlarda NULL. Bu kolonda RLS, index, constraint, '
  'default, trigger YOK — saklama amaçlı serbest text. Validation '
  'application layer''ında yapılmaz (henüz). Migration 017 (Faz 22).';