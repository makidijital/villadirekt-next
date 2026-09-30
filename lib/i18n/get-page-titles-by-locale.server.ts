import "server-only";

import { getTranslationsForParents } from "@/lib/i18n/get-translation.server";
import type {
  TaxonomyNameByLocale,
  TranslatableLocale,
} from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ CMS SAYFA BAŞLIKLARININ EN/DE OKUNMASI (public navigation)
   ===============================================================
   `lib/i18n/get-villa-type-translations.server.ts` (Phase 10H) ve
   `lib/i18n/get-menu-translations.server.ts` (migration 086) ile
   BİREBİR AYNI dosya deseni — yalnız entity `"page"` ve okunan alan
   `title`.

   Kaynak: migration 082'deki `page_translations` (page_id, locale,
   title) — YENİ tablo/kolon/migration YOK.
   Okuma yolu: MEVCUT batch helper `getTranslationsForParents("page",
   ids, locale)` → `translationRepository.findManyForLocale` (tek
   `.in()` sorgusu). YENİ bir repository/servis/çeviri sistemi
   EKLENMEDİ; `resolvePageContent` (Phase 12D, `/p/[slug]` gövdesi ve
   `cms-page-metadata.ts` için tekil okuma) DEĞİŞTİRİLMEDİ.

   NEDEN AYRI BİR HELPER (resolvePageContent yetmiyor):
     `resolvePageContent` TEK sayfa için TEK satır okur
     (`getTranslation`) ve 5 alanı (title/excerpt/body/seo_*) çözer.
     Navigation'da N sayfa var ve YALNIZ `title` gerekiyor — onu N kez
     çağırmak tam da yasaklanan N+1 olurdu. Bu dosya aynı altyapının
     BATCH ucunu kullanır.

   Locale başına TAM 1 sorgu (en + de = 2, paralel); sayfa başına
   sorgu YOK (N+1 YOK). `pageIds` boşsa hiç sorgu atılmaz.

   NEDEN locale-BAĞIMSIZ (`{ en?, de? }` haritası, `locale` parametresi
   YOK): Header ve Footer bu projede CLIENT component'tir ve aktif
   locale'i render sırasında `usePathname()` + `localeFromPathname()`
   ile türetir; server wrapper'lar (`HeaderWrapper`/`FooterWrapper`)
   `headers()`/`cookies()` KULLANMAZ — bu, `(public)/layout.tsx`'in
   statik/ISR uygunluğunu korumak için BİLİNÇLİ bir karardır (bkz.
   lib/i18n/taxonomy-name.helper.ts dosya başı notu). Bu yüzden
   çeviriler locale'den bağımsız (en + de birlikte) okunur, seçim
   render'da `resolveTaxonomyName` ile yapılır — villa tipi ve manuel
   menü helper'larıyla AYNI sözleşme.

   ⚠️ Çağıran taraf bunu yalnız `multilingual_enabled === true` iken
   çağırmalıdır — flag kapalıyken /en ve /de zaten 404 olduğu için
   çeviri okumak GEREKSİZ sorgu olur (bkz. HeaderWrapper/FooterWrapper).

   ⚠️ Yalnız GÖRÜNEN BAŞLIK. `slug` / `href` / `source_id` bu dosyaya
   HİÇ girmez — sayfa linki canonical kalır.
   =============================================================== */

const TRANSLATABLE_LOCALES: readonly TranslatableLocale[] = ["en", "de"];

/**
 * Verilen `pages.id` listesi için `{ pageId: { en?, de? } }` haritası.
 * Boş/whitespace çeviriler haritaya HİÇ girmez → tüketici tarafta
 * `resolveTaxonomyName` doğal olarak canonical TR başlığa düşer.
 */
export async function getPageTitlesByLocale(
  pageIds: readonly string[]
): Promise<Record<string, TaxonomyNameByLocale>> {
  const ids = Array.from(
    new Set(
      pageIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    )
  );
  if (ids.length === 0) return {};

  const maps = await Promise.all(
    TRANSLATABLE_LOCALES.map((locale) =>
      getTranslationsForParents("page", ids, locale)
    )
  );

  const result: Record<string, TaxonomyNameByLocale> = {};
  TRANSLATABLE_LOCALES.forEach((locale, i) => {
    for (const id of ids) {
      const title = maps[i].get(id)?.title;
      if (typeof title !== "string" || title.trim() === "") continue;
      (result[id] ??= {})[locale] = title;
    }
  });

  return result;
}
