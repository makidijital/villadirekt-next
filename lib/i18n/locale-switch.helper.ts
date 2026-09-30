/* ===============================================================
   🛡️ LOCALE SWITCH HELPER — PHASE 10C (TopBar dil değiştirici)
   ===============================================================
   AMAÇ: TopBar'daki dil değiştiricinin hedef URL'lerini üretmek.
   `buildLocaleAlternates()` (lib/i18n/seo-alternates.ts, Phase 7B)
   SAF bir path-şekillendirme fonksiyonu — hangi path'lerin GERÇEKTEN
   bir `/en`/`/de` route dosyasına sahip olduğunu BİLMİYOR/KONTROL
   ETMİYOR (bilinçli tasarım, kendi dosyasındaki yorumda açık).
   Bu dosya o eksik parçayı — "bu path'in bir locale route karşılığı
   var mı?" sorusunu — SAF ve MİNİMAL bir allowlist ile cevaplar.

   `buildLocaleAlternates` YENıDEN YAZILMADI/KOPYALANMADI — burada
   yalnız import edilip reuse edilir. `localeFromPathname` de burada
   KULLANILMAZ (bu dosyanın işi hedef tespiti değil, hedef URL
   üretimi — TopBar zaten kendi aktif locale'ini `localeFromPathname`
   ile ayrı tespit ediyor/edecek).

   ROUTE ALLOWLIST — yalnız BUGÜN gerçekten var olan `/en`/`/de` route
   dosyalarını yansıtır (bkz. `app/(public)/en|de/*`):
     - "/"                  → app/(public)/en|de/page.tsx (Phase 10C stub)
     - "/arama"             → app/(public)/en|de/arama/page.tsx (ComingSoon)
     - "/kiralik-villalar"  → app/(public)/en|de/kiralik-villalar/page.tsx (GERÇEK içerik)
     - "/iletisim"          → app/(public)/en|de/iletisim/page.tsx (GERÇEK içerik)
     - "/kiralik-villa/*"   → app/(public)/en|de/kiralik-villa/[slug]/page.tsx (Phase 10B, GERÇEK içerik)
     - "/rezervasyon/*"     → app/(public)/en|de/rezervasyon/[slug]/page.tsx (Phase 10B, GERÇEK içerik)
     - "/p/*"               → app/(public)/en|de/p/[slug]/page.tsx (Phase 12D, GERÇEK içerik)
     - "/villa-turleri/*", "/bolgeler/*" → app/(public)/en|de/…/[slug]/page.tsx (SEO landing)
   Yeni bir `/en`/`/de` route eklendiğinde bu liste GÜNCELLENMELİ —
   aksi halde o route için dil değiştirici (bilinçli, güvenli tarafta
   kalarak) ana sayfaya fallback yapar; bu 404/broken-link ÜRETMEZ,
   yalnız o yeni sayfanın locale karşılığını henüz "bilmiyor" olur.

   FALLBACK STRATEJİSİ (kullanıcı onayı: "Hedef locale'in ana sayfasına
   yönlendir"): allowlist'te olmayan bir base path için hedef locale'in
   KÖK sayfası döner (`/`, `/en`, `/de`) — asla 404/broken URL.
   =============================================================== */

import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import type { Locale } from "@/lib/i18n/config";

/** Tam segment eşleşmesi gereken (alt-sayfası olmayan) route'lar. */
const EXACT_LOCALE_ROUTED_PATHS: readonly string[] = [
  "/",
  "/arama",
  "/kiralik-villalar",
  /* 🛡️ app/(public)/en|de/iletisim/page.tsx (GERÇEK içerik, ortak
     `ContactPageBody`). Dosya başındaki bakım kuralı: "Yeni bir
     /en//de route eklendiğinde bu liste GÜNCELLENMELİ". */
  "/iletisim",
  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — aşağıdaki üç sayfanın da artık
     GERÇEK `/en` ve `/de` route dosyası var (ortak gövde + locale prop). */
  "/teklif-al",
  "/rezervasyon-kontrol",
  "/favoriler",
  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — `/en|de/blog` GERÇEK route dosyası
     var (ortak `BlogIndexPageBody` + `blog_post_translations`). */
  "/blog",
];

/** Dinamik segment taşıyan (ör. `[slug]`) route'ların base prefix'leri.
 *  Yalnız prefix'ten SONRA en az bir karakter (gerçek bir slug) varsa
 *  eşleşir — bare `/kiralik-villa/` (slug'sız) route olarak SAYILMAZ. */
const PREFIXED_LOCALE_ROUTED_PATHS: readonly string[] = [
  "/kiralik-villa/",
  "/rezervasyon/",
  /* 🛡️ PHASE 12D — app/(public)/en|de/p/[slug]/page.tsx (GERÇEK içerik,
     `page_translations` okur). Bu dosyanın üstyazısındaki bakım kuralı:
     "Yeni bir /en//de route eklendiğinde bu liste GÜNCELLENMELİ". */
  "/p/",
  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — dinamik segmentler (token / ay /
     gece) AYNEN korunur; yalnız locale prefix'i değişir. */
  "/favoriler/paylas/",
  "/kisa-sureli-tarihler/",
  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — blog detayı ve token sayfaları da
     artık GERÇEK `/en` ve `/de` route dosyalarına sahip. Dinamik
     segment (slug / token) AYNEN korunur; yalnız locale prefix'i
     değişir. `/v/` ve `/liste/` noindex'tir ama kullanıcı linke EN/DE
     ile de ulaşabildiği için dil değiştirici çalışmalıdır. */
  "/blog/",
  "/liste/",
  "/v/",
  /* 🛡️ SEO LANDING — app/(public)/en|de/villa-turleri/[slug] ve
     app/(public)/en|de/bolgeler/[slug] GERÇEK route dosyaları var
     (ortak `TaxonomyLandingPageBody`). Slug locale'den bağımsızdır:
     sayfanın kendi hreflang'i de `buildLocaleAlternates(trPath)` ile
     AYNI slug + locale prefix'i üretir. Bu satırlar eksikken dil
     değiştirici bu sayfalarda ana sayfaya düşüyordu. */
  "/villa-turleri/",
  "/bolgeler/",
];

/**
 * Verilen (prefix'siz, TR-eşdeğeri) base path için gerçekten bir
 * `/en`/`/de` route dosyası var mı? Saf, senkron, allowlist-tabanlı.
 */
export function hasLocaleRoute(basePath: string): boolean {
  if (EXACT_LOCALE_ROUTED_PATHS.includes(basePath)) {
    return true;
  }
  return PREFIXED_LOCALE_ROUTED_PATHS.some(
    (prefix) => basePath.startsWith(prefix) && basePath.length > prefix.length
  );
}

/* 🛡️ QUERY STRING KORUMA — `/arama` dil değiştirme düzeltmesi.
   SORUN: `/de/arama?villa-turleri=...&flexible=3` üzerindeyken EN'e
   geçilince `/en/arama` üretiliyor, mevcut filtre query'si KAYBOLUYORDU
   (`usePathname()` query taşımaz; helper da yalnız pathname alıyordu).
   ÇÖZÜM (minimal): opsiyonel `search` parametresi. Query string OPAK
   bir string olarak taşınır — parametre adları/değerleri/sırası/URL
   encoding'i AYNEN korunur, hiçbir değer locale'e göre çevrilmez
   (`villa-turleri` değerleri canonical slug/token olarak kalır).
   Allowlist kontrolü HÂLÂ yalnız PATH üzerinde yapılır — query,
   `hasLocaleRoute` kararını ETKİLEMEZ. */

/** `"?a=1"` / `"a=1"` / `""` / null → `"?a=1"` veya `""`. Girdi
 *  AYNEN taşınır; decode/re-encode/normalize YAPILMAZ. */
function normalizeSearchSuffix(search: string | null | undefined): string {
  if (!search) return "";
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return raw.length > 0 ? `?${raw}` : "";
}

/**
 * Mevcut pathname için her locale'in hedef URL'ini üretir — TopBar'ın
 * dil değiştirici linkleri için. `buildLocaleAlternates` (Phase 7B)
 * ile TR-eşdeğeri base path'i türetir; bu base path'in gerçek bir
 * locale route'u varsa (`hasLocaleRoute`) o route'un 3 locale
 * varyantını, YOKSA (fallback) her locale'in kök sayfasını döner
 * (`/`, `/en`, `/de`) — ASLA 404/broken URL üretmez.
 *
 * `search` (opsiyonel): mevcut query string (`?a=1` veya `a=1`).
 * Verilirse — ve yalnız gerçek bir locale route'u olan path'lerde —
 * üretilen 3 hedefin SONUNA aynen eklenir. Fallback (locale karşılığı
 * olmayan path) durumunda query EKLENMEZ: hedef, o sayfanın değil
 * locale KÖKÜ olduğu için oraya taşınan filtre parametreleri anlamsız
 * olurdu — mevcut fallback davranışı BİREBİR korunur.
 */
export function getLocaleSwitchTargets(
  pathname: string | null | undefined,
  search?: string | null,
  trHomePath?: string | null
): Record<Locale, string> {
  /* `usePathname()` normalde query taşımaz; yine de savunmacı olarak
     path ile query ayrıştırılır (ör. testler/çağıranlar tam URL
     verirse allowlist eşleşmesi bozulmasın). */
  const rawPath = pathname || "/";
  const queryIndex = rawPath.indexOf("?");
  const pathOnly = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex);
  const inlineSearch =
    queryIndex === -1 ? "" : rawPath.slice(queryIndex + 1);

  /* Açıkça verilen `search` önceliklidir (`??` — boş string DE bilinçli
     bir "query yok" bildirimidir, inline'a düşmez). */
  const suffix = normalizeSearchSuffix(search ?? inlineSearch);

  const { languages } = buildLocaleAlternates(pathOnly || "/", "tr");
  const basePath = languages.tr;

  /* 🔄 ANA SAYFAYA ÖZEL TR HEDEFİ
     ------------------------------------------------------------
     Varsayılan dil EN/DE iken `/` bir YÖNLENDİRİCİDİR ve TR ana
     sayfa `/tr`'de yaşar. O modda dil değiştiriciden "TR" seçmek
     `/`'ye gitseydi kullanıcı ANINDA varsayılan dile geri
     düşerdi (döngü hissi). Bu yüzden — ve YALNIZ ana sayfada
     (`basePath === "/"`) — TR hedefi çağıran tarafından
     `trHomePath` ile "/tr" olarak verilebilir.

     `trHomePath` verilmezse veya "/" ise davranış BYTE-IDENTICAL.
     İç sayfalar (`/kiralik-villalar`, `/arama`, …) HİÇ etkilenmez:
     onların TR hedefi prefix'siz path olmaya devam eder. */
  const trHome =
    basePath === "/" && trHomePath ? trHomePath : languages.tr;

  if (hasLocaleRoute(basePath)) {
    return {
      tr: `${trHome}${suffix}`,
      en: `${languages.en}${suffix}`,
      de: `${languages.de}${suffix}`,
    };
  }

  /* Fallback (locale karşılığı olmayan path) — her locale'in KÖKÜ.
     ⚠️ Burada `trHome` KULLANILMAZ: bu dalda `basePath` "/" değildir,
     dolayısıyla `trHome` o sayfanın kendi path'idir. TR KÖKÜ MOD B'de
     "/tr", aksi halde "/" olmalıdır. */
  return { tr: trHomePath || "/", en: "/en", de: "/de" };
}
