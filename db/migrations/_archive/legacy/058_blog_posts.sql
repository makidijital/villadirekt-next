-- ============================================================================
-- Migration 058 — BLOG POSTS (SEO blog modülü, FAZ 1)
-- ============================================================================
-- AMAÇ:
--   SEO odaklı blog modülü için `blog_posts` tablosu. CMS `pages` sistemini
--   referans alır (slug + is_active public-visibility deseni); ama
--   AYRI ve TAMAMEN ADDITIVE bir tablodur. pages / villa / reservations /
--   pricing / availability / R2 / admin-user sistemlerine DOKUNMAZ.
--
-- TASARIM:
--   • body: Tiptap HTML (kayıtta sanitizeHtml — application layer, FAZ 2 API).
--   • cover_image / og_image: bucket-relative path (site-assets/blog/…),
--     mevcut R2 resolveAssetUrl ile çözülür (R2 altyapısına dokunulmaz).
--   • is_active: yayın durumu (pages deseni; public yalnız is_active=true).
--   • published_at: yayın tarihi — sıralama + sitemap lastmod (FAZ 3).
--   • category: OPSİYONEL hafif gruplama (ayrı kategori TABLOSU yok; MVP).
--   • SEO: seo_title / seo_description / og_image / noindex.
--
-- ROLLBACK:
--   drop table if exists public.blog_posts;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  slug            text NOT NULL,
  excerpt         text,
  body            text,                       -- Tiptap HTML (sanitize: app layer)
  cover_image     text,                       -- bucket-relative (site-assets/blog/…)
  is_active       boolean NOT NULL DEFAULT false,  -- yayın durumu
  published_at    timestamptz,                -- null = taslak
  seo_title       text,
  seo_description text,
  og_image        text,
  noindex         boolean NOT NULL DEFAULT false,
  category        text,                       -- opsiyonel hafif gruplama
  author          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz,

  CONSTRAINT blog_posts_slug_unique UNIQUE (slug)
);

-- Public liste (is_active + published_at DESC) + opsiyonel kategori erişimi.
CREATE INDEX IF NOT EXISTS blog_posts_active_published_idx
  ON public.blog_posts (is_active, published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_category_idx
  ON public.blog_posts (category);

COMMENT ON TABLE public.blog_posts IS
  'SEO blog modulu. CMS pages deseni (slug + is_active). body = Tiptap '
  'HTML (app layer sanitizeHtml). cover/og bucket-relative (site-assets/blog). '
  'Additive; pages/villa/reservation/pricing/R2 sistemlerine dokunmaz.';


COMMIT;

-- ============================================================================
-- Doğrulama (manuel):
--   insert into public.blog_posts (title, slug, is_active, published_at)
--     values ('Test', 'test-yazi', true, now());
--   select id, slug, is_active from public.blog_posts;
-- ============================================================================
