import "server-only";

import type { Metadata } from "next";

import { getBlogPostBySlug } from "@/app/services/blog.service";
import { stripHtml } from "@/lib/html-sanitize";
import { resolveAssetUrl } from "@/lib/storage.helpers";
import { versionedAssetUrl } from "@/lib/storage/site-asset-version";
import { getSiteAssetVersions } from "@/lib/storage/site-asset-version.server";
import { getCachedSettings } from "@/lib/cache.helpers";
import {
  DEFAULT_LOCALE,
  isMultilingualEnabled,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { resolveBlogContent } from "@/lib/i18n/get-blog-translation.server";

/* ===============================================================
   🛡️ BLOG METADATA (TR / EN / DE ORTAK)
   ===============================================================
   `app/components/cms/cms-page-metadata.ts` (Phase 12D) ile AYNI
   desen: üç locale de TEK helper üzerinden kendi `generateMetadata`
   fonksiyonunu üretir.

   TR ÇIKTISI DEĞİŞMEDİ:
     • title/description/openGraph/twitter/robots mantığı TR
       sayfasından BİREBİR taşındı.
     • `alternates`: `multilingual_enabled` KAPALIYKEN yalnız
       `{ canonical }` döner — TR çıktısı eskisiyle AYNI. Açıkken
       hreflang seti eklenir (`buildLocaleAlternates`, Phase 7B).

   EN/DE: seo_title / seo_description / title / excerpt / body
   `blog_post_translations`'tan gelir (alan bazında TR'ye fallback).
   `post.noindex` HER locale'de aynen uygulanır. `slug` çevrilmez.
   =============================================================== */

export function excerptFrom(text: string, max = 160): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

export async function buildBlogIndexMetadata(
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).blog;
  const settings = await getCachedSettings().catch(() => null);
  const multilingualEnabled = isMultilingualEnabled(settings);

  const { canonical, languages } = buildLocaleAlternates("/blog", locale);

  return {
    title: dict.metaTitle,
    description: dict.metaDescription,
    alternates: multilingualEnabled ? { canonical, languages } : { canonical },
    openGraph: {
      type: "website",
      title: dict.metaTitle,
      description: dict.ogDescription,
      url: canonical,
    },
  };
}

export async function buildBlogDetailMetadata(
  params: Promise<{ slug: string }>,
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).blog;
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) {
    return {
      title: dict.detailNotFoundTitle,
      robots: { index: false, follow: false },
    };
  }

  const resolved = await resolveBlogContent(post, locale);

  const title = resolved.seoTitle?.trim() || resolved.title || post.title;
  const description =
    resolved.seoDescription?.trim() ||
    (resolved.excerpt?.trim() ? resolved.excerpt.trim() : "") ||
    (resolved.body ? excerptFrom(stripHtml(resolved.body), 160) : "");
  /* 🛡️ OG/Twitter görseli `?v=<R2 ETag>` ile (path aynı). */
  const ogPath = post.og_image || post.cover_image;
  const cover =
    versionedAssetUrl(
      resolveAssetUrl(ogPath),
      await getSiteAssetVersions([ogPath]),
      ogPath
    ) || undefined;

  const settings = await getCachedSettings().catch(() => null);
  const multilingualEnabled = isMultilingualEnabled(settings);
  const { canonical, languages } = buildLocaleAlternates(
    `/blog/${post.slug}`,
    locale
  );

  return {
    title,
    description,
    alternates: multilingualEnabled ? { canonical, languages } : { canonical },
    robots: post.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}
