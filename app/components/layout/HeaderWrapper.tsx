import Header from "./Header";
/* 🔄 CACHE KULLANIMI — `getMenu()` / `getPublicSettings()` DOĞRUDAN
   çağrılıyordu; oysa `lib/cache.helpers.ts` bu iki okuma için ZATEN
   `unstable_cache` sarmalayıcıları barındırıyordu ve kimse
   kullanmıyordu. Header HER public sayfada render olduğu için bu,
   istek başına 5 gereksiz DB sorgusu demekti (settings 1 + getMenu
   içinde 4 paralel sorgu).

   Sarmalayıcılar BİREBİR aynı fonksiyonu çağırıyor:
     getCachedSettings = unstable_cache(() => getPublicSettings())
     getCachedMenu     = unstable_cache(() => getMenu())
   → dönen veri, tip, null/hata davranışı DEĞİŞMEZ. Yeni cache
   mekanizması KURULMADI; tag'ler ("settings" / "menu") ve
   revalidateSettings()/revalidateMenu() invalidation yolu AYNEN. */
import { getCachedMenu, getCachedSettings } from "@/lib/cache.helpers";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";
/* 🛡️ PHASE 10H — `source_type: "category"` menü öğeleri villa tipi
   adını gösterir; EN/DE karşılıkları migration 082'deki
   `villa_type_translations`'tan okunur. Locale'den BAĞIMSIZ okunur,
   seçim client tarafta (`Header.tsx`, `usePathname()` locale'i) yapılır
   — bu wrapper `headers()`/`cookies()` KULLANMAMAYA devam eder.
   `getMenu()` / `lib/menu-resolver.ts` DEĞİŞTİRİLMEDİ: çeviri burada,
   çözülmüş ağaca `source_id` üzerinden eklenir. */
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { resolvePublicHome } from "@/lib/i18n/public-home";
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
/* 🛡️ MIGRATION 086 — dinamik menü etiketlerinin EN/DE karşılıkları
   (`menu_translations`). Villa tipi çevirisiyle AYNI batch deseni:
   locale başına TEK `.in()` sorgusu, N+1 YOK. */
import { getMenuNamesByLocale } from "@/lib/i18n/get-menu-translations.server";
/* 🛡️ CMS SAYFA MENÜ ÖĞELERİ — `source_type: "page"` düğümlerin adı
   `pages.title`'dan gelir; EN/DE karşılıkları migration 082'deki
   `page_translations.title`'dan okunur. Villa tipi / manuel menü ile
   AYNI batch deseni: locale başına TEK `.in()` sorgusu, N+1 YOK. */
import { getPageTitlesByLocale } from "@/lib/i18n/get-page-titles-by-locale.server";
import type { TaxonomyNameByLocale } from "@/lib/i18n/taxonomy-name.helper";

/** `getMenu()` ağacının bu dosyada ihtiyaç duyulan minimum şekli. */
type MenuNodeLike = {
  /** 🛡️ MIGRATION 086 — `menu_translations` lookup anahtarı. */
  id?: string;
  source_type?: string;
  source_id?: string | null;
  children?: MenuNodeLike[];
  nameByLocale?: TaxonomyNameByLocale;
};

/** Ağaçtaki tüm `category` öğelerinin `source_id`'lerini toplar. */
function collectCategoryIds(nodes: MenuNodeLike[], out: string[]): void {
  for (const n of nodes) {
    if (n?.source_type === "category" && typeof n.source_id === "string") {
      out.push(n.source_id);
    }
    if (Array.isArray(n?.children) && n.children.length > 0) {
      collectCategoryIds(n.children, out);
    }
  }
}

/* 🛡️ MIGRATION 086 — YALNIZ `source_type === "manual"` satırların
   `menu.id`'leri. KAPSAM DARALTMASI (kullanıcı kararı):
     • manual   → adı `menu.name`; başka bir çeviri kaynağı YOK →
                  `menu_translations` BU satırlar için vardır.
     • page / page-auto → adı `pages.title`; çevirisi ZATEN
                  `page_translations` (Pages sistemi).
     • category → adı `villa_types.name`; çevirisi ZATEN
                  `villa_type_translations` (Phase 10H).
     • region   → adı `villa_locations.name`; Phase 10I gereği
                  ÇEVRİLMEZ (özel isim, canonical).
   Bu yüzden manual dışındaki hiçbir düğümün id'si `menu_translations`
   sorgusuna GİRMEZ — o kaynakların davranışı BİREBİR korunur. */
function collectManualMenuIds(nodes: MenuNodeLike[], out: string[]): void {
  for (const n of nodes) {
    if (n?.source_type === "manual" && typeof n.id === "string" && n.id) {
      out.push(n.id);
    }
    if (Array.isArray(n?.children) && n.children.length > 0) {
      collectManualMenuIds(n.children, out);
    }
  }
}

/* 🛡️ Ağaçtaki tüm `page` öğelerinin `source_id`'leri (= `pages.id`).
   ⚠️ ADMİN'DEKİ `page-auto` AYRIMI PUBLIC AĞAÇTA YOKTUR: hem admin'in
   menüye ELLE bağladığı CMS sayfaları (`resolveMenuRow`, menu-resolver
   .ts) hem de `show_in_menu=true` ile OTOMATİK dahil edilenler
   (`menu.service.ts`) ağaca `source_type: "page"` + `source_id =
   pages.id` olarak iner. `"page-auto"` yalnız `/maki-admin/menu`
   listesinin kendi UI `kind` değeridir. Bu yüzden TEK bir toplayıcı
   İKİSİNİ DE kapsar — ayrı kod yolu GEREKMEZ. */
function collectPageIds(nodes: MenuNodeLike[], out: string[]): void {
  for (const n of nodes) {
    if (n?.source_type === "page" && typeof n.source_id === "string") {
      out.push(n.source_id);
    }
    if (Array.isArray(n?.children) && n.children.length > 0) {
      collectPageIds(n.children, out);
    }
  }
}

/** Çeviri haritalarını ağaca uygular (yeni node'lar döner, mutasyon YOK).
 *
 *  🛡️ KAYNAK BAŞINA TEK ÇEVİRİ YOLU — source_type'a göre AYRIŞIR,
 *  iki kaynak ASLA aynı düğümde yarışmaz (öncelik/merge kuralı YOK):
 *    • `category` → `typeNamesById[source_id]` (Phase 10H,
 *      `villa_type_translations`) — MEVCUT DAVRANIŞ BİREBİR.
 *    • `manual`   → `menuNamesById[node.id]` (migration 086,
 *      `menu_translations`).
 *    • `page`     → `pageNamesById[source_id]` (`page_translations`
 *      .title; explicit + auto-include AYNI yoldan geçer).
 *    • `region`   → BURADA DOKUNULMAZ; Phase 10I: özel isim, canonical.
 *  Eşleşme yoksa `nameByLocale` undefined kalır → canonical TR `name`
 *  (`resolveTaxonomyName` fallback'i). */
function attachTypeNames<T extends MenuNodeLike>(
  nodes: T[],
  namesById: Record<string, TaxonomyNameByLocale>,
  menuNamesById: Record<string, TaxonomyNameByLocale> = {},
  pageNamesById: Record<string, TaxonomyNameByLocale> = {}
): T[] {
  return nodes.map((n) => {
    const children = Array.isArray(n?.children)
      ? attachTypeNames(n.children, namesById, menuNamesById, pageNamesById)
      : n?.children;

    let nameByLocale: TaxonomyNameByLocale | undefined;
    if (n?.source_type === "category" && typeof n.source_id === "string") {
      nameByLocale = namesById[n.source_id];
    } else if (n?.source_type === "manual" && typeof n.id === "string") {
      nameByLocale = menuNamesById[n.id];
    } else if (n?.source_type === "page" && typeof n.source_id === "string") {
      nameByLocale = pageNamesById[n.source_id];
    }

    if (!nameByLocale && children === n?.children) return n;
    return {
      ...n,
      ...(children === n?.children ? {} : { children }),
      ...(nameByLocale ? { nameByLocale } : {}),
    };
  });
}

export default async function HeaderWrapper() {
  /* ===============================================================
     🔥 SITE LOGO
     ===============================================================
     settings.site_logo varsa header'a aktarılır.
     Boş ise Header default text wordmark fallback gösterir.
     🛡️ Aşama A — resolveAssetUrl: FULL URL (legacy) pass-through;
        relative path (yeni) runtime'da getPublicUrl ile URL'e çevrilir.
     =============================================================== */
  let siteLogo: string | null = null;
  /* 🛡️ PHASE 10H — `multilingual_enabled` kapalıyken /en ve /de zaten
     404 (requirePublicLocaleEnabled) → çeviri okumak GEREKSİZ sorgu
     olur; bu bayrak o durumda okumayı tamamen atlatır. */
  let multilingualEnabled = false;
  /* 🔄 TR ana sayfa yolu — varsayılan dil EN/DE iken "/" bir
     YÖNLENDİRİCİDİR ve TR ana sayfa "/tr"'de yaşar; logo linki oraya
     bakmalı ki TR kullanıcı varsayılan dile geri düşmesin. Okuma
     ZATEN yapılan `getPublicSettings()` üzerinden — EK FETCH YOK.
     Hata/kapalı/`tr` durumunda "/" kalır (BYTE-IDENTICAL). */
  let trHomeHref = "/";
  try {
    const settings = await getCachedSettings();
    siteLogo =
      resolveAssetUrlVersioned(settings?.site_logo, settings?.updated_at) ||
      null;
    multilingualEnabled = isMultilingualEnabled(settings);
    trHomeHref = resolvePublicHome(settings).trHomeHref;
  } catch {
    siteLogo = null;
  }

  /* 🔥 güvenlik: menu okunamazsa boş array (ÖNCEKİ fallback davranışı).
     ⚠️ JSX try/catch DIŞINDA kurulur: React JSX'i anında render etmediği
     için try/catch render hatalarını ZATEN yakalamaz (bkz.
     react-hooks/error-boundaries). Veri hazırlığı try/catch içinde,
     tek `return` dışarıda — davranış BİREBİR aynı, lint uyarısı yok. */
  /* Tip `getCachedMenu`'den türetilir — sarmalayıcı `getMenu()`'yü
     aynen döndürdüğü için çıkarılan tip DEĞİŞMEZ. */
  let menuItems: Awaited<ReturnType<typeof getCachedMenu>> = [];
  try {
    menuItems = (await getCachedMenu()) || [];

    /* 🛡️ PHASE 10H — villa tipi adlarının EN/DE karşılıkları. Okuma fail
       olursa header ÇÖKMEZ: harita boş kalır → canonical TR adı gösterilir
       (mevcut davranış). */
    if (multilingualEnabled && menuItems.length > 0) {
      const categoryIds: string[] = [];
      collectCategoryIds(menuItems as MenuNodeLike[], categoryIds);
      /* 🛡️ MIGRATION 086 — YALNIZ manual menü satırlarının id'leri. */
      const manualIds: string[] = [];
      collectManualMenuIds(menuItems as MenuNodeLike[], manualIds);
      /* 🛡️ CMS sayfa öğelerinin `pages.id`'leri (explicit + auto). */
      const pageIds: string[] = [];
      collectPageIds(menuItems as MenuNodeLike[], pageIds);

      /* ÜÇ batch okuma PARALEL; her biri locale başına TEK `.in()`
         sorgusu (N+1 YOK). Boş id listesinde sorgu HİÇ atılmaz.
         Okuma fail olursa header ÇÖKMEZ: harita boş kalır → canonical
         TR adı gösterilir (mevcut davranış). */
      const [namesById, menuNamesById, pageNamesById] = await Promise.all([
        categoryIds.length > 0
          ? getVillaTypeNamesByLocale(categoryIds).catch(() => ({}))
          : Promise.resolve({}),
        manualIds.length > 0
          ? getMenuNamesByLocale(manualIds).catch(() => ({}))
          : Promise.resolve({}),
        pageIds.length > 0
          ? getPageTitlesByLocale(pageIds).catch(() => ({}))
          : Promise.resolve({}),
      ]);

      if (
        Object.keys(namesById).length > 0 ||
        Object.keys(menuNamesById).length > 0 ||
        Object.keys(pageNamesById).length > 0
      ) {
        menuItems = attachTypeNames(
          menuItems,
          namesById,
          menuNamesById,
          pageNamesById
        );
      }
    }
  } catch (err) {
    console.error("❌ HeaderWrapper menu error:", err);
    menuItems = [];
  }

  return <Header menu={menuItems} siteLogo={siteLogo} trHomeHref={trHomeHref} />;
}
