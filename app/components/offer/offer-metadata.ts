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
   🛡️ /teklif-al METADATA (TR / EN / DE ORTAK)
   ===============================================================
   `app/components/contact/contact-metadata.ts` ile AYNI desen.

   TR ÇIKTISI DEĞİŞMEDİ: title / description dictionary TR değerleri
   eski hardcoded metinlerle BİREBİR; `robots: { index: true, follow:
   true }` AYNEN korunur; `multilingual_enabled` KAPALIYKEN
   `alternates` yalnız `{ canonical: "/teklif-al" }` döner.
   =============================================================== */

export const OFFER_TR_PATH = "/teklif-al";

export function offerPath(locale: Locale): string {
  return buildLocaleAlternates(OFFER_TR_PATH, locale).canonical;
}

export async function buildOfferMetadata(
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).offer;
  const settings = await getCachedSettings().catch(() => null);

  const { canonical, languages } = buildLocaleAlternates(OFFER_TR_PATH, locale);
  const alternates = isMultilingualEnabled(settings)
    ? { canonical, languages }
    : { canonical };

  return {
    title: dict.metaTitle,
    description: dict.metaDescription,
    robots: { index: true, follow: true },
    alternates,
  };
}
