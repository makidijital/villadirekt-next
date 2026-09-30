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

/* ===============================================================
   🛡️ /iletisim METADATA (TR / EN / DE ORTAK)
   ===============================================================
   `app/components/search/kiralik-villalar-metadata.ts` ve
   `app/components/cms/cms-page-metadata.ts` ile AYNI desen: üç locale
   de TEK helper üzerinden kendi `generateMetadata`'sını üretir. Yeni
   bir SEO mimarisi İCAT EDİLMEDİ.

   TR ÇIKTISI DEĞİŞMEDİ:
     • title  : "İletişim · {brand}" (dictionary TR değeri eski
                hardcoded template ile BİREBİR).
     • description / openGraph / twitter alanları BİREBİR.
     • `alternates`: `multilingual_enabled` KAPALIYKEN yalnız
       `{ canonical: "/iletisim" }` döner — yani TR çıktısı bu fazdan
       ÖNCEKİYLE AYNI. Açıkken hreflang seti (`languages`) eklenir.

   ⚠️ `robots` BURADA SET EDİLMEZ — root layout'un
   `settings.robots_index/robots_follow` politikası miras alınır;
   `/iletisim` robots.ts'te ZATEN allow.
   =============================================================== */

/** TR (prefix'siz) iletişim path'i — tüm locale varyantları bundan türer. */
export const CONTACT_TR_PATH = "/iletisim";

/** Locale'e göre iletişim path'i (`/iletisim` | `/en/...` | `/de/...`). */
export function contactPath(locale: Locale): string {
  return buildLocaleAlternates(CONTACT_TR_PATH, locale).canonical;
}

export async function buildContactMetadata(
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).contact.meta;

  const settings = await getCachedSettings().catch(() => null);
  const brand = settings?.site_name?.trim() || "Villa Kiralama";

  const title = formatDictionaryString(dict.title, { brand });
  const ogTitle = formatDictionaryString(dict.ogTitle, { brand });

  const { canonical, languages } = buildLocaleAlternates(
    CONTACT_TR_PATH,
    locale
  );
  const alternates = isMultilingualEnabled(settings)
    ? { canonical, languages }
    : { canonical };

  return {
    title,
    description: dict.description,
    alternates,
    openGraph: {
      type: "website",
      url: canonical,
      title: ogTitle,
      description: dict.ogDescription,
    },
    twitter: {
      card: "summary",
      title: ogTitle,
    },
  };
}
