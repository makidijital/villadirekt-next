import "server-only";

import { getTranslationsForParents } from "@/lib/i18n/get-translation.server";
import type {
  TaxonomyNameByLocale,
  TranslatableLocale,
} from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ MIGRATION 088 — ÖDEME YÖNTEMİ ADLARININ EN/DE OKUNMASI (public)
   ===============================================================
   Kaynak: migration 088'deki `payment_method_translations` tablosu
   (payment_method_id, locale, name). Okuma yolu: Phase 8D-1'in mevcut
   batch helper'ı `getTranslationsForParents("payment_method", ids,
   locale)` → `translationRepository.findManyForLocale` (tek `.in()`
   sorgusu). YENİ bir repository/servis/paralel çeviri sistemi EKLENMEDİ.

   `lib/i18n/get-villa-type-translations.server.ts` (Phase 10H) ile
   BİREBİR AYNI desen ve AYNI dönüş şekli (`TaxonomyNameByLocale`) —
   tüketici tarafta `resolveTaxonomyName` ile çözülür.

   Locale başına TAM 1 sorgu (en + de = 2, paralel); kayıt başına sorgu
   YOK (N+1 yok). `parentIds` boşsa hiç sorgu atılmaz.

   ⚠️ Canonical `payment_methods.name` bu helper'dan ETKİLENMEZ — burada
   yalnız EN/DE haritası üretilir. Canonical ad iş mantığında da okunur
   (`lib/payment-link.helper.ts > isWesternUnionMethod`) ve ASLA
   ezilmez.

   ⚠️ Çağıran taraf bunu yalnız `multilingual_enabled === true` iken
   çağırmalıdır — flag kapalıyken /en ve /de route'ları zaten 404 döner,
   dolayısıyla çeviri okumak GEREKSİZ bir sorgu olur.
   =============================================================== */

const TRANSLATABLE_LOCALES: readonly TranslatableLocale[] = ["en", "de"];

/**
 * Verilen ödeme yöntemi id'leri için `{ paymentMethodId: { en?, de? } }`
 * haritası. Boş/whitespace çeviriler haritaya HİÇ girmez → tüketici
 * tarafta `resolveTaxonomyName` doğal olarak TR fallback'ine düşer.
 */
export async function getPaymentMethodNamesByLocale(
  paymentMethodIds: readonly string[]
): Promise<Record<string, TaxonomyNameByLocale>> {
  const ids = Array.from(
    new Set(
      paymentMethodIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    )
  );
  if (ids.length === 0) return {};

  const maps = await Promise.all(
    TRANSLATABLE_LOCALES.map((locale) =>
      getTranslationsForParents("payment_method", ids, locale)
    )
  );

  const result: Record<string, TaxonomyNameByLocale> = {};
  TRANSLATABLE_LOCALES.forEach((locale, i) => {
    for (const id of ids) {
      const name = maps[i].get(id)?.name;
      if (typeof name !== "string" || name.trim() === "") continue;
      (result[id] ??= {})[locale] = name;
    }
  });

  return result;
}
