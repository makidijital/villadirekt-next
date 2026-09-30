import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  type Locale,
} from "@/lib/i18n/config";

/* ===============================================================
   🌍 COUNTRY LABEL — saf (pure) görünen ülke adı çözümü
   ===============================================================
   `lib/country.helper.ts > getCountryLabel` içindeki display
   mantığının BİREBİR aynısıdır; oradan buraya TAŞINDI ve helper artık
   bu fonksiyona delege eder (tek kaynak — iki kopya YOK).

   NEDEN AYRI DOSYA (Aşama 7A — country-state-city lazy loading):
     Bu dosya `country-state-city` paketini IMPORT ETMEZ. Kütüphane
     adı (library default) çağıran tarafından `lookupLibraryName`
     callback'i ile verilir. Böylece public rezervasyon formu, paketi
     statik olarak bundle'a sokmadan aynı etiketleri üretebilir.

   DAVRANIŞ (değişmedi):
     - boş / null / undefined        → ""
     - TR locale + override (TR)     → "Türkiye"
     - TR locale                     → library adı || ham kod
     - EN/DE                         → Intl bölge adı || library adı || ham kod
   =============================================================== */

/* TR-specific Türkçe display override.
   Sadece kullanıcının görünür text'ini etkiler; ISO code aynı kalır. */
export const COUNTRY_DISPLAY_OVERRIDES: Readonly<Record<string, string>> = {
  TR: "Türkiye",
};

/**
 * ISO country code → display label.
 * `lookupLibraryName(code)` yalnız library default adı gerektiğinde
 * çağrılır (eski `Country.getCountryByCode(code)?.name` ile aynı sıra).
 */
export function formatCountryLabel(
  iso: string | null | undefined,
  locale: Locale,
  lookupLibraryName: (code: string) => string | undefined
): string {
  if (!iso) return "";
  const code = iso.toUpperCase();

  /* 🛡️ PUBLIC ÇOKLU DİL — TR yolu BİREBİR korunur (override + library).
     `locale` verilmediğinde de DEFAULT_LOCALE = "tr" → admin, mail ve
     voucher çağıranlarının çıktısı DEĞİŞMEDİ. */
  if (locale === DEFAULT_LOCALE) {
    const override = COUNTRY_DISPLAY_OVERRIDES[code];
    if (override) return override;
    return lookupLibraryName(code) || iso;
  }

  /* EN/DE: ülke adı platformun MEVCUT `Intl` altyapısından çözülür
     (yeni bağımlılık/veri tablosu YOK). Çözülemezse library default'una,
     o da yoksa ham koda düşer — sessiz UI kırılması yok. */
  const localized = intlRegionName(code, locale);
  return localized || lookupLibraryName(code) || iso;
}

/** ISO 3166-1 alpha-2 → locale'e göre ülke adı. Desteklenmiyorsa "". */
function intlRegionName(code: string, locale: Locale): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  try {
    const dn = new Intl.DisplayNames([LOCALE_BCP47[locale]], {
      type: "region",
    });
    const name = dn.of(code);
    /* `of()` bilinmeyen kodda kodun kendisini döndürebilir. */
    return typeof name === "string" && name !== code ? name : "";
  } catch {
    return "";
  }
}
