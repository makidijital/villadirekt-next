import { translationRepository } from "@/lib/db/translation.repository.server";
import { blogServerRepository } from "@/lib/db/blog.repository.server";
import type { BlogPostTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ MIGRATION 089 — Admin Blog (blog_posts) Çeviri Servisi
 *
 * `app/services/page-translation.service.ts` (Phase 12C) ile BİREBİR
 * AYNI desen ve aynı gerekçeler:
 *   - çok alanlı entity (title/excerpt/body/seo_*),
 *   - parent existence pre-check VAR (`blogAdminRepository.findById`),
 *   - TÜM iş kuralı doğrulaması BURADA (repository yalnız DB primitive'i).
 *
 * Çevrilen kolonlar migration 089 ile BİREBİR: title, body, excerpt,
 * seo_title, seo_description.
 * ⚠️ `slug` ÇEVRİLMEZ — `/blog/<slug>` URL contract'ı her locale'de AYNI.
 * `cover_image`, `og_image`, `category`, `author`, `published_at`,
 * `is_active`, `noindex` de ÇEVRİLMEZ (tabloda kolonları YOK).
 *
 * TR bu servisten YAZILAMAZ (locale whitelist "en" | "de"). Boş bırakılan
 * alanlar `null` yazılır → public tarafta TR'ye fallback.
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

/* Limitler `page-translation.service.ts` ile AYNI — blog gövdesi CMS
   sayfa gövdesiyle aynı Tiptap editöründen gelir. */
const MAX_TITLE_LEN = 200;
const MAX_EXCERPT_LEN = 300;
const MAX_BODY_LEN = 20000;
const MAX_SEO_TITLE_LEN = 120;
const MAX_SEO_DESCRIPTION_LEN = 300;

export const BLOG_TRANSLATION_MAX_LEN = {
  title: MAX_TITLE_LEN,
  excerpt: MAX_EXCERPT_LEN,
  body: MAX_BODY_LEN,
  seoTitle: MAX_SEO_TITLE_LEN,
  seoDescription: MAX_SEO_DESCRIPTION_LEN,
} as const;

export type BlogTranslationInput = {
  postId: string;
  locale: string;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type BlogTranslationResult =
  | { ok: true; row: BlogPostTranslationRow }
  | { ok: false; error: string };

export type BlogTranslationsListResult =
  | { ok: true; rows: BlogPostTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getBlogTranslations(
  postId: string
): Promise<BlogTranslationsListResult> {
  const id = (postId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz blog yazısı" };

  const { data, error } = await translationRepository.findAllForParent(
    "blog_post",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertBlogTranslation(
  input: BlogTranslationInput
): Promise<BlogTranslationResult> {
  const postId = (input.postId ?? "").toString().trim();
  if (!postId) return { ok: false, error: "Geçersiz blog yazısı" };

  if (!isWritableLocale(input.locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }
  const locale = input.locale;

  const title = normalize(input.title);
  if (title && title.length > MAX_TITLE_LEN) {
    return { ok: false, error: `Başlık ${MAX_TITLE_LEN} karakteri geçemez` };
  }

  const excerpt = normalize(input.excerpt);
  if (excerpt && excerpt.length > MAX_EXCERPT_LEN) {
    return {
      ok: false,
      error: `Kısa açıklama ${MAX_EXCERPT_LEN} karakteri geçemez`,
    };
  }

  const body = normalize(input.body);
  if (body && body.length > MAX_BODY_LEN) {
    return { ok: false, error: `İçerik ${MAX_BODY_LEN} karakteri geçemez` };
  }

  const seoTitle = normalize(input.seoTitle);
  if (seoTitle && seoTitle.length > MAX_SEO_TITLE_LEN) {
    return {
      ok: false,
      error: `SEO başlık ${MAX_SEO_TITLE_LEN} karakteri geçemez`,
    };
  }

  const seoDescription = normalize(input.seoDescription);
  if (seoDescription && seoDescription.length > MAX_SEO_DESCRIPTION_LEN) {
    return {
      ok: false,
      error: `SEO açıklama ${MAX_SEO_DESCRIPTION_LEN} karakteri geçemez`,
    };
  }

  /* Parent existence pre-check — `page-translation.service.ts` ile AYNI
     rol: FK hatasını generic mesaja çevirmek yerine erken, anlaşılır
     hata döner. Mevcut repository fonksiyonu REUSE edildi. */
  const { data: postRow, error: postError } =
    await blogServerRepository.findById(postId);
  if (postError) return { ok: false, error: "Blog yazısı doğrulanamadı" };
  if (!postRow) return { ok: false, error: "Blog yazısı bulunamadı" };

  const { data, error } = await translationRepository.upsertOne(
    "blog_post",
    postId,
    locale,
    {
      title,
      excerpt,
      body,
      seo_title: seoTitle,
      seo_description: seoDescription,
    }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
