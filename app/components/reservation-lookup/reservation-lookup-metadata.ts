import "server-only";

import type { Metadata } from "next";

import { getCachedSettings } from "@/lib/cache.helpers";
import {
  DEFAULT_LOCALE,
  isMultilingualEnabled,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";

/* ===============================================================
   🛡️ /rezervasyon-kontrol METADATA (TR / EN / DE ORTAK)
   ===============================================================
   `contact-metadata.ts` ile AYNI desen. TR çıktısı DEĞİŞMEDİ:
   title/description/openGraph/twitter alanları dictionary TR
   değerleriyle BİREBİR; `multilingual_enabled` kapalıyken
   `alternates` yalnız `{ canonical }` döner.
   =============================================================== */

export const RESERVATION_LOOKUP_TR_PATH = "/rezervasyon-kontrol";

export async function buildReservationLookupMetadata(
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).reservationLookup;
  const settings = await getCachedSettings().catch(() => null);

  const { canonical, languages } = buildLocaleAlternates(
    RESERVATION_LOOKUP_TR_PATH,
    locale
  );
  const alternates = isMultilingualEnabled(settings)
    ? { canonical, languages }
    : { canonical };

  return {
    title: dict.metaTitle,
    description: dict.metaDescription,
    alternates,
    openGraph: {
      type: "website",
      url: canonical,
      title: dict.metaTitle,
      description: dict.ogDescription,
    },
    twitter: {
      card: "summary",
      title: dict.metaTitle,
    },
  };
}
