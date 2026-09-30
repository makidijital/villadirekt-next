/* ===============================================================
   🛡️ SEO ALTERNATES — canonical + hreflang URL SETİ (PHASE 7B)
   ===============================================================
   Saf, framework'ten bağımsız bir path helper'ı: verilen bir path +
   hedef locale için canonical path'i VE tam hreflang (`languages`)
   kümesini üretir.

   BU DOSYA BİLİNÇLİ OLARAK HİÇBİR YERE BAĞLANMADI (Phase 7B kapsamı):
     - app/layout.tsx, app/(public)/kiralik-villa/[slug]/page.tsx,
       app/(public)/kiralik-villalar/page.tsx, app/sitemap.ts,
       app/robots.ts, app/components/seo/StructuredData.tsx,
       lib/seo.ts — HİÇBİRİ bu modülü import ETMİYOR/ETMEYECEK bu
       fazda. Bağlama (generateMetadata/sitemap entegrasyonu) Phase
       7C/7D+'nin konusu (bkz. Phase 7A audit raporu §13).
     - `multilingual_enabled` bayrağını KONTROL ETMEZ — bilinçli:
       bu saf bir URL-şekillendirme fonksiyonu, flag kontrolü ileride
       çağıran generateMetadata/sitemap call-site'larının sorumluluğu
       olacak (Phase 7A audit §4, §10).
     - Absolute URL ÜRETMEZ — yalnız relative path döner; absolute'a
       çözme mevcut `metadataBase` mekanizmasının işi (lib/seo.ts,
       app/layout.tsx) — ona dokunulmadı.

   URL STRATEJİSİ (Phase 4A'dan beri sabit, burada YENİDEN
   TANIMLANMADI, yalnız uygulanıyor):
     TR        → {path}       (prefix YOK — `/tr` HİÇBİR ZAMAN üretilmez)
     EN        → /en{path}
     DE        → /de{path}
     x-default → TR path (Phase 7A audit §4 gerekçesi: site bugün
                 fiilen TR-first, DEFAULT_LOCALE="tr")

   NORMALIZATION (bilinçli minimal — yeni bir proje convention'ı İCAT
   EDİLMEDİ):
     - path'in başına tek bir "/" garanti edilir — `app/sitemap.ts`'in
       kendi `url()` helper'ıyla (satır 74-83) AYNI desen:
       `path.startsWith("/") ? path : "/" + path`.
     - path zaten `/en` veya `/de` ile başlıyorsa (yalnız TAM segment
       eşleşmesi — `/en/...` veya tam `/en`) bu prefix önce soyulur,
       sonra hedef locale'e göre yeniden eklenir → çifte prefix
       (`/en/en/...`) OLUŞMAZ, fonksiyon idempotenttir. `/energy`,
       `/design` gibi path'ler YANLIŞLIKLA `/en`/`/de` prefix'i
       taşıyormuş gibi ALGILANMAZ (segment-sınırlı karşılaştırma).
     - Trailing slash / query string / hash STRIP EDİLMEZ, YORUMLANMAZ
       — path'in prefix sonrası kalan kısmı OPAK bir string olarak
       aynen taşınır (agresif normalization YOK).
     - `/tr` prefix'li bir input bu projede ZATEN oluşmaz (TR route'ları
       hiçbir zaman `/tr` taşımıyor — Phase 4A kararı); bu fonksiyon
       böyle bir input'u soymaya ÇALIŞMAZ (kapsam dışı, "icat etme"
       kuralına uyularak eklenmedi).

   Locale tipi Phase 1B'den (`lib/i18n/config.ts`) reuse edilir — burada
   YENİDEN TANIMLANMADI. `toLocale`/`SUPPORTED_LOCALES` de aynı şekilde
   reuse edilir (savunmacı validasyon için — bkz. `buildLocaleAlternates`).
   =============================================================== */

import { SUPPORTED_LOCALES, toLocale, type Locale } from "@/lib/i18n/config";

export type LocaleAlternates = {
  /** Hedef `locale` için canonical path (relative, `/` ile başlar). */
  canonical: string;
  /** Next.js `Metadata.alternates.languages` ile birebir uyumlu şekil
   *  (`tr`/`en`/`de`/`x-default` key'leri). */
  languages: Record<Locale | "x-default", string>;
};

/** TR dışındaki, gerçekten URL prefix'i olan locale'ler. `SUPPORTED_LOCALES`
 *  (Phase 1B) üzerinden türetilir — yeni bir locale listesi İCAT EDİLMEDİ. */
const PREFIXED_LOCALES: readonly Exclude<Locale, "tr">[] = SUPPORTED_LOCALES.filter(
  (l): l is Exclude<Locale, "tr"> => l !== "tr"
);

/** path'in başına tek bir "/" garantiler — `app/sitemap.ts:74-83`'teki
 *  `url()` helper'ıyla AYNI desen (yeni bir kural değil, mevcut olanın
 *  reuse'u). */
function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * path zaten bir locale prefix'i (`/en`, `/de`) ile başlıyorsa onu
 * SOYAR ve TR-eşdeğeri (prefix'siz) base path'i döner. Prefix yoksa
 * path aynen döner. Yalnız TAM segment eşleşmesi kabul edilir
 * (`/en/...` veya tam `/en`) — `/energy` gibi path'ler YANLIŞLIKLA
 * eşleşmez (segment sınırı: prefix sonrası ya path biter ya `/` gelir).
 */
function stripLocalePrefix(path: string): string {
  for (const prefix of PREFIXED_LOCALES) {
    const withTrailingSlash = `/${prefix}/`;
    const exact = `/${prefix}`;
    if (path.startsWith(withTrailingSlash)) {
      // "/en/kiralik-villa/x" → "/kiralik-villa/x" (baştaki "/" korunur).
      return path.slice(withTrailingSlash.length - 1);
    }
    if (path === exact) {
      // Tam "/en" (kök) → "/" (TR kökü).
      return "/";
    }
  }
  return path;
}

/** base path + locale prefix → prefixed path. `base === "/"` özel
 *  durumu `/en/` değil `/en` üretir (çifte slash yok). */
function withLocalePrefix(base: string, prefix: Exclude<Locale, "tr">): string {
  return base === "/" ? `/${prefix}` : `/${prefix}${base}`;
}

/**
 * Bir path + hedef locale için canonical + tam hreflang (`languages`)
 * kümesini üretir.
 *
 * `path`: TR path'i (prefix'siz, ör. "/kiralik-villa/villa-in-love")
 * VEYA zaten `/en`/`/de` ile prefixed bir path olabilir — ikisi de
 * AYNI (idempotent) sonucu üretir; fonksiyon önce mevcut prefix'i
 * soyar, sonra tüm locale varyantlarını bu TR-eşdeğeri base'ten
 * yeniden inşa eder.
 *
 * `locale`: TS tipi `Locale` ile sınırlı olsa da, çağıran taraf
 * (örn. runtime/JSON kaynaklı, tip-güvenli olmayan bir değer)
 * savunmacı olarak `toLocale()` (Phase 1B) ile sanitize edilir —
 * geçersiz bir değer sessizce `DEFAULT_LOCALE` ("tr")'ye düşer,
 * ASLA throw etmez (projenin mevcut "asla throw etme" güvenli-fallback
 * convention'ıyla tutarlı — bkz. lib/i18n/get-translation.server.ts).
 *
 * `multilingual_enabled` KONTROL EDİLMEZ — pure helper; flag kontrolü
 * ileride çağıran tarafın (generateMetadata/sitemap) sorumluluğu.
 */
export function buildLocaleAlternates(
  path: string,
  locale: Locale
): LocaleAlternates {
  const safeLocale = toLocale(locale);
  const basePath = stripLocalePrefix(ensureLeadingSlash(path));

  const languages: Record<Locale | "x-default", string> = {
    tr: basePath,
    en: withLocalePrefix(basePath, "en"),
    de: withLocalePrefix(basePath, "de"),
    "x-default": basePath,
  };

  return {
    canonical: languages[safeLocale],
    languages,
  };
}
