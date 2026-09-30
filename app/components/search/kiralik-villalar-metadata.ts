import "server-only";

import type { Metadata } from "next";

import { getCachedSettings } from "@/lib/cache.helpers";
import {
  DEFAULT_LOCALE,
  isMultilingualEnabled,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { ARCHIVE_TR_PATH } from "@/app/components/search/KiralikVillalarPageBody";

/* ===============================================================
   🛡️ /kiralik-villalar METADATA (TR / EN / DE ORTAK)
   ===============================================================
   `app/components/cms/cms-page-metadata.ts` (Phase 12D) ve
   `app/components/home/home-metadata.ts` (Phase 11) ile AYNI desen:
   üç locale de TEK helper üzerinden kendi `generateMetadata`'sını
   üretir. Yeni bir SEO mimarisi İCAT EDİLMEDİ.

   TR ÇIKTISI DEĞİŞMEDİ:
     • title  : "Kiralık Villalar — {brand}" (dictionary TR değeri
                eski hardcoded template ile BİREBİR).
     • description / openGraph / twitter alanları BİREBİR.
     • `alternates`: `multilingual_enabled` KAPALIYKEN (bugünkü
       production) yalnız `{ canonical: "/kiralik-villalar" }` döner
       — yani TR çıktısı bu fazdan ÖNCEKİYLE AYNI. Açıkken hreflang
       seti (`languages`) eklenir; bu koşul cms-page-metadata'daki
       MEVCUT desenin birebir aynısıdır.

   ⚠️ `robots` BURADA SET EDİLMEZ — root layout'un
   `settings.robots_index/robots_follow` politikası miras alınır;
   `/kiralik-villalar` robots.ts'te ZATEN allow (indexlenebilir).
   EN/DE placeholder'larındaki koşulsuz `noindex` bu fazda KALDIRILDI
   (Phase 13'te `/en|de/arama` için uygulanan AYNI karar) — sayfalar
   artık gerçek içerik; `multilingual_enabled` kapalıyken zaten 404.
   =============================================================== */

export async function buildVillasArchiveMetadata(
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).villasArchive;

  const settings = await getCachedSettings().catch(() => null);
  const brand = settings?.site_name?.trim() || "Villa Kiralama";
  const title = formatDictionaryString(dict.metaTitle, { brand });
  const description = dict.metaDescription;

  const { canonical, languages } = buildLocaleAlternates(
    ARCHIVE_TR_PATH,
    locale
  );
  const alternates = isMultilingualEnabled(settings)
    ? { canonical, languages }
    : { canonical };

  /* 🛡️ openGraph.url — eski TR davranışı: SITE_URL varsa absolute,
     yoksa relative path. Locale canonical'ı kullanılır. */
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/+$/, "");
  const pageUrl = siteUrl ? `${siteUrl}${canonical}` : canonical;

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      type: "website",
      url: pageUrl,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
