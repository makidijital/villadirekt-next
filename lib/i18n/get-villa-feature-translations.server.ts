import "server-only";

import { getTranslationsForParents } from "@/lib/i18n/get-translation.server";
import type {
  TaxonomyNameByLocale,
  TranslatableLocale,
} from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ VİLLA ÖZELLİĞİ ADLARININ EN/DE OKUNMASI (public)
   ===============================================================
   Kaynak: migration 082'deki `villa_feature_translations` tablosu
   (feature_id, locale, name) — YENİ tablo/kolon/migration YOK.
   Okuma yolu: mevcut batch helper `getTranslationsForParents(
   "villa_feature", ids, locale)` → `translationRepository
   .findManyForLocale` (tek `.in()` sorgusu). YENİ bir repository/
   servis/paralel çeviri sistemi EKLENMEDİ.

   `lib/i18n/get-villa-type-translations.server.ts` (Phase 10H) ve
   `get-payment-method-translations.server.ts` (Migration 088) ile
   BİREBİR AYNI desen ve AYNI dönüş şekli (`TaxonomyNameByLocale`) —
   tüketici tarafta `resolveTaxonomyName` ile çözülür.

   Locale başına TAM 1 sorgu (en + de = 2, paralel); kayıt başına
   sorgu YOK (N+1 yok). `parentIds` boşsa hiç sorgu atılmaz.

   NEDEN locale-bağımsız `{ en?, de? }` haritası: tüketici
   `/teklif-al` formu bir CLIENT component'tir ve locale'i render
   sırasında prop'tan alır (bkz. taxonomy-name.helper.ts).

   ⚠️ Villa detay sayfası (`/en|de/kiralik-villa/[slug]`) özellik
   adlarını ZATEN `getTranslationsForParents("villa_feature", …)` +
   `resolveTranslatedField` ile çözüyor; bu helper O YOLU
   DEĞİŞTİRMEZ, yalnız client tüketiciler için locale-bağımsız
   harita üretir.

   ⚠️ Çağıran taraf bunu yalnız `multilingual_enabled === true` iken
   çağırmalıdır — flag kapalıyken /en ve /de route'ları zaten 404
   döner, dolayısıyla çeviri okumak GEREKSİZ bir sorgu olur.
   =============================================================== */

const TRANSLATABLE_LOCALES: readonly TranslatableLocale[] = ["en", "de"];

/**
 * Verilen villa özelliği id'leri için `{ featureId: { en?, de? } }`
 * haritası. Boş/whitespace çeviriler haritaya HİÇ girmez → tüketici
 * tarafta `resolveTaxonomyName` doğal olarak TR fallback'ine düşer.
 */
export async function getVillaFeatureNamesByLocale(
  featureIds: readonly string[]
): Promise<Record<string, TaxonomyNameByLocale>> {
  const ids = Array.from(
    new Set(
      featureIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    )
  );
  if (ids.length === 0) return {};

  const maps = await Promise.all(
    TRANSLATABLE_LOCALES.map((locale) =>
      getTranslationsForParents("villa_feature", ids, locale)
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
