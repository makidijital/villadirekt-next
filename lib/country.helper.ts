import { Country } from "country-state-city";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
/* 🛡️ Aşama 7A — display mantığı (override + Intl + fallback sırası)
   `lib/country-label.ts`'e BİREBİR taşındı; bu helper aynı sonucu
   üretmek için ona delege eder. Server/admin/mail/voucher çağıranları
   için imza ve çıktı DEĞİŞMEDİ. */
import {
  COUNTRY_DISPLAY_OVERRIDES,
  formatCountryLabel,
} from "@/lib/country-label";

/* ===============================================================
   🌍 COUNTRY HELPER — display-side localization wrapper
   ===============================================================
   country-state-city library tüm ülke adlarını İngilizce döndürür
   ("Turkey", "United States", ...). Türk kullanıcıya yönelik display
   tutarlılığı için TR kodu özelinde "Türkiye" override'ı uygulanır.

   KESIN SINIRLAR (display-only contract):
     ❌ DB country code         — DOKUNULMAZ ("TR" olarak saklanır)
     ❌ Form payload / API body — DOKUNULMAZ (ISO code akar)
     ❌ Validation              — DOKUNULMAZ
     ❌ Phone input             — DOKUNULMAZ
     ❌ country-state-city kütüphane usage'ı — DOKUNULMAZ
     ✅ Sadece **görünen** text dönüşümü.

   PATTERN:
     - `getCountryLabel(iso)`       : ISO code → display ad (TR → Türkiye)
     - `findCountryByLabel(label)`  : display ad → ISO code (reverse)
       Reverse lookup, free-text input → ISO code map'i için gerekli;
       admin LocationStep ve reservation detail page'inde kullanıcı
       text yazıp ülke seçtiğinde "Türkiye" ifadesinin de TR ISO kodu
       ile eşleşmesini garanti eder.

   GENİŞLETME:
     Yeni TR-only override (ör. "GB" → "İngiltere") gerekirse
     COUNTRY_DISPLAY_OVERRIDES map'ine ekleyin; diğer kodlar
     library default'una düşmeye devam eder.
   =============================================================== */

/* TR-specific Türkçe display override → `lib/country-label.ts`
   (COUNTRY_DISPLAY_OVERRIDES). Değer DEĞİŞMEDİ. */

/* ---------------------------------------------------------------
   getCountryLabel — ISO country code → display label
   ---------------------------------------------------------------
   - TR  → "Türkiye"  (override)
   - US  → "United States" (country-state-city default)
   - boş / null / undefined → "" (UI tarafı `||` ile fallback kullanır)
   - bilinmeyen kod → ham kod (defensive — silent UI breakage YOK)
--------------------------------------------------------------- */
export function getCountryLabel(
  iso: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE
): string {
  return formatCountryLabel(
    iso,
    locale,
    (code) => Country.getCountryByCode(code)?.name
  );
}

/* ---------------------------------------------------------------
   findCountryByLabel — display label → country object
   ---------------------------------------------------------------
   Reverse lookup. Override map'i de aranır:
     "Türkiye" → { isoCode: "TR", name: "Turkey" }
     "Turkey"  → { isoCode: "TR", name: "Turkey" } (library)
     "Germany" → { isoCode: "DE", name: "Germany" } (library)
   Bulunamayan label için undefined döner — caller'lar mevcut
   "free-text fallback" davranışını koruyabilir.
--------------------------------------------------------------- */
export function findCountryByLabel(
  label: string
): { isoCode: string; name: string } | undefined {
  if (!label) return undefined;

  /* 1) Override map'inden ters arama. */
  for (const [iso, displayName] of Object.entries(COUNTRY_DISPLAY_OVERRIDES)) {
    if (displayName === label) {
      const c = Country.getCountryByCode(iso);
      if (c) return { isoCode: c.isoCode, name: c.name };
    }
  }

  /* 2) country-state-city default isim arama. */
  const found = Country.getAllCountries().find((c) => c.name === label);
  return found ? { isoCode: found.isoCode, name: found.name } : undefined;
}
