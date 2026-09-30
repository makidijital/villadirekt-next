import "server-only";

import { getTranslationsForParents } from "@/lib/i18n/get-translation.server";
import type {
  TaxonomyNameByLocale,
  TranslatableLocale,
} from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ MENÜ ADLARININ EN/DE OKUNMASI (public) — migration 086
   ===============================================================
   `lib/i18n/get-villa-type-translations.server.ts` (Phase 10H) ile
   BİREBİR AYNI dosya deseni — yalnız entity `"menu"`.

   Kaynak: `menu_translations` (menu_id, locale, name).
   Okuma yolu: mevcut batch helper `getTranslationsForParents("menu",
   ids, locale)` → `translationRepository.findManyForLocale` (TEK
   `.in()` sorgusu). YENİ bir repository/servis/paralel çeviri
   sistemi EKLENMEDİ.

   Locale başına TAM 1 sorgu (en + de = 2, paralel); menü satırı
   başına sorgu YOK (N+1 YOK). `menuIds` boşsa hiç sorgu atılmaz.

   NEDEN locale-bağımsız (`{ en?, de? }` haritası): Header CLIENT
   component'tir ve aktif locale'i render'da `usePathname()` ile
   türetir (bkz. lib/i18n/taxonomy-name.helper.ts dosya başı notu).

   ⚠️ Çağıran taraf bunu yalnız `multilingual_enabled === true` iken
   çağırmalıdır (bkz. HeaderWrapper) — flag kapalıyken /en ve /de
   zaten 404 olduğu için çeviri okumak GEREKSİZ sorgu olur.

   ⚠️ KAPSAM — YALNIZ MANUEL MENÜLER: çağıran taraf (HeaderWrapper)
   bu fonksiyona SADECE `source_type === "manual"` satırların id'lerini
   geçirir. page/page-auto (→ `page_translations`), category
   (→ `villa_type_translations`) ve region (→ çevrilmez) kaynakları bu
   yoldan HİÇ okunmaz; davranışları BİREBİR korunur.

   ⚠️ Yalnız GÖRÜNEN AD. href/slug/source_id bu dosyaya HİÇ girmez.
   =============================================================== */

const TRANSLATABLE_LOCALES: readonly TranslatableLocale[] = ["en", "de"];

/**
 * Verilen menü satırı id'leri için `{ menuId: { en?, de? } }` haritası.
 * Boş/whitespace çeviriler haritaya HİÇ girmez → tüketici tarafta
 * `resolveTaxonomyName` doğal olarak TR fallback'ine düşer.
 */
export async function getMenuNamesByLocale(
  menuIds: readonly string[]
): Promise<Record<string, TaxonomyNameByLocale>> {
  const ids = Array.from(
    new Set(
      menuIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    )
  );
  if (ids.length === 0) return {};

  const maps = await Promise.all(
    TRANSLATABLE_LOCALES.map((locale) =>
      getTranslationsForParents("menu", ids, locale)
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
