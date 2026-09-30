-- ============================================================================
-- Migration 019 — Villa Private / Temporary Access Token (Faz 31)
-- ============================================================================
-- AMAÇ:
--   Off-market (is_active=false) ve aktif villalar dahil, secret token
--   bilen kişilerin `/p/[token]` route'u üzerinden villayı önizleyebilmesi.
--   Public listelerde (homepage, /arama, kategori, sitemap, search) bu alan
--   ASLA filter veya order'da kullanılmaz — yalnız doğrudan token-lookup.
--
-- TASARIM KARARLARI:
--   • text (varchar yerine) — uzunluk kuralı application layer'da
--     (crypto.randomUUID hex 20 char); ileride uzunluk değişebilir.
--   • NULLABLE — eski villalar etkilenmez (BACKWARD-COMPAT şart);
--     "henüz token üretilmedi" durumu = NULL.
--   • Default YOK — token sadece admin "Geçici URL" action'ı ile yazılır.
--   • Partial UNIQUE INDEX (WHERE token IS NOT NULL):
--       - NULL kayıtların çoğul olmasına izin verir (eski + token üretilmemiş
--         villalar). Postgres'te NOT NULL olmayan UNIQUE birden çok NULL
--         kabul eder ama partial index daha açık niyet bildirir ve
--         tüm satırları index'lemekten kaçınır (storage tasarrufu).
--       - Collision durumunda application layer 1 kez retry yapar.
--   • check constraint YOK — token format zorunluluğu uygulama tarafında.
--   • Yeniden çalıştırılabilir (idempotent) — `if not exists` ile guard.
--
-- SECURITY:
--   • Token entropy: 20 hex char ≈ 80 bit. Brute-force pratik olarak imkansız.
--   • RLS / policy değişimi YOK — public anon role villa table'a zaten SELECT
--     yapıyor; token sadece bilen kişi tarafından query'lendiğinden gizli
--     kalır. Admin update için anon row-level update policy mevcut sisteme
--     dayanır (mevcut admin login akışıyla aynı).
--
-- BACKWARD-COMPATIBILITY:
--   • Eski villalar: kolon NULL ile gelir; getVillaBySlug / getVillas
--     query path'leri etkilenmez (yeni kolon SELECT'e otomatik dahil olmaz).
--   • Eski INSERT'ler bu kolonu vermez → NULL kalır.
--   • getVillaByPrivateToken bu kolonu kullanır; başka hiçbir public/admin
--     listing fonksiyonu filter etmez.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   drop index if exists public.villa_private_access_token_idx;
--   alter table public.villa drop column if exists private_access_token;
-- ============================================================================

alter table public.villa
  add column if not exists private_access_token text;

-- Partial unique index — yalnız token sahibi villalar için collision koruması.
create unique index if not exists villa_private_access_token_idx
  on public.villa (private_access_token)
  where private_access_token is not null;

comment on column public.villa.private_access_token is
  'Off-market / VIP paylaşım için secret token (Faz 31). NULL = token henüz '
  'üretilmedi. /p/[token] route'u bu kolonu kullanır; getVillaByPrivateToken '
  'helper''ı is_active filtresini bypass eder ancak deleted_at IS NULL '
  'kontrolünü korur. Format: crypto.randomUUID() hex 20 char (application '
  'layer'da). Public list/search/sitemap fonksiyonlarında ASLA filter/order '
  'olarak kullanılmaz. Migration 019.';