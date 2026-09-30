-- ============================================================================
-- Migration 025 — offer_requests alias columns cleanup (Faz 46)
-- ============================================================================
-- AMAÇ:
--   FAZ 45'te tespit edilen duplicate kolon yapısı kaldırılıyor.
--   Kullanıcı veritabanı yönetim paneli üzerinden manuel olarak migration
--   022 canonical isimlerinin paraleline alias kolonları eklemişti.
--   Service ikisine de yazıyordu (temporary mirror).
--   Şimdi tek source of truth:
--     - adults / children
--     - budget_min / budget_max
--     - region_tokens / villa_type_tokens / feature_tokens
--
-- KALDIRILAN KOLONLAR:
--   • guest_count       (canonical: adults + children)
--   • min_budget        (canonical: budget_min)
--   • max_budget        (canonical: budget_max)
--   • regions           (canonical: region_tokens)
--   • villa_types       (canonical: villa_type_tokens)
--   • features          (canonical: feature_tokens)
--
-- TASARIM:
--   • `DROP COLUMN IF EXISTS` → idempotent; yoksa no-op
--   • Tek statement içinde 6 kolon → atomic
--   • Index / policy / trigger bu kolonlara bağlı DEĞİL
--     (migration 022 yalnız status + created_at index'lerini tanımladı)
--
-- BACKWARD-COMPATIBILITY:
--   • types/database.ts FAZ 46 sync (alias fields removed)
--   • offer-request.service.ts FAZ 46 cleanup (mirror write kaldırıldı)
--   • Mevcut row'ların canonical kolonları aynen kalır
--   • Alias kolonlardaki veriler (varsa) kaybolur — FAZ 45 mirror
--     sayesinde canonical'da zaten kopyası var
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   ALTER TABLE public.offer_requests
--     ADD COLUMN IF NOT EXISTS guest_count       int,
--     ADD COLUMN IF NOT EXISTS min_budget        int,
--     ADD COLUMN IF NOT EXISTS max_budget        int,
--     ADD COLUMN IF NOT EXISTS regions           text[] default '{}',
--     ADD COLUMN IF NOT EXISTS villa_types       text[] default '{}',
--     ADD COLUMN IF NOT EXISTS features          text[] default '{}';
-- ============================================================================

ALTER TABLE public.offer_requests
  DROP COLUMN IF EXISTS guest_count,
  DROP COLUMN IF EXISTS min_budget,
  DROP COLUMN IF EXISTS max_budget,
  DROP COLUMN IF EXISTS regions,
  DROP COLUMN IF EXISTS villa_types,
  DROP COLUMN IF EXISTS features;