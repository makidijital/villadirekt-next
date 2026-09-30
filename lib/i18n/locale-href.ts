/* ===============================================================
   🛡️ LOCALE HREF — PUBLIC INTERNAL LINK PREFIX'İ (TEK NOKTA)
   ===============================================================
   SORUN (navigation locale kaybı):
     Public tarafta locale'in TEK kaynağı URL'dir (`localeFromPathname`
     — lib/i18n/config.ts). Bu, sayfa RENDER'ı için doğru çalışıyordu;
     ancak iç linklerin bir kısmı canonical TR path'ini SABİT olarak
     yazıyordu (`href="/teklif-al"`, `href="/"`, menü satırlarının
     `/p/{slug}` · `/arama?...` href'leri …). `/en/...` üzerindeyken bu
     linklerden birine tıklayan kullanıcı prefix'siz bir TR route'una
     düşüyor → `localeFromPathname` "tr" döndürüyor → dil "kendiliğinden"
     TR'ye geri dönüyordu.

   ÇÖZÜM (yeni mimari YOK):
     Bu dosya YENİ bir i18n/routing sistemi DEĞİLDİR. Projenin ZATEN
     kullandığı `buildLocaleAlternates` (Phase 7B, lib/i18n/
     seo-alternates.ts) üzerine ince, SAF bir sarmalayıcıdır —
     `VillaCard` (Phase 10G), `AramaPageBody`, `KiralikVillalarPageBody`,
     `BottomNav` ve `sitemap.ts` bu helper'ı zaten aynı amaçla
     kullanıyordu; burada o desen TEK bir fonksiyonda merkezileştirilir
     ve linkleri sabit yazan yerlere uygulanır.

   ⚠️ COOKIE / localStorage KULLANILMAZ — BİLİNÇLİ:
     Locale'in tek ve öncelikli kaynağı URL olarak KALIR. İç linkler
     aktif locale'i taşıdığı sürece routing kendi kendini sürdürür;
     ikinci bir kalıcı locale kaynağı eklemek (a) URL ile çelişebilir,
     (b) SSR/hydration uyuşmazlığı riski taşır, (c) `headers()`/
     `cookies()` kullanımı Header/Footer'ın statik render'ını bozardı
     (bkz. HeaderWrapper üstyazısı), (d) canonical/hreflang SEO
     davranışını değiştirirdi. Bu dosya bu dört riskin HİÇBİRİNİ
     getirmez: saf, senkron, state'siz.

   DAVRANIŞ:
     localeHref("/teklif-al", "tr") → "/teklif-al"
     localeHref("/teklif-al", "en") → "/en/teklif-al"
     localeHref("/", "de")          → "/de"          (çifte slash yok)
     localeHref("/arama?x=1", "en") → "/en/arama?x=1" (query AYNEN)
     localeHref("/en/blog", "de")   → "/de/blog"      (idempotent)
     localeHref("https://…", "en")  → "https://…"     (dış bağlantı)
     localeHref("mailto:…", "en")   → "mailto:…"
     localeHref("#hero", "en")      → "#hero"
   =============================================================== */

import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

/** İç (site içi) bir path mi? Değilse href AYNEN korunur. */
function isInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/**
 * Bir iç public path'i aktif locale'e göre prefix'ler.
 *
 * - `locale === "tr"` → çıktı GİRDİYLE BİREBİR AYNI (TR canonical
 *   route'lar prefix'siz kalır; mevcut TR davranışı değişmez).
 * - Zaten prefix'li bir path verilirse önce prefix soyulur →
 *   idempotent (`buildLocaleAlternates` semantiği).
 * - Query (`?`) ve hash (`#`) OPAK taşınır: ayrıştırılmaz,
 *   decode/encode edilmez, sırası değişmez.
 * - Dış bağlantı (`http(s)://`, `//`, `mailto:`, `tel:`, `#…`),
 *   boş/geçersiz değer → AYNEN döner (asla throw etmez).
 */
export function localeHref(
  href: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE
): string {
  const raw = (href ?? "").toString();
  if (!raw || !isInternalPath(raw)) return raw;

  /* Path / (query + hash) ayrımı — prefix YALNIZ path'e uygulanır. */
  const cut = raw.search(/[?#]/);
  const pathOnly = cut === -1 ? raw : raw.slice(0, cut);
  const suffix = cut === -1 ? "" : raw.slice(cut);

  /* 🛡️ Yeni path mantığı İCAT EDİLMEDİ — mevcut Phase 7B helper'ı. */
  const prefixed = buildLocaleAlternates(pathOnly, locale).canonical;
  return `${prefixed}${suffix}`;
}
