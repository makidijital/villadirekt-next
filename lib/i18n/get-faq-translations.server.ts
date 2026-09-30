import "server-only";

import { getTranslationsForParents } from "@/lib/i18n/get-translation.server";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ PHASE 11 — SSS (FAQ) ÇEVİRİ OVERLAY (server-only)
   ===============================================================
   `faq_translations` tablosu migration 082'de OLUŞTURULMUŞTU ama bugüne
   kadar HİÇBİR call-site okumuyordu. Bu helper onu ana sayfadaki SSS
   bölümüne bağlar — YENİ TABLO / MİGRASYON GEREKMEZ.

   `lib/i18n/get-villa-type-translations.server.ts` (Phase 10H) ile
   BİREBİR AYNI desen:
     • TEK batch sorgu (`getTranslationsForParents` → `.in()`), N+1 YOK.
     • `locale === "tr"` → sorgu HİÇ atılmaz, canonical liste aynen döner.
     • Çeviri satırı yok / alan boş → o alan canonical'e düşer
       (soru çevrilmiş ama cevap boşsa yalnız soru çevrilir).
     • Okuma fail olursa canonical liste döner — public sayfa ÇÖKMEZ.

   ⚠️ Bu helper `unstable_cache` KULLANMAZ. Çeviri okuması locale'e
   bağlı olduğu için cache katmanı `lib/cache.helpers.ts` içinde,
   locale BAŞINA AYRI cache key'iyle kurulur (çapraz-dil sızıntısına
   karşı) — bkz. `getCachedFaqs(locale)`.
   =============================================================== */

export type FaqLike = {
  id: string;
  question: string;
  answer: string;
};

export async function applyFaqTranslations<T extends FaqLike>(
  faqs: readonly T[],
  locale: Locale
): Promise<T[]> {
  if (locale === DEFAULT_LOCALE) return faqs as T[];
  if (faqs.length === 0) return faqs as T[];

  const map = await getTranslationsForParents(
    "faq",
    faqs.map((f) => f.id),
    locale
  ).catch(() => null);
  if (!map || map.size === 0) return faqs as T[];

  return faqs.map((f) => {
    const row = map.get(f.id);
    if (!row) return f;
    const question =
      typeof row.question === "string" && row.question.trim() !== ""
        ? row.question
        : f.question;
    const answer =
      typeof row.answer === "string" && row.answer.trim() !== ""
        ? row.answer
        : f.answer;
    if (question === f.question && answer === f.answer) return f;
    return { ...f, question, answer };
  });
}
