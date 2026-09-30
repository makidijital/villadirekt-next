import type { Locale } from "./config";
import type {
  SettingsTranslatableField,
  SettingsTranslationsByLocale,
} from "./settings-translations.types";

/* ===============================================================
   🛡️ SETTINGS TRANSLATION RESOLVER — PHASE 10L §6
   ===============================================================
   SAF (pure), client-safe, senkron. `lib/i18n/taxonomy-name.helper.ts`
   (Phase 10H) ile AYNI ilke: sunucu tarafında locale'den BAĞIMSIZ
   okunan çeviri payload'ı, render sırasında (client'ta `usePathname()`
   ile bulunan locale ile) burada seçilir → Header/Footer/public
   layout'un statik/ISR uygunluğu DEĞİŞMEZ.

   FALLBACK ZİNCİRİ (§6):
     locale === "tr"                       → canonical (AYNEN)
     çeviri var ve boş değil               → çeviri
     çeviri yok / null / "" / yalnız boşluk→ canonical (AYNEN)

   🛡️ TR BİT-BİRE AYNILIK GARANTİSİ:
   `locale === "tr"` dalı `canonical` argümanını DEĞİŞTİRMEDEN,
   trim etmeden, aynı referansla döndürür. Çağıran taraftaki mevcut
   `?.trim() || fallback` mantığı bu yüzden BİREBİR korunur — TR'de
   bu fonksiyon "yokmuş gibi" davranır.
   =============================================================== */

export function resolveSettingsText(
  canonical: string | null | undefined,
  translations: SettingsTranslationsByLocale | null | undefined,
  locale: Locale,
  field: SettingsTranslatableField
): string | null | undefined {
  /* TR: canonical AYNEN (undefined/null dahil — çağıranın mevcut
     falsy kontrolü bozulmasın). */
  if (locale === "tr") return canonical;

  const translated = translations?.[locale]?.[field];
  if (typeof translated === "string" && translated.trim() !== "") {
    return translated;
  }

  return canonical;
}
