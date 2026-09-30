/* ===============================================================
   🛡️ LOCALE CORE — PHASE 1B (yalnız temel primitive'ler)
   ===============================================================
   Bu modül çoklu dil (TR/EN/DE) mimarisinin PHASE 1B "Locale Core"
   adımıdır. Yalnız tip/validasyon/resolver/settings-okuma primitive'leri
   içerir — HİÇBİR kullanıcı-görünür davranışı değiştirmez:

     - Public URL/routing DEĞİŞMEDİ (middleware.ts dokunulmadı).
     - Cookie YAZILMIYOR/OKUNMUYOR — bu modül hiçbir yerde cookie/
       header/URL erişimi yapmaz; resolveLocale yalnız kendisine
       geçilen parametreyi değerlendirir.
     - Cache key'leri DEĞİŞMEDİ (lib/cache.helpers.ts dokunulmadı).
     - <html lang="tr"> (app/layout.tsx) DEĞİŞMEDİ.
     - Bu dosyadaki fonksiyonlar bu fazda HİÇBİR call-site'tan
       ÇAĞRILMIYOR — yalnız gelecek fazlar (routing/UI/cookie) için
       hazır, izole, test edilmiş bir temel.

   SETTINGS ENTEGRASYONU (Phase 1A):
     `settings.multilingual_enabled` / `settings.public_default_locale`
     (migration 081) alanlarını type-safe okuyan iki saf (pure) yardımcı
     da burada. `multilingual_enabled=false` olsa da, `public_default_locale`
     "en"/"de" olsa da bu fonksiyonlar hiçbir side-effect üretmez ve bu
     fazda hiçbir yerden çağrılmaz — public site davranışı DEĞİŞMEZ.
   =============================================================== */

/** Desteklenen tek locale kümesi. Projede locale değeri bunun dışında
 *  dağınık string olarak KULLANILMAMALI — her yeni call-site bu tipi
 *  veya aşağıdaki helper'ları kullanmalı. */
export type Locale = "tr" | "en" | "de";

export const SUPPORTED_LOCALES: readonly Locale[] = ["tr", "en", "de"];

export const DEFAULT_LOCALE: Locale = "tr";

/** Type guard — yalnız `SUPPORTED_LOCALES` içindeki 3 değeri kabul eder. */
export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/** Ham/güvenilmeyen bir değeri güvenli bir Locale'e çevirir.
 *  Kullanıcı girdisi (cookie/query/header — bu fazda hiçbir yerden
 *  OKUNMUYOR) asla doğrudan Locale olarak güvenilmemeli; bu fonksiyon
 *  o güvenlik sınırını sağlar. Geçersiz/eksik/undefined/null →
 *  DEFAULT_LOCALE ("tr"). */
export function toLocale(value: unknown): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/** Server tarafı locale çözümleme — PHASE 1B temel davranışı:
 *    - geçerli explicit locale verilmişse onu kullanır
 *    - geçersiz/eksikse DEFAULT_LOCALE'e ("tr") düşer
 *  Henüz URL/cookie/header okuma YOK — bu, ileride (Phase 1C+) aynı
 *  imzayı bozmadan genişletilebilecek şekilde bilinçli olarak dar
 *  tutuldu. Bu fazda hiçbir request akışı bu fonksiyonu çağırmıyor. */
export function resolveLocale(explicitLocale?: string | null): Locale {
  return toLocale(explicitLocale);
}

/* ===============================================================
   🛡️ PHASE 9A — PATHNAME'DEN LOCALE TESPİTİ (yalnız /en, /de prefix'i)
   ===============================================================
   AMAÇ: Header.tsx ("use client", zaten `usePathname()` kullanıyor —
   Phase 9A audit'inde doğrulandı) kendi locale'ini middleware/headers()
   OLMADAN, saf/senkron şekilde tespit edebilsin. Yalnız TAM segment
   eşleşmesi kabul edilir (`/en/...` veya tam `/en`) — `/energy` gibi
   path'ler YANLIŞLIKLA eşleşmez (lib/i18n/seo-alternates.ts'teki
   `stripLocalePrefix`'in AYNI segment-sınırı ilkesi; o fonksiyon
   private/farklı bir iş yaptığı için buraya AYRI, minimal bir kopya
   olarak yazıldı — import edilip paylaşılmadı, ÇÜNKÜ o dosya path
   REBUILD ediyor, bu fonksiyon yalnız TESPİT ediyor).

   `/tr` prefix'i bu projede HİÇBİR ZAMAN üretilmez (Phase 4A kararı) —
   yine de savunmacı olarak `firstSegment === "tr"` özel durumu
   DEFAULT_LOCALE'e düşürülür (üstteki `toLocale` ile AYNI "asla throw
   etme, güvenli fallback" convention'ı).

   Bu fonksiyon React'e/Next'e bağımlı DEĞİL (saf string işlemi) —
   yalnız `usePathname()`'in DÖNDÜRDÜĞÜ değer buraya geçirilir; hook'un
   kendisi burada ÇAĞRILMAZ (server-safe, client-safe, test-safe). */
export function localeFromPathname(
  pathname: string | null | undefined
): Locale {
  if (!pathname) return DEFAULT_LOCALE;
  const firstSegment = pathname.split("/")[1] || "";
  if (firstSegment === "en" || firstSegment === "de") {
    return firstSegment;
  }
  return DEFAULT_LOCALE;
}

/* ===============================================================
   SETTINGS ENTEGRASYONU (Phase 1A alanlarının type-safe okuması)
   =============================================================== */

type SettingsLocaleFields = {
  multilingual_enabled?: boolean | null;
  public_default_locale?: string | null;
};

/** settings.multilingual_enabled'i null-safe okur.
 *  null/undefined/settings yok → false (fail-safe KAPALI — mevcut
 *  tek-dilli davranış varsayılan kalır). */
export function isMultilingualEnabled(
  settings: SettingsLocaleFields | null | undefined
): boolean {
  return !!settings?.multilingual_enabled;
}

/** settings.public_default_locale'i güvenli bir Locale'e çevirir.
 *  Geçersiz/eksik/null → DEFAULT_LOCALE ("tr"). DB CHECK constraint'i
 *  (migration 081) zaten yalnız tr/en/de'ye izin veriyor; bu fonksiyon
 *  yine de savunmacı davranır (constraint bypass edilse veya satır
 *  hiç yoksa bile güvenli). */
export function getPublicDefaultLocale(
  settings: SettingsLocaleFields | null | undefined
): Locale {
  return toLocale(settings?.public_default_locale);
}

/* ===============================================================
   🛡️ PHASE 10B — Intl/`toLocaleDateString` İÇİN BCP-47 ETİKETİ
   ===============================================================
   AMAÇ: AvailabilityInlineCalendar/BookingCalendar'ın ay başlığı
   (`toLocaleDateString(tag, {month:"long"})`) ve MobileBookingCta'nın
   sayı formatlaması (`toLocaleNumber`/`toLocaleString`) için native
   `Intl` çağrılarına geçirilecek locale tag'i. `app/components/seo/
   StructuredData.tsx`'in `SCHEMA_IN_LANGUAGE` haritasıyla AYNI ilke
   (region-agnostic EN/DE, region-specific TR) — ANCAK schema.org
   `inLanguage` alanı için DEĞİL, `Intl`/`toLocaleDateString` için
   AYRI bir sabit (farklı tüketici, farklı dosya; bilinçli olarak
   BAĞLANMADI — birini değiştirmek diğerini etkilemez). Yeni bir
   locale/config mekanizması İCAT EDİLMEDİ, yalnız SUPPORTED_LOCALES
   üzerinden türetilen statik bir Record. */
export const LOCALE_BCP47: Record<Locale, string> = {
  tr: "tr-TR",
  en: "en-US",
  de: "de-DE",
};
