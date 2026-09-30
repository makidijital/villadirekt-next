import type { Settings } from "@/app/services/settings.types";
import { resolveAssetUrl } from "@/lib/storage.helpers";
/* 🛡️ PHASE 11 — Hero locale-aware. Metin defaultları artık dictionary'den
   gelir (TR değerleri `HERO_DEFAULTS`/`HERO_CTA_DEFAULTS` ile BİREBİR aynı
   → TR çıktısı DEĞİŞMEZ). Admin'in girdiği içeriğin EN/DE karşılığı
   `settings_translations` (migration 085) üzerinden çözülür. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { resolveSettingsText } from "@/lib/i18n/settings-translation.helper";
import type { SettingsTranslationsByLocale } from "@/lib/i18n/settings-translations.types";

/* ===============================================================
   🛡️ HOMEPAGE HERO — RESOLVER + DEFAULTS
   ===============================================================
   Hero.tsx ve admin Settings ekranı bu helper'ı tek source-of-truth
   olarak kullanır. Hiçbir setting alanı kırılgan değil; her biri
   eksikse hardcoded default'a fallback eder. Hero hiçbir durumda
   kırılmaz.

   `hero_enabled === false` özel durumu: admin'in "varsayılan görünüme
   dön" anahtarı. Tek satırda tüm custom alanlar bypass edilir,
   defaults render olur. Saved data DB'de korunur (tekrar açınca
   geri gelir) — destructive değil.

   SSR-FIRST: bu fonksiyon pure; server'da `getSettings()` sonucu
   bir kez çağrılır, prop olarak Hero'ya geçer. Client tarafında
   hydration sırasında aynı obje JSON olarak rebuild edilir →
   hydration mismatch yok.
   =============================================================== */

/** Hardcoded defaults — Hero.tsx'in mevcut hardcoded değerleriyle
    BİREBİR aynı. Migration / settings boş tabloda olsa bile homepage
    önceki versiyonla görsel olarak özdeş kalır. */
export const HERO_DEFAULTS = {
  badge: "Akdeniz Collection",
  /* Title için \n ile iki satır: birinci satır beyaz, sonraki
     satırlar text-white/85 (mevcut "Sessizce / olağanüstü." görselinin
     parity'si). */
  title: "Sessizce\nolağanüstü.",
  subtitle:
    "Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor. Her detay, bir konaklamadan fazlasını sunmak için tasarlandı.",
  backgroundImage:
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=2400&auto=format&fit=crop",
  /* 1.0 = mevcut full overlay; daha düşük = arka plan daha açık.
     Hero.tsx içindeki iki gradient bu çarpan ile zayıflatılır. */
  overlayOpacity: 1,
} as const;

/** 🔗 HERO CTA DEFAULTS — TEK SOURCE OF TRUTH.
    Admin'de CTA alanları boş/null iken hem Hero frontend fallback'i
    HEM admin form placeholder'ı bu değerleri kullanır (birebir aynı).
    Buradaki tek değişiklik her iki tarafı da senkron günceller. */
export const HERO_CTA_DEFAULTS = {
  primary: { text: "Kısa Süreli Fırsatlar", href: "#kisa-sureli-firsatlar" },
  secondary: { text: "Sıkça Sorulan Sorular", href: "#sss" },
} as const;

/** Frontend Hero'nun beklediği şekil — resolveHeroContent çıktısı. */
export type HeroContent = {
  enabled: boolean;
  badge: string;
  title: string; // \n ile çok-satırlı olabilir
  subtitle: string;
  backgroundImage: string;
  /** 0..1 arası; 1 = full overlay (default), 0 = overlay yok. */
  overlayOpacity: number;
  /** İsteğe bağlı CTA'lar; ikisi de doluysa render edilir. */
  primaryCta: { text: string; href: string } | null;
  secondaryCta: { text: string; href: string } | null;
};

function clamp01(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * 🛡️ Admin bilinçli boş bırakma — badge/title/subtitle için fallback
 * ALMAYAN string picker. Kullanım: yalnız `resolveHeroContent`'in
 * NORMAL (hero_enabled !== false) dalında. Amaç: admin alanı gerçekten
 * boşsa (`""`, yalnızca whitespace, `null`/`undefined`) public Hero'da
 * o içerik HİÇ render edilmesin — hardcoded metin defaultlarına
 * (`HERO_DEFAULTS.badge/title/subtitle`) düşülmesin.
 *
 * `hero_enabled === false` (veya settings hiç yoksa) "safety reset"
 * dalı bu fonksiyonu KULLANMAZ — o dal aynen `HERO_DEFAULTS.*` ile
 * dolu döner (aşağıda değişmedi); yalnızca admin'in kaydettiği GERÇEK
 * içerik boşsa public'te boş kalır. (Önceki `pickStr(v, fallback)`
 * yardımcı fonksiyonu artık hiçbir yerde çağrılmadığı için kaldırıldı
 * — dead code bırakılmadı.)
 */
function pickStrOrEmpty(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > 0 ? v : "";
}

function pickCta(
  text: unknown,
  href: unknown
): { text: string; href: string } | null {
  if (typeof text !== "string" || typeof href !== "string") return null;
  const t = text.trim();
  const h = href.trim();
  if (!t || !h) return null;
  return { text: t, href: h };
}

/**
 * Append a cache-busting `?ts=` query param to a URL.
 * Only used for ADMIN-UPLOADED hero images (which sit at a fixed
 * eski sağlayıcı storage path: `hero/homepage-hero.webp`). DB stores
 * the clean URL; this helper produces the render-time URL.
 *
 * Default fallback (Unsplash) URL is NOT busted — already
 * versioned by the third-party CDN.
 */
function withCacheBust(url: string, cacheKey: string | number): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}ts=${cacheKey}`;
}

/**
 * `settings` null olabilir (tablo boş, fetch error). Bu durumda
 * tamamen defaults dönülür → Hero kırılmaz.
 *
 * `hero_enabled === false`: defaults ZORLAR. Diğer hero_* alanları
 * yok sayılır. (Saved data DB'de korunur; reset toggle gibi davranır.)
 *
 * `options.cacheKey`: opsiyonel; verilirse VE admin'in upload ettiği
 * custom bir image varsa, render URL'ine `?ts=<cacheKey>` eklenir.
 * Default Unsplash fallback URL'ine eklenmez. Server tarafında
 * çağırılarak (örn. /page.tsx içinde Date.now()) hydration-safe.
 */
export function resolveHeroContent(
  settings: Settings | null | undefined,
  options?: {
    cacheKey?: string | number;
    /** 🛡️ PHASE 11 — verilmezse `"tr"`; TR davranışı BİREBİR eskisi gibi. */
    locale?: Locale;
    /** migration 085 EN/DE hero çevirileri (`getPublicSettings()` payload'ı). */
    translations?: SettingsTranslationsByLocale | null;
  }
): HeroContent {
  const locale: Locale = options?.locale ?? DEFAULT_LOCALE;
  const translations = options?.translations ?? null;
  /* Metin defaultları — TR'de `HERO_DEFAULTS`/`HERO_CTA_DEFAULTS` ile
     BİREBİR aynı değerler (bkz. lib/i18n/dictionaries/tr.ts > home.hero). */
  const d = getDictionary(locale).home.hero;

  if (!settings || settings.hero_enabled === false) {
    return {
      enabled: settings ? settings.hero_enabled !== false : true,
      badge: d.badge,
      title: d.title,
      subtitle: d.subtitle,
      backgroundImage: HERO_DEFAULTS.backgroundImage,
      overlayOpacity: HERO_DEFAULTS.overlayOpacity,
      primaryCta: null,
      secondaryCta: null,
    };
  }

  /* Image resolution + cache-busting:
       - Admin custom upload varsa → temiz URL + ?ts=<cacheKey>
       - Custom upload yoksa → default Unsplash URL (cache-bust YOK)
     🛡️ Aşama A — `resolveAssetUrl` normalize: settings.hero_background_image
        HEM FULL URL (legacy) HEM relative path (yeni) olabilir. HTTP(S)
        prefix'li değerler pass-through; relative path'ler runtime'da
        getPublicUrl ile URL'e çevrilir. Mevcut DB içeriği için byte-
        identical davranış (FULL URL ise aynen geri döner). */
  const customImage = resolveAssetUrl(settings.hero_background_image) ?? "";
  const hasCustomImage = customImage.length > 0;
  const baseImage = hasCustomImage ? customImage : HERO_DEFAULTS.backgroundImage;
  const backgroundImage =
    hasCustomImage && options?.cacheKey !== undefined
      ? withCacheBust(baseImage, options.cacheKey)
      : baseImage;

  return {
    enabled: true,
    /* 🛡️ Admin bilinçli boşaltmışsa ("") → public'te render edilmesin
       diye HİÇBİR fallback yok (pickStrOrEmpty). Hero.tsx bu alanları
       artık `hero.badge && (...)` / `hero.title && (...)` ile koşullu
       render ediyor. `hero_enabled === false` (yukarıdaki early-return)
       davranışı BU SATIRLARDAN etkilenmez, aynen HERO_DEFAULTS.* döner. */
    /* 🛡️ PHASE 11 — locale çözümü: EN/DE çevirisi varsa o, yoksa TR
       canonical. `locale === "tr"` dalında `resolveSettingsText`
       canonical değeri AYNEN (referans olarak) döndürür → aşağıdaki
       `pickStrOrEmpty` zinciri ESKİSİYLE BİT-BİRE AYNI çalışır. */
    badge: pickStrOrEmpty(
      resolveSettingsText(
        settings.hero_badge_text,
        translations,
        locale,
        "hero_badge_text"
      )
    ),
    title: pickStrOrEmpty(
      resolveSettingsText(settings.hero_title, translations, locale, "hero_title")
    ),
    subtitle: pickStrOrEmpty(
      resolveSettingsText(
        settings.hero_subtitle,
        translations,
        locale,
        "hero_subtitle"
      )
    ),
    backgroundImage,
    overlayOpacity: clamp01(
      settings.hero_overlay_opacity,
      HERO_DEFAULTS.overlayOpacity
    ),
    /* ⚠️ CTA HREF'LERİ DİL BAĞIMSIZ — yalnız METİN çevrilir. */
    primaryCta: pickCta(
      resolveSettingsText(
        settings.hero_primary_cta_text,
        translations,
        locale,
        "hero_primary_cta_text"
      ),
      settings.hero_primary_cta_href
    ),
    secondaryCta: pickCta(
      resolveSettingsText(
        settings.hero_secondary_cta_text,
        translations,
        locale,
        "hero_secondary_cta_text"
      ),
      settings.hero_secondary_cta_href
    ),
  };
}
