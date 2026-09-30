-- ===============================================================
-- 🛡️ Migration 014 — pages premium layout fields
-- ===============================================================
-- AMAÇ:
--   /p/[slug] CMS sayfalarına editorial layout için yapı ekle:
--     - excerpt:     kısa açıklama (hero altı meta)
--     - cover_image: bucket-relative path (site-assets/page-covers/)
--     - sections:    typed section array (richtext/image/quote/...);
--                    JSONB; default boş array.
--
--   Mevcut `body` TEXT alanı KORUNUR (legacy fallback). Sections boşsa
--   public render body'yi tek prose block olarak gösterir.
--
-- ARCHITECTURE (sections JSONB shape):
--   [
--     { "type": "richtext", "content": "..." },
--     { "type": "image",    "path": "page-covers/...webp", "alt": "..." },
--     { "type": "quote",    "text": "...", "author": "..." }
--   ]
--   Yeni section type'ları renderer map'e eklenir (gallery, faq,
--   villa-slider, cta vs. — DB schema değişmeden expandable).
--
-- IDEMPOTENT: kolonlar IF NOT EXISTS; N kere koşulabilir.
-- ===============================================================

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS excerpt     TEXT,
  ADD COLUMN IF NOT EXISTS cover_image TEXT,
  ADD COLUMN IF NOT EXISTS sections    JSONB NOT NULL DEFAULT '[]'::jsonb;