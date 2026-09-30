import Footer from "./Footer";

/* 🔄 CACHE KULLANIMI — `getPublicSettings()` doğrudan çağrılıyordu;
   `getCachedSettings` ZATEN bu fonksiyonun `unstable_cache`
   sarmalayıcısı (lib/cache.helpers.ts). Dönen veri/tip/null
   davranışı BİREBİR aynı; tag "settings", invalidation
   `revalidateSettings()` ile AYNEN çalışıyor. Header ile birlikte
   aynı request içindeki İKİ ayrı settings sorgusu ortadan kalkar.

   ⚠️ `menuRepository.findAllVillaLocations/Types` BİLİNÇLİ OLARAK
   DEĞİŞTİRİLMEDİ: `getCachedVillaLocations/Types` FARKLI bir sorgu
   çalıştırıyor (`findAllForTaxonomy` → ORDER BY name; `findAllBySortOrder`
   → ORDER BY sort_order). Buradaki çağrıların ORDER BY'ı YOK ve sonuç
   `.slice(0, 7)` ile kırpılıyor → swap footer'da GÖRÜNEN 7 bölge/tipi
   değiştirirdi. Davranış korunuyor. */
import { getCachedSettings } from "@/lib/cache.helpers";
import type { Settings } from "@/app/services/settings.types";
import { menuRepository } from "@/lib/db/menu.repository";
import { pagesRepository } from "@/lib/db/pages.repository";
/* 🛡️ PHASE 10H — villa tipi adlarının EN/DE karşılıkları (migration 082,
   `villa_type_translations`). Locale'den BAĞIMSIZ okunur; seçim client
   tarafta (`Footer.tsx`, `usePathname()` locale'i) yapılır — bu wrapper
   `headers()`/`cookies()` KULLANMAMAYA devam eder, yani layout'un
   statik/ISR uygunluğu DEĞİŞMEZ. */
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
/* 🛡️ CMS SAYFA BAŞLIKLARI — "Kurumsal" linklerinin adı `pages.title`'dan
   gelir; EN/DE karşılıkları migration 082'deki `page_translations.title`.
   Villa tipi çevirisiyle AYNI batch deseni (locale başına TEK `.in()`
   sorgusu, N+1 YOK) ve AYNI wrapper sözleşmesi: locale'den BAĞIMSIZ
   okunur, seçim `Footer.tsx` (client) içinde yapılır. */
import { getPageTitlesByLocale } from "@/lib/i18n/get-page-titles-by-locale.server";
import type { TaxonomyNameByLocale } from "@/lib/i18n/taxonomy-name.helper";

/* ---------------- DYNAMIC TAXONOMY ITEMS ---------------- */

export type TaxonomyItem = {
  id: string;
  name: string;
  slug: string | null;
  /** 🛡️ PHASE 10H — OPSİYONEL. Yalnız villa tipleri için doldurulur;
   *  bölgeler (locations) bu fazın kapsamı DIŞINDA, undefined kalır →
   *  `resolveTaxonomyName` canonical TR adına düşer (eski davranış). */
  nameByLocale?: TaxonomyNameByLocale;
  /** 🛡️ SEO landing — yalnız bölgelerde dolu (menuRepository
   *  `findAllVillaLocations` SELECT'i ZATEN getiriyor); grup kökü
   *  tespiti için okunur. Tip ekidir, veri akışı DEĞİŞMEDİ. */
  filter_group_name?: string | null;
};

/* ---------------- KURUMSAL — CMS-DRIVEN ----------------
   Veri kaynağı: `pagesRepository.findActivePages()` (slim).
   Header (`getMenu()`) ile AYRI kanal:
     • Header  : is_active=true VE show_in_menu=true (mevcut)
     • Footer  : is_active=true (show_in_menu YOK)
   Admin "Menüde Göster" sadece header navigation'ı kontrol eder.
   Yayında olan her sayfa otomatik footer Kurumsal'da görünür.
   Sıralama: menu_order ASC nulls-last, sonra created_at ASC.
---------------------------------------------------------- */
export type CorporatePage = {
  id: string;
  title: string;
  slug: string;
  menu_order?: number | null;
  created_at?: string | null;
  /** 🛡️ OPSİYONEL — `page_translations.title` (EN/DE). Yoksa/boşsa
   *  `resolveTaxonomyName` canonical TR `title`'a düşer (eski davranış).
   *  ⚠️ `slug` ÇEVRİLMEZ; link `/p/{slug}` AYNEN kalır. */
  nameByLocale?: TaxonomyNameByLocale;
};

/* ===================================================================
   🛡️ PHASE 9B — FOOTER SERVER DATA WRAPPER
   ===================================================================
   HeaderWrapper.tsx (async server) → Header.tsx (client) deseninin
   BİREBİR aynısı. Footer'ın DB/service veri-çekme mantığı (Phase 8'e
   kadar Footer.tsx içinde yaşıyordu) buraya, davranışı DEĞİŞTİRİLMEDEN
   taşındı: aynı Promise.allSettled sırası, aynı filtreleme/sıralama,
   aynı fallback'ler (bir fetch reject olursa diğerleri etkilenmez).

   Bu dosya `headers()`/`cookies()` KULLANMAZ — dolayısıyla bu wrapper'ın
   eklenmesi, `(public)/layout.tsx`'in statik/ISR rendering uygunluğunu
   HİÇ etkilemez (Phase 9 audit'inde doğrulanan risk, bu tasarımla
   tamamen ortadan kalkıyor). Locale tespiti artık `Footer.tsx` (client)
   içinde, Header'daki gibi `usePathname()` ile yapılıyor — bu wrapper
   locale'den tamamen bağımsız, saf veri katmanı.
=================================================================== */
export default async function FooterWrapper() {
  /* Dört paralel fetch — biri fail olursa diğeri etkilenmez.
     Promise.allSettled tüm sonuçları döner; reject olanlar null. */
  const [settingsRes, locsRes, typesRes, corpPagesRes] =
    await Promise.allSettled([
      getCachedSettings(),
      menuRepository.findAllVillaLocations(),
      menuRepository.findAllVillaTypes(),
      /* Footer'a özel slim helper — `findActivePages` (show_in_menu
         filtresi YOK). Header'ın `findActivePagesForMenu` helper'ı
         DOKUNULMADI; iki kanal birbirinden bağımsız. */
      pagesRepository.findActivePages(),
    ]);

  const settings: Settings | null =
    settingsRes.status === "fulfilled" ? settingsRes.value : null;

  const locations: TaxonomyItem[] =
    locsRes.status === "fulfilled" && Array.isArray(locsRes.value?.data)
      ? (locsRes.value.data as TaxonomyItem[])
          .filter((l) => l?.name)
          .slice(0, 7)
      : [];

  const villaTypesBase: TaxonomyItem[] =
    typesRes.status === "fulfilled" && Array.isArray(typesRes.value?.data)
      ? (typesRes.value.data as TaxonomyItem[])
          .filter((t) => t?.name)
          .slice(0, 7)
      : [];

  /* 🛡️ PHASE 10H — EN/DE villa tipi adları.
     `multilingual_enabled` kapalıyken /en ve /de route'ları zaten
     `requirePublicLocaleEnabled()` ile 404 döner → çeviri okumak
     GEREKSİZ bir sorgu olur, bu yüzden hiç çağrılmaz (ek maliyet YOK,
     TR davranışı BİREBİR aynı). Okuma fail olursa footer çökmez:
     harita boş kalır → canonical TR adı gösterilir. */
  const typeNamesByLocale: Record<string, TaxonomyNameByLocale> =
    isMultilingualEnabled(settings) && villaTypesBase.length > 0
      ? await getVillaTypeNamesByLocale(
          villaTypesBase.map((t) => t.id)
        ).catch(() => ({}))
      : {};

  const villaTypes: TaxonomyItem[] = villaTypesBase.map((t) =>
    typeNamesByLocale[t.id] ? { ...t, nameByLocale: typeNamesByLocale[t.id] } : t
  );

  /* Kurumsal CMS pages — filter + sort.
     Repo `is_active=true` filtreli; show_in_menu KASTEN filtrelenmez
     (footer header'dan ayrı kanal). slug + title sanity check.
     Sıralama: menu_order ASC nulls-last, sonra created_at ASC
     (deterministic tie-break). */
  const corporatePagesBase: CorporatePage[] =
    corpPagesRes.status === "fulfilled" &&
    Array.isArray(corpPagesRes.value?.data)
      ? (corpPagesRes.value.data as CorporatePage[])
          .filter(
            (p) =>
              typeof p?.slug === "string" &&
              p.slug.trim().length > 0 &&
              typeof p?.title === "string" &&
              p.title.trim().length > 0
          )
          .sort((a, b) => {
            const ao =
              typeof a.menu_order === "number"
                ? a.menu_order
                : Number.MAX_SAFE_INTEGER;
            const bo =
              typeof b.menu_order === "number"
                ? b.menu_order
                : Number.MAX_SAFE_INTEGER;
            if (ao !== bo) return ao - bo;
            const ac = a.created_at || "";
            const bc = b.created_at || "";
            return ac.localeCompare(bc);
          })
      : [];

  /* 🛡️ EN/DE CMS sayfa başlıkları — villa tipi bloğuyla (yukarısı) AYNI
     kural: `multilingual_enabled` kapalıyken hiç çağrılmaz (TR davranışı
     BİREBİR, ek sorgu YOK). Okuma fail olursa footer çökmez: harita boş
     kalır → canonical TR başlık gösterilir. Sıralama ve filtreleme
     YUKARIDA tamamlandı; burada YALNIZ `nameByLocale` eklenir. */
  const pageTitlesByLocale: Record<string, TaxonomyNameByLocale> =
    isMultilingualEnabled(settings) && corporatePagesBase.length > 0
      ? await getPageTitlesByLocale(
          corporatePagesBase.map((p) => p.id)
        ).catch(() => ({}))
      : {};

  const corporatePages: CorporatePage[] = corporatePagesBase.map((p) =>
    pageTitlesByLocale[p.id] ? { ...p, nameByLocale: pageTitlesByLocale[p.id] } : p
  );

  const year = new Date().getFullYear();
  const siteName = settings?.site_name || "Villa Kiralama";
  const phoneDigits = settings?.phone?.replace(/[^\d]/g, "") || "";

  return (
    <Footer
      settings={settings}
      locations={locations}
      villaTypes={villaTypes}
      corporatePages={corporatePages}
      year={year}
      siteName={siteName}
      phoneDigits={phoneDigits}
    />
  );
}
