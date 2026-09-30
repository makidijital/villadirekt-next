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
import type { MonthNumber } from "@/lib/i18n/dictionaries/types";
import {
  resolveBucketMonthFromSlug,
  parseGapNights,
  bucketMonthLabel,
  slugToMonthNumber,
} from "@/lib/short-gaps.helpers";

/* ===============================================================
   🛡️ /kisa-sureli-tarihler/[ay]/[gece] METADATA (TR / EN / DE ORTAK)
   ===============================================================
   `contact-metadata.ts` ile AYNI desen.

   AY ADI: `home.months` sözlüğü + MEVCUT `bucketMonthLabel` çekirdeği
   (ShortGapsSection ile AYNI yol) — yeni bir tarih/ay sistemi
   İCAT EDİLMEDİ. TR'de sonuç `bucketMonthLabelTr` ile BİREBİR aynıdır.

   TR ÇIKTISI DEĞİŞMEDİ: title/description dictionary TR değerleriyle
   BİREBİR; `multilingual_enabled` kapalıyken `alternates` yalnız
   `{ canonical }` döner. Geçersiz slug → `{}` (eski davranış).
   =============================================================== */

export function shortGapsMonthLabel(ay: string, locale: Locale): string {
  const months = getDictionary(locale).home.months;
  const monthName = (m: number) => months[m as MonthNumber] ?? "";
  const bucket = resolveBucketMonthFromSlug(ay);
  if (bucket) return bucketMonthLabel(bucket, monthName);
  const monthNum = slugToMonthNumber(ay);
  return monthNum === null ? "" : monthName(monthNum);
}

export async function buildShortGapsMetadata(
  params: Promise<{ ay: string; gece: string }>,
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const { ay, gece } = await params;
  const nights = parseGapNights(gece);
  const monthNum = slugToMonthNumber(ay);
  if (!nights || monthNum === null) return {};

  const dict = getDictionary(locale).shortGaps;
  const monthLabel = shortGapsMonthLabel(ay, locale);

  const title = formatDictionaryString(dict.metaTitle, {
    month: monthLabel,
    n: nights,
  });
  const description = formatDictionaryString(dict.metaDescription, {
    month: monthLabel,
    n: nights,
  });

  const trPath = `/kisa-sureli-tarihler/${ay}/${nights}`;
  const settings = await getCachedSettings().catch(() => null);
  const { canonical, languages } = buildLocaleAlternates(trPath, locale);
  const alternates = isMultilingualEnabled(settings)
    ? { canonical, languages }
    : { canonical };

  return {
    title,
    description,
    alternates,
    openGraph: { title, description, url: canonical },
  };
}
