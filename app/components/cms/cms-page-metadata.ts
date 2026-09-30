import "server-only";

import type { Metadata } from "next";

import { getPageBySlug } from "@/app/services/page.service";
import { getPageCoverPublicUrl } from "@/lib/storage.helpers";
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
import { resolvePageContent } from "@/lib/i18n/get-page-translation.server";

/* ===============================================================
   🛡️ PHASE 12D — /p/[slug] METADATA (TR / EN / DE ORTAK)
   ===============================================================
   `app/components/home/home-metadata.ts` (Phase 11) ile AYNI desen:
   üç locale de TEK helper üzerinden kendi `generateMetadata`'sını
   üretir.

   TR ÇIKTISI DEĞİŞMEDİ:
     • title/description/openGraph/twitter/robots mantığı TR
       sayfasından BİREBİR taşındı.
     • `alternates`: `multilingual_enabled` KAPALIYKEN (bugünkü
       production) yalnız `{ canonical }` döner — yani TR çıktısı
       Phase 12D öncesiyle AYNI. Açıkken hreflang seti eklenir.
       Bu koşul `app/(public)/en/kiralik-villa/[slug]/page.tsx`'teki
       MEVCUT desenin birebir aynısıdır; yeni bir SEO kuralı İCAT
       EDİLMEDİ.

   EN/DE: `seo_title` / `seo_description` `page_translations`'tan
   gelir (yoksa alan bazında TR'ye fallback). Canonical `/en/p/...`
   veya `/de/p/...` (`buildLocaleAlternates`, Phase 7B).

   `page.noindex` HER locale'de aynen uygulanır.
   =============================================================== */

export async function buildCmsPageMetadata(
  slug: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const page = await getPageBySlug(slug);
  if (!page) {
    /* 🛡️ TR değeri ESKİ hardcoded metinle BİREBİR; EN/DE için
       dictionary'den çözülür. `notFound()` / global 404 akışı
       DEĞİŞTİRİLMEDİ (TR sayfası bu metadata ile inline 404 bloğu
       render eder; EN/DE `notFound()` yoluna girer). */
    return {
      title: getDictionary(locale).cms.notFoundMetaTitle,
      robots: { index: false, follow: false },
    };
  }

  const resolved = await resolvePageContent(page, locale);

  /* 🛡️ Son-çare başlık fallback'i MEVCUT `cms.fallbackTitle`
     anahtarından (CmsPageBody ile AYNI key) — locale-aware.
     seoTitle / title dolu olduğunda davranış DEĞİŞMEZ. */
  const title =
    resolved.seoTitle || resolved.title || getDictionary(locale).cms.fallbackTitle;
  const description =
    resolved.seoDescription ||
    (typeof resolved.excerpt === "string" && resolved.excerpt.trim().length > 0
      ? resolved.excerpt
      : undefined);

  /* 🛡️ OG/Twitter görseli de `?v=<R2 ETag>` ile (sosyal ağ
     önizleme cache'i eski kapağı göstermesin); path aynı. */
  const coverPath = (page as { cover_image?: string | null }).cover_image;
  const cover = versionedAssetUrl(
    getPageCoverPublicUrl(coverPath),
    await getSiteAssetVersions([coverPath]),
    coverPath
  );
  const robots = page.noindex
    ? { index: false, follow: false }
    : { index: true, follow: true };

  /* TR path'i — hreflang seti bundan türetilir (slug ÇEVRİLMEZ). */
  const trPath = `/p/${slug}`;
  const { canonical, languages } = buildLocaleAlternates(trPath, locale);
  const settings = await getCachedSettings().catch(() => null);
  const alternates = isMultilingualEnabled(settings)
    ? { canonical, languages }
    : { canonical };

  return {
    title,
    description,
    alternates,
    robots,
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
