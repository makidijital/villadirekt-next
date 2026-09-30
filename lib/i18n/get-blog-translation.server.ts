import "server-only";

import { DEFAULT_LOCALE, toLocale, type Locale } from "@/lib/i18n/config";
import {
  getTranslation,
  getTranslationsForParents,
  resolveTranslatedField,
} from "@/lib/i18n/get-translation.server";

/* ===============================================================
   🛡️ BLOG (blog_posts) ÇEVİRİ OKUMA KATMANI
   ===============================================================
   `lib/i18n/get-page-translation.server.ts` (Phase 12D) ile BİREBİR
   AYNI desen: MEVCUT generic okuma katmanının (`getTranslation` /
   `getTranslationsForParents` + `resolveTranslatedField`) üzerine
   ince bir "çöz ve fallback'le" sarmalayıcısı. Yeni repository, yeni
   tablo, yeni cache YOK.

   TR KISAYOLU: `locale === "tr"` (veya geçersiz bir değer → `toLocale`
   ile TR'ye düşer) ise `blog_post_translations` tablosuna HİÇ SORGU
   ATILMAZ; canonical değerler aynen döner. Mevcut TR `/blog` ve
   `/blog/[slug]` davranışına SIFIR ek DB maliyeti.

   N+1 YOK: liste sayfası `resolveBlogListContent` ile TEK batch sorgu
   (`getTranslationsForParents` → `.in()`) kullanır; detay sayfası
   request başına TEK satır okur.

   FALLBACK: Alan bazında. Çeviri satırı olsa bile boş/NULL bir kolon
   canonical TR değerine düşer. Çeviri satırı hiç yoksa TÜM alanlar
   TR'ye düşer — ancak URL (`/en/blog/...`) korunur.

   KAPSAM: migration 089 kolonlarıyla BİREBİR — title · excerpt ·
   body · seo_title · seo_description. `slug`, `cover_image`,
   `og_image`, `category`, `author`, `published_at`, `is_active`,
   `noindex` ÇEVRİLMEZ (tabloda kolonları YOK).
   =============================================================== */

export type BlogCanonicalContent = {
  id?: string | null;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export type ResolvedBlogContent = {
  title: string | null;
  excerpt: string | null;
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

function canonicalContent(post: BlogCanonicalContent): ResolvedBlogContent {
  return {
    title: post.title ?? null,
    excerpt: post.excerpt ?? null,
    body: post.body ?? null,
    seoTitle: post.seo_title ?? null,
    seoDescription: post.seo_description ?? null,
  };
}

const EMPTY: ResolvedBlogContent = {
  title: null,
  excerpt: null,
  body: null,
  seoTitle: null,
  seoDescription: null,
};

type BlogTranslationFields = {
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

function merge(
  row: BlogTranslationFields | null | undefined,
  canonical: ResolvedBlogContent
): ResolvedBlogContent {
  if (!row) return canonical;
  return {
    title: resolveTranslatedField(row.title, canonical.title),
    excerpt: resolveTranslatedField(row.excerpt, canonical.excerpt),
    body: resolveTranslatedField(row.body, canonical.body),
    seoTitle: resolveTranslatedField(row.seo_title, canonical.seoTitle),
    seoDescription: resolveTranslatedField(
      row.seo_description,
      canonical.seoDescription
    ),
  };
}

/** TEK blog yazısı (detay sayfası) — request başına en fazla 1 sorgu. */
export async function resolveBlogContent(
  post: BlogCanonicalContent | null | undefined,
  locale: Locale
): Promise<ResolvedBlogContent> {
  if (!post) return EMPTY;

  const resolvedLocale = toLocale(locale);
  const canonical = canonicalContent(post);
  if (resolvedLocale === DEFAULT_LOCALE) return canonical;

  const postId = (post.id ?? "").toString().trim();
  if (!postId) return canonical;

  const row = await getTranslation("blog_post", postId, resolvedLocale);
  return merge(row, canonical);
}

/**
 * Blog LİSTESİ — TEK batch sorgu (`.in()`), satır başına sorgu YOK.
 * TR'de hiç sorgu atılmaz. Dönen Map, girdi sırasındaki `id` anahtarına
 * göre çözülmüş içeriği taşır.
 */
export async function resolveBlogListContent<T extends BlogCanonicalContent>(
  posts: readonly T[],
  locale: Locale
): Promise<Map<string, ResolvedBlogContent>> {
  const result = new Map<string, ResolvedBlogContent>();
  for (const post of posts) {
    const id = (post.id ?? "").toString().trim();
    if (id) result.set(id, canonicalContent(post));
  }

  const resolvedLocale = toLocale(locale);
  if (resolvedLocale === DEFAULT_LOCALE) return result;

  const ids = Array.from(result.keys());
  if (ids.length === 0) return result;

  const translations = await getTranslationsForParents(
    "blog_post",
    ids,
    resolvedLocale
  );

  for (const id of ids) {
    const canonical = result.get(id);
    if (!canonical) continue;
    result.set(id, merge(translations.get(id), canonical));
  }

  return result;
}
