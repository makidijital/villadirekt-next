import "server-only";

import { getTranslationsForParents } from "@/lib/i18n/get-translation.server";
import type {
  TaxonomyNameByLocale,
  TranslatableLocale,
} from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ PHASE 10H — VİLLA TİPİ ADLARININ EN/DE OKUNMASI (public)
   ===============================================================
   Kaynak: migration 082'deki `villa_type_translations` tablosu
   (type_id, locale, name) — YENİ tablo/kolon/migration YOK.
   Okuma yolu: Phase 8D-1'in mevcut batch helper'ı
   `getTranslationsForParents("villa_type", ids, locale)` →
   `translationRepository.findManyForLocale` (tek `.in()` sorgusu).
   YENİ bir repository/servis/paralel çeviri sistemi EKLENMEDİ.

   Locale başına TAM 1 sorgu (en + de = 2, paralel); kayıt başına
   sorgu YOK (N+1 yok). `parentIds` boşsa hiç sorgu atılmaz.

   NEDEN locale-bağımsız: bkz. lib/i18n/taxonomy-name.helper.ts
   (Header/Footer client component'tir, locale'i render'da türetir).

   ⚠️ Çağıran taraf bunu yalnız `multilingual_enabled === true` iken
   çağırmalıdır — flag kapalıyken /en ve /de route'ları zaten
   `requirePublicLocaleEnabled()` ile 404 döner, dolayısıyla çeviri
   okumak GEREKSİZ bir sorgu olur (bkz. HeaderWrapper/FooterWrapper).
   =============================================================== */

const TRANSLATABLE_LOCALES: readonly TranslatableLocale[] = ["en", "de"];

/**
 * Verilen villa tipi id'leri için `{ typeId: { en?, de? } }` haritası.
 * Boş/whitespace çeviriler haritaya HİÇ girmez → tüketici tarafta
 * `resolveTaxonomyName` doğal olarak TR fallback'ine düşer.
 */
export async function getVillaTypeNamesByLocale(
  typeIds: readonly string[]
): Promise<Record<string, TaxonomyNameByLocale>> {
  const ids = Array.from(
    new Set(
      typeIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    )
  );
  if (ids.length === 0) return {};

  const maps = await Promise.all(
    TRANSLATABLE_LOCALES.map((locale) =>
      getTranslationsForParents("villa_type", ids, locale)
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
