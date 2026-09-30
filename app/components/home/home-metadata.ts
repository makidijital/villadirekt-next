import "server-only";

import type { Metadata } from "next";

import { getCachedSettings } from "@/lib/cache.helpers";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { resolvePublicHome } from "@/lib/i18n/public-home";
import { resolveSettingsText } from "@/lib/i18n/settings-translation.helper";

/* ===============================================================
   🛡️ PHASE 11 — ANA SAYFA METADATA (TR / EN / DE ORTAK)
   ===============================================================
   TR sayfası daha önce YALNIZ statik `metadata = { alternates:
   { canonical: "/" } }` export ediyordu; title/description root
   layout'tan miras kalıyordu. Artık üç locale de kendi
   `generateMetadata`'sını bu TEK helper üzerinden üretir.

   NEDEN SAYFA SEVİYESİ (root layout DEĞİL):
     `app/layout.tsx > generateMetadata` request locale'ini GÜVENLE
     OKUYAMAZ (Phase 7E; regresyon kilidi tests/unit/html-lang-layout.
     test.ts). Ana sayfada bu engel YOKTUR — `/en/page.tsx` locale'i
     YAPI GEREĞİ bilir. Root layout'a DOKUNULMADI; `<html lang="tr">`
     mimari kararı DEĞİŞMEDİ.

   ÜRETİLEN:
     • canonical  : "/" | "/en" | "/de"
     • languages  : tr/en/de/x-default (buildLocaleAlternates, Phase 7B)
     • title/desc : settings.default_meta_* → settings_translations
                    (Phase 10L) → yoksa TR canonical
     • openGraph/twitter: aynı başlık/açıklama (root'un OG görseli
       miras kalır — görsel DİL BAĞIMSIZ).

   ⚠️ `robots` BURADA SET EDİLMEZ — root layout'un
   `settings.robots_index/robots_follow` politikası miras alınır.
   (EN/DE placeholder'larındaki koşulsuz `noindex` Phase 11'de
   KALDIRILDI; ana sayfalar artık gerçek içerik.)
   =============================================================== */

/** TR fallback'leri — `app/layout.tsx`'teki değerlerle BİREBİR AYNI. */
const TR_FALLBACK_TITLE = "Villa Kiralama — Lüks Villa Deneyimi";
const TR_FALLBACK_DESCRIPTION =
  "Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor. Hayalindeki tatili keşfet.";

export async function buildHomeMetadata(
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const settings = await getCachedSettings().catch(() => null);
  const translations = settings?.translations ?? null;

  const title =
    resolveSettingsText(
      settings?.default_meta_title,
      translations,
      locale,
      "default_meta_title"
    )?.trim() || TR_FALLBACK_TITLE;

  const description =
    resolveSettingsText(
      settings?.default_meta_description,
      translations,
      locale,
      "default_meta_description"
    )?.trim() || TR_FALLBACK_DESCRIPTION;

  const { canonical, languages } = buildLocaleAlternates("/", locale);

  /* 🔄 ANA SAYFAYA ÖZEL hreflang/canonical DÜZELTMESİ
     ------------------------------------------------------------
     `buildLocaleAlternates` SAF ve settings'ten habersizdir
     (`localeHref` de onu kullanır) — bu yüzden DEĞİŞTİRİLMEDİ.
     Ana sayfaya özel tek istisna BURADA, yalnız bu helper'da
     uygulanır:

       MOD A (varsayılan "tr" veya multilingual kapalı)
         → hiçbir şey değişmez; çıktı BYTE-IDENTICAL.
       MOD B (varsayılan "en"/"de")
         → `/` bir yönlendiricidir; TR ana sayfa `/tr`'de yaşar.
           `hreflang="tr"` ve TR canonical `/tr`'yi gösterir,
           `x-default` ise varsayılan dilin ana sayfasını gösterir.
           Böylece hiçbir hreflang hedefi redirect'e düşmez.

     Ek DB/cache okuması YOK — `settings` yukarıda ZATEN okundu. */
  const home = resolvePublicHome(settings);
  const homeLanguages = home.redirectsFromRoot
    ? {
        ...languages,
        tr: home.trHomeHref,
        "x-default": languages[home.defaultLocale],
      }
    : languages;
  const homeCanonical = home.redirectsFromRoot
    ? homeLanguages[locale]
    : canonical;

  return {
    title,
    description,
    alternates: { canonical: homeCanonical, languages: homeLanguages },
    openGraph: { title, description },
    twitter: { title, description },
  };
}
