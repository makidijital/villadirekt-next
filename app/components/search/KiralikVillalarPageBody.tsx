import { cookies } from "next/headers";
import Link from "next/link";
import Script from "next/script";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { getExchangeRatesMap } from "@/app/services/exchange-rate.service";

import {
  getCachedVillas,
  getCachedVillaLocations,
  getCachedVillaTypes,
} from "@/lib/cache.helpers";
/* 🛡️ `getCachedVillas` artık yalnız kart alanlarını döndürür
   (bkz. lib/cache.helpers.ts — 2 MB cache limiti). */
import type { PublicVillaCard } from "@/lib/cache.helpers";

import VillaCard from "@/app/components/villa/VillaCard";
import FilterSidebar from "@/app/(public)/arama/FilterSidebar";
/* 🛡️ Villa özellikleri (sidebar "Villa Özellikleri" bölümü) — /arama ve
   Hero ile AYNI action. Yeni repository/sorgu/cache katmanı YOK. */
import { loadHeroFeatures } from "@/app/components/ui/hero/_components/hero-features.action";
import PageHero from "@/app/components/ui/PageHero";

import {
  JsonLd,
  SCHEMA_IN_LANGUAGE,
  buildBreadcrumb,
  buildItemList,
} from "@/app/components/seo/StructuredData";

/* 🛡️ Public pagination helpers — default 12 (URL'e yazılmaz), allowed
   [12,30,50,100]. Repository/service/cache katmanı etkilenmez. */
import {
  ALLOWED_PUBLIC_PAGE_SIZES,
  ALLOWED_PUBLIC_SORTS,
  DEFAULT_PUBLIC_PAGE_SIZE,
  DEFAULT_PUBLIC_SORT,
  applyPublicSort,
  computePageWindow,
  parsePublicPage,
  parsePublicPageSize,
  parsePublicSort,
  type PublicSort,
} from "@/lib/pagination";

/* 🛡️ PUBLIC ARŞİV ÇOKLU DİL — `/arama` (Phase 13, AramaPageBody) ile
   BİREBİR AYNI desen. Statik UI metinleri MEVCUT public dictionary'den
   (`villasArchive` + paylaşılan `search` anahtarları); veri akışı, URL
   kontratı, sort/pagination semantiği DEĞİŞMEDİ. `basePath`
   `buildLocaleAlternates` (Phase 7B) ile türetilir — yeni routing
   sistemi kurulmadı. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import type { Dictionary } from "@/lib/i18n/dictionaries/types";
/* 🛡️ VİLLA TİPİ ADI (EN/DE) — `AramaPageBody` / `loadHeroFilters` ile
   AYNI, ZATEN VAR OLAN iki helper. Yeni translation sistemi YAZILMADI. */
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import { getVillaBadgesByLocale } from "@/lib/i18n/get-villa-badge-translations.server";
import {
  resolveTaxonomyName,
  type TaxonomyNameByLocale,
} from "@/lib/i18n/taxonomy-name.helper";

/* 🛡️ KART GÖRSELİ `sizes` — yalnız bu sayfanın grid'ine göre (sidebar
   md+ 260/300px; kart 1 / sm 2 / xl 3 sütun). Değerler ölçülen kart
   genişliği × 1.41 güvenlik payı (16:9 cover kırpma × hover 1.06) ile
   hesaplandı; mevcut değerden daha KÜÇÜK bir görsel seçilmesi yalnız
   gereken genişliğin üstünde kalındığı yerde olur. ≤767px AYNEN.
   Grid/padding sınıfları değişirse bu değer yeniden hesaplanmalı. */
const KIRALIK_VILLALAR_CARD_SIZES =
  "(max-width: 640px) 100vw, " +
  "(max-width: 767px) 50vw, " +
  "(max-width: 1023px) calc(70.5vw - 287px), " +
  "(max-width: 1279px) calc(70.5vw - 360px), " +
  "(max-width: 1407px) calc(47vw - 256px), " +
  "406px";

type ArchiveDictionary = Dictionary["villasArchive"];
type SearchDictionary = Dictionary["search"];

/** `PublicSort` (lib/pagination.ts — DOKUNULMADI) → dictionary key.
 *  `AramaPageBody` ile AYNI harita; TR değerleri `PUBLIC_SORT_LABELS`
 *  ile BİREBİR aynıdır. */
const SORT_DICT_KEY: Record<PublicSort, keyof SearchDictionary["sortOptions"]> =
  {
    smart: "smart",
    "price-asc": "priceAsc",
    "price-desc": "priceDesc",
    "capacity-asc": "capacityAsc",
    "capacity-desc": "capacityDesc",
  };

/* ===============================================================
   🛡️ /kiralik-villalar — PUBLIC ARCHIVE / DISCOVERY PAGE (ORTAK GÖVDE)
   ===============================================================
   Bu dosya `app/(public)/kiralik-villalar/page.tsx` içindeki GERÇEK
   sayfa gövdesinin TAŞINMIŞ hâlidir (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN)
   — `/en/kiralik-villalar` ve `/de/kiralik-villalar` AYNI gövdeyi
   render eder; kodun ikinci/üçüncü kopyası YOKTUR (`AramaPageBody` /
   `HomePageBody` / `CmsPageBody` deseni).

   Bu sayfa GERÇEK SEARCH RESULT sayfası DEĞİL — archive + discovery
   entry point. /arama gerçek filtering engine; bu sayfa ise:
     - Editorial hero section
     - /arama ile birebir aynı 2-col layout (sticky sidebar + grid)
     - Tüm aktif villaları listeler (visibility filter dahil)
     - Sidebar mode="redirect" → filtre seçimleri ARAMA route'una
       push'lar (locale-aware: /arama | /en/arama | /de/arama);
       kullanıcı bu sayfadan ayrılır. Bu sayfa hiçbir filtering
       execution yapmaz.

   REUSE (DEĞİŞMEDİ):
     - getCachedVillas() (public visibility built-in)
     - VillaCard / FilterSidebar / PageHero
     - villa_locations / villa_types (sidebar opsiyonları)
     - JSON-LD helpers (CollectionPage + BreadcrumbList + ItemList)

   YOK:
     - Yeni filter state / yeni query mantığı
     - Availability/reservation/pricing/calendar logic'e dokunma
     - Yeni dependency / globals.css değişikliği
   =============================================================== */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""
).replace(/\/+$/, "");

/** TR (prefix'siz) arşiv path'i — tüm locale varyantları bundan türer. */
export const ARCHIVE_TR_PATH = "/kiralik-villalar";

/** Locale'e göre arşiv path'i (`/kiralik-villalar` | `/en/...` | `/de/...`). */
export function archivePath(locale: Locale): string {
  return buildLocaleAlternates(ARCHIVE_TR_PATH, locale).canonical;
}

/* 🛡️ Public pagination — URL state source-of-truth.
     `?page=N`     → 1-based; default 1 (URL'e yazılmaz)
     `?pageSize=M` → allowed [12,30,50,100]; default 12 (URL'e yazılmaz)
     `?sort=…`     → allow-list (lib/pagination.ts); default smart
   getCachedVillas() tam liste cache; server-side slice. */
export type ArchiveSearchParams = Promise<{
  page?: string | string[];
  pageSize?: string | string[];
  sort?: string | string[];
}>;

/* ===============================================================
   🛡️ SEO LANDING KAPSAMI (opsiyonel, ADDITIVE)
   ===============================================================
   /villa-turleri/[slug] ve /bolgeler/[slug] landing'leri AYNI arşiv
   gövdesini kullanır; yeni bir listeleme sistemi YOK. `scope`:
     • villaIds   → yalnız bu villalar listelenir (getCachedVillas
                    public kümesiyle kesişim; sıra/sort/pagination aynı)
     • trPath     → sayfalama/sort linklerinin ve JSON-LD'nin temeli
                    (locale öneki `buildLocaleAlternates` ile)
     • hero/JSON-LD metinleri + sidebar'ın ön-seçili kategori/bölgesi
   `scope` VERİLMEZSE (/kiralik-villalar) hiçbir değer değişmez →
   çıktı BİREBİR eskisi gibi. */
export type ArchiveLandingScope = {
  /** Landing'in TR (prefix'siz) path'i, ör. `/villa-turleri/x`. */
  trPath: string;
  villaIds: ReadonlySet<string>;
  heroEyebrow: string;
  heroTitle: string;
  collectionName: string;
  collectionDescription: string;
  /** Sidebar ön-seçimi (redirect ile /arama'ya taşınır). */
  sidebarCategories?: string[];
  sidebarRegions?: string[];
};

type Props = {
  /** Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale?: Locale;
  searchParams: ArchiveSearchParams;
  /** Yalnız SEO landing route'ları verir; bkz. `ArchiveLandingScope`. */
  scope?: ArchiveLandingScope;
};

/* ===============================================================
   🔥 PAGE BODY — server component, SSR-first
   =============================================================== */
export default async function KiralikVillalarPageBody({
  locale = DEFAULT_LOCALE,
  searchParams,
  scope,
}: Props) {
  const sp = await searchParams;

  const dictionary = getDictionary(locale);
  const dict: ArchiveDictionary = dictionary.villasArchive;
  /* 🛡️ Sıralama / sayfa boyutu / pagination etiketleri `/arama` ile
     PAYLAŞILIR (`search` namespace) — ikinci bir kopya üretilmedi. */
  const shared: SearchDictionary = dictionary.search;

  const basePath = scope
    ? buildLocaleAlternates(scope.trPath, locale).canonical
    : archivePath(locale);
  const pageUrl = SITE_URL ? `${SITE_URL}${basePath}` : basePath;
  /* 🛡️ Sidebar mode="redirect" hedefi: ARAMA route'u (bu sayfa DEĞİL).
     Locale'e göre `/arama` | `/en/arama` | `/de/arama`. */
  const searchPath = buildLocaleAlternates("/arama", locale).canonical;

  /* 🛡️ Cached fetches — Promise.all ile paralel:
     - getCachedVillas: tag "villas", TTL 10dk; villa mutations invalidate
     - getCachedVillaLocations / getCachedVillaTypes: tag "taxonomy",
       TTL 1 saat; mutation invalidation yok (rare changes, TTL OK)
     - cookies(): currency cookie'sini oku (CurrencyContext dual-write)
     - getExchangeRatesMap(): server-side rates (DB'den; TCMB cron'la dolar) */
  const [
    allVillas,
    regionOptions,
    categoryOptions,
    cookieStore,
    ratesMap,
    featureOptions,
  ] = await Promise.all([
    getCachedVillas(),
    getCachedVillaLocations(),
    getCachedVillaTypes(),
    cookies(),
    getExchangeRatesMap(),
    /* 🛡️ Mevcut Promise.all'a girer → EK RTT YOK. Hata → boş liste
       (sidebar bölümü boş metin gösterir; sayfa ETKİLENMEZ). */
    loadHeroFeatures(locale).catch(() => []),
  ]);

  /* 🛡️ Landing kapsamı — yalnız scope varsa süzülür; yoksa AYNI dizi. */
  const villas = scope
    ? allVillas.filter((v) => scope.villaIds.has(String(v.id)))
    : allVillas;

  const totalCount = villas.length;

  /* 🛡️ PAGINATION — `?page=N` + `?pageSize=M` (allowed [12,30,50,100]).
     Server-side dilim → client'a yalnız mevcut sayfa kartları iner.
     Helpers: lib/pagination.ts. */
  const pageSize = parsePublicPageSize(sp.pageSize);
  const pageRaw = parsePublicPage(sp.page);

  /* 🛡️ SORT — URL state ile JS-side sıralama.
     `smart` (default) → mevcut sıra (sort_order ASC, created_at DESC)
     getCachedVillas'tan AYNEN gelir (no-op shortcut).
     Diğer modlar yeni array döndürür (input mutate edilmez) → cache
     payload'u dokunulmaz; sadece UI render sırası değişir.
     Repository/service/cache/availability'e SIFIR dokunma.

     🛡️ CURRENCY-AWARE PRICE SORT — VillaCard ile aynı convertPrice
     formülü → gösterilen ekonomik değer === sıralama anahtarı.
     Cookie + server rates yukarıda paralel fetch edildi. */
  const sort: PublicSort = parsePublicSort(sp.sort);
  const userCurrency = cookieStore.get("currency")?.value || "TRY";
  const rates: Record<string, number> = {
    TRY: 1,
    USD: Number(ratesMap.rates.USD) || 0,
    EUR: Number(ratesMap.rates.EUR) || 0,
    GBP: Number(ratesMap.rates.GBP) || 0,
  };
  const sortedVillas = applyPublicSort(villas, sort, {
    userCurrency,
    rates,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, pageRaw), totalPages);
  const sliceStart = (currentPage - 1) * pageSize;
  const villasOnPage = sortedVillas.slice(sliceStart, sliceStart + pageSize);

  /* 🛡️ Kart rozeti (villa_translations.badge) TEK batch sorguda
     çözülür — `VillaList` / `DiscountCollection` ile AYNI desen,
     N+1 YOK. TR'de sorgu HİÇ atılmaz → TR çıktısı ve maliyeti
     BİREBİR eskisi gibi. Çeviri yoksa canonical rozet gösterilir. */
  const badgeByVillaId = await getVillaBadgesByLocale(
    villasOnPage.map((v) => v.id),
    locale
  );

  /* Sidebar initial state — /kiralik-villalar'da filtre yok
     (archive page; URL query'siz). Kullanıcı seçim yapana kadar
     boş başlar; "Villa Bul" CTA'sı arama route'una push'lar. */
  const sidebarInitial = {
    regions: (scope?.sidebarRegions ?? []) as string[],
    categories: (scope?.sidebarCategories ?? []) as string[],
    start: null as string | null,
    end: null as string | null,
    guests: 0,
  };

  /* ===============================================================
     🛡️ VİLLA TİPİ ADI — SIDEBAR GÖRÜNÜMÜ İÇİN LOCALE-AWARE
     ===============================================================
     `AramaPageBody` ile BİREBİR AYNI desen:
       • locale === "tr" → çeviri sorgusu HİÇ atılmaz; TR davranışı
         ve sorgu sayısı BİREBİR eskisi gibi.
       • EN/DE → `getVillaTypeNamesByLocale` (TEK batch `.in()`
         sorgusu, N+1 YOK) + `resolveTaxonomyName` (çeviri yoksa
         canonical TR adına düşer). Hata → `{}` → TR fallback.

     ⚠️ YALNIZ GÖRÜNEN `name` değişir. Canonical id/slug/token ve
     FilterSidebar'ın ürettiği URL query değerleri DEĞİŞMEZ.
     ⚠️ BÖLGELER çevrilmez (Phase 10I: özel isim → canonical).
     =============================================================== */
  let sidebarCategoryOptions = categoryOptions;
  if (locale !== DEFAULT_LOCALE && categoryOptions.length > 0) {
    const typeNameByLocale: Record<string, TaxonomyNameByLocale> =
      await getVillaTypeNamesByLocale(
        categoryOptions.map((t) => String(t.id))
      ).catch(() => ({}));
    sidebarCategoryOptions = categoryOptions.map((t) => ({
      ...t,
      name: resolveTaxonomyName(t.name, typeNameByLocale[String(t.id)], locale),
    }));
  }

  /* ---------------- JSON-LD ---------------- */
  const breadcrumbLd = buildBreadcrumb(
    scope
      ? [
          { name: dict.breadcrumbHome, url: "/" },
          { name: dict.breadcrumbCurrent, url: archivePath(locale) },
          { name: scope.heroTitle },
        ]
      : [
          { name: dict.breadcrumbHome, url: "/" },
          { name: dict.breadcrumbCurrent },
        ],
    /* TR'de `undefined` → JSON-LD çıktısı BYTE-IDENTICAL kalır
       (bkz. buildBreadcrumb, Phase 7D). */
    locale === DEFAULT_LOCALE ? undefined : locale
  );

  const collectionPageLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": pageUrl,
    url: pageUrl,
    name: scope ? scope.collectionName : dict.collectionName,
    description: scope
      ? scope.collectionDescription
      : dict.collectionDescription,
    isPartOf: SITE_URL ? { "@type": "WebSite", url: SITE_URL } : undefined,
    inLanguage: SCHEMA_IN_LANGUAGE[locale],
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: totalCount,
    },
  };

  const itemListLd =
    totalCount > 0
      ? buildItemList(
          /* 🛡️ Faz 9 hardening: `(v: any)` → `VillaDTO`. */
          villas.map((v: PublicVillaCard) => ({
            slug: String(v.slug || ""),
            title: String(v.title || ""),
            image: Array.isArray(v.images) ? v.images[0] : undefined,
          }))
        )
      : null;

  return (
    <>
      <JsonLd data={collectionPageLd} />
      <JsonLd data={breadcrumbLd} />
      {itemListLd ? <JsonLd data={itemListLd} /> : null}

      <main>
        {/* =======================================================
            1) EDITORIAL HERO — kompakt PageHero (eski dev blok yerine).
            Breadcrumb / başlık / açıklama / SEO KORUNDU; sadece UI.
            ======================================================= */}
        <PageHero
          breadcrumb={
            scope
              ? [
                  { name: dict.breadcrumbHome, href: localeHref("/", locale) },
                  { name: dict.breadcrumbCurrent, href: archivePath(locale) },
                  { name: scope.heroTitle },
                ]
              : [
                  { name: dict.breadcrumbHome, href: localeHref("/", locale) },
                  { name: dict.breadcrumbCurrent },
                ]
          }
          eyebrow={scope ? scope.heroEyebrow : dict.heroEyebrow}
          title={scope ? scope.heroTitle : dict.heroTitle}
          stat={{ value: totalCount, label: dict.heroStatLabel }}
        />

        {/* =======================================================
            2) SEARCH-STYLE LAYOUT — /arama ile birebir aynı UX
               Sol: sticky FilterSidebar (mode="redirect")
               Sağ: VillaCard grid (tam arşiv)
               Mobile: filter trigger → bottom slide-over (sidebar
                 zaten kendi içinde drawer'ı render eder)
            ======================================================= */}
        <section className="px-5 md:px-10 lg:px-16 pt-8 md:pt-12 pb-24 md:pb-32">
          <div className="site-container-inner">
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr] gap-x-8 lg:gap-x-12">
              {/* SIDEBAR — redirect mode */}
              <FilterSidebar
                regionOptions={regionOptions}
                categoryOptions={sidebarCategoryOptions}
                /* 🛡️ Locale'e göre çözülmüş adlarla TEK SEFER geçer;
                   client'ta sorgu YOK. `initial.features` VERİLMEZ:
                   arşiv sayfası URL query okumaz (mevcut sözleşme) →
                   bölüm seçim yokken KAPALI başlar, seçim "Villa Bul"
                   ile /arama?ozellikler=… olarak taşınır. */
                featureOptions={featureOptions}
                initial={sidebarInitial}
                mode="redirect"
                /* 🛡️ Panel metinleri + takvim locale'i. `basePath`
                   bu sayfa DEĞİL, hedef ARAMA route'udur (redirect
                   sözleşmesi DEĞİŞMEDİ; TR'de "/arama"). */
                locale={locale}
                basePath={searchPath}
              />

              {/* RESULTS COLUMN — tüm aktif villalar (archive) */}
              <div>
                {totalCount === 0 ? (
                  <div className="px-2 md:px-6">
                    <div className="rounded-2xl border border-[var(--color-stone-100)] bg-white/60 backdrop-blur-[2px] px-6 py-16 md:px-12 md:py-24 max-w-2xl mx-auto text-center">
                      <p className="text-[11px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-500)]">
                        <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                        {dict.emptyEyebrow}
                      </p>
                      <h2 className="font-display text-[34px] md:text-[48px] text-[var(--color-stone-900)] mt-4 tracking-[-0.03em] leading-[1.02]">
                        {dict.emptyTitle}
                      </h2>
                      <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed text-[14.5px] max-w-md mx-auto">
                        {dict.emptyBody}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 🛡️ TOOLBAR — sort + page size selector (grid üstü).
                       Kart boyut/yerleşim/grid sınıfları DEĞİŞMEZ.
                       Mobile: yatay merkez, satır kırılırsa ortalı kalır.
                       Desktop (md+): sağa yaslı, mevcut gap. */}
                    <div className="mb-6 md:mb-8 flex flex-wrap items-center justify-center gap-3 md:justify-end md:gap-6">
                      <SortSelector
                        pageSize={pageSize}
                        sort={sort}
                        dict={shared}
                        basePath={basePath}
                      />
                      <PageSizeSelector
                        pageSize={pageSize}
                        sort={sort}
                        dict={shared}
                        basePath={basePath}
                      />
                    </div>
                    {/* 🛡️ Sort dropdown auto-close — /arama ile aynı id;
                       Script dedupe key. <details>.open Link tıklamasında
                       false'a çekilir. */}
                    <Script
                      id="public-sort-dropdown-close"
                      strategy="afterInteractive"
                    >
                      {SORT_DROPDOWN_CLOSE_SCRIPT}
                    </Script>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-12 md:gap-y-16">
                      {/* 🛡️ Faz 9 hardening: `(villa: any)` → `VillaDTO`.
                         🛡️ SCALE HARDENING: `villas` yerine `villasOnPage`
                         (PAGE_SIZE'la dilimlenmiş). */}
                      {villasOnPage.map((villa: PublicVillaCard, index) => (
                        <VillaCard
                          key={villa.slug || villa.id}
                          /* 🛡️ FAZ 36 — favorites identity. */
                          id={villa.id}
                          slug={villa.slug}
                          title={villa.title}
                          location={villa.location}
                          price={villa.price}
                          currency={villa.currency || "TRY"}
                          images={villa.images}
                          badge={badgeByVillaId.get(villa.id) ?? villa.badge}
                          bedrooms={villa.bedrooms || 1}
                          bathrooms={villa.bathrooms || 1}
                          guests={villa.guests || 2}
                          /* 🛡️ FAZ 35 — review trust meta passthrough. */
                          reviewAverage={villa.review_average}
                          reviewCount={villa.review_count}
                          /* 🛡️ PHASE 10G — kart metinleri + detay linki
                             locale-aware (VillaCard DEĞİŞTİRİLMEDİ). */
                          locale={locale}
                          sizes={KIRALIK_VILLALAR_CARD_SIZES}
                          /* 🛡️ İlk kart = olası LCP → eager + high. */
                          isLcp={index === 0}
                        />
                      ))}
                    </div>

                    {/* 🛡️ Numbered pagination — admin paterni (lib/pagination
                       computePageWindow). pageSize URL'de korunur; sayfa
                       linklerinde page güncellenir, default değer (12)
                       URL'e yazılmaz. */}
                    {totalPages > 1 && (
                      <PaginationNav
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        sort={sort}
                        dict={shared}
                        basePath={basePath}
                      />
                    )}
                  </>
                )}

                {/* 🛡️ SEO HAKKINDA — results column içinde inline.
                   (Mizanpaj gerekçesi için git geçmişine bakınız; bu
                   fazda yalnız metinler dictionary'ye taşındı.) */}
                <div className="mt-16 md:mt-20 rounded-2xl bg-[var(--color-sand-50)]/60 border border-[var(--color-stone-100)] px-6 py-10 md:px-10 md:py-14">
                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 md:gap-10">
                    <div className="xl:col-span-2">
                      <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
                        <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
                        {dict.aboutEyebrow}
                      </p>
                      <h2
                        id="kv-about-heading"
                        className="font-display text-[30px] md:text-[40px] xl:text-[44px] text-[var(--color-stone-900)] mt-5 leading-[1.05] tracking-[-0.025em]"
                      >
                        {dict.aboutTitleLead}
                        <br />
                        <span className="text-[var(--color-stone-400)]">
                          {dict.aboutTitleAccent}
                        </span>
                      </h2>
                    </div>

                    <div className="xl:col-span-3 space-y-5 text-[15px] leading-[1.7] text-[var(--color-stone-600)]">
                      <p>{dict.aboutParagraph1}</p>
                      <p>{dict.aboutParagraph2}</p>
                      <p>
                        {dict.aboutParagraph3Lead}{" "}
                        <Link
                          href={searchPath}
                          className="text-[var(--color-stone-900)] underline decoration-[var(--color-champagne-500)] decoration-1 underline-offset-4 hover:decoration-[var(--color-champagne-700)] transition-colors motion-reduce:transition-none"
                        >
                          {dict.aboutParagraph3LinkLabel}
                        </Link>{" "}
                        {dict.aboutParagraph3Trail}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

/* ===============================================================
   🛡️ URL BUILDER — archive (/kiralik-villalar) için pagination
   ===============================================================
   Archive page — filter parametresi YOK (sidebar redirect mode →
   arama route'una gönderir). Bu yüzden build helper sadece page +
   pageSize + sort alır. Default değerler URL'e yazılmaz (clean).

   🛡️ ÇOKLU DİL: `basePath` parametre olarak gelir (`/kiralik-villalar`
   | `/en/kiralik-villalar` | `/de/kiralik-villalar`). Parametre adları,
   değerleri ve default'ların yazılmaması DEĞİŞMEDİ. */
function buildArchiveHref(
  next: {
    page?: number;
    pageSize?: number;
    sort?: PublicSort;
  },
  basePath: string
): string {
  const usp = new URLSearchParams();
  if (next.page !== undefined && next.page > 1) {
    usp.set("page", String(next.page));
  }
  if (
    next.pageSize !== undefined &&
    next.pageSize !== DEFAULT_PUBLIC_PAGE_SIZE
  ) {
    usp.set("pageSize", String(next.pageSize));
  }
  /* 🛡️ sort: default ("smart") URL'e yazılmaz (clean URL).
     Diğer modlar yazılır → pagination + pageSize linkleri sort'u
     korur (caller her zaman geçer); SortSelector page=1 reset
     ile yeni sort'u set eder. */
  if (next.sort !== undefined && next.sort !== DEFAULT_PUBLIC_SORT) {
    usp.set("sort", next.sort);
  }
  const qs = usp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/* ===============================================================
   🛡️ SORT DROPDOWN AUTO-CLOSE — global click delegation
   ===============================================================
   /arama ile birebir aynı script (id paylaşımı ile dedupe). */
const SORT_DROPDOWN_CLOSE_SCRIPT = `(function(){document.addEventListener('click',function(e){var t=e.target;if(!(t&&t.closest))return;var l=t.closest('details [role="menuitemradio"]');if(!l)return;var d=l.closest('details');if(d)d.open=false;});})();`;

/* ===============================================================
   🛡️ PAGE SIZE SELECTOR — pill grup; Link-based (server-safe)
   ===============================================================
   pageSize değişiminde page=1'e döner (default URL'e yazılmaz). */
function PageSizeSelector({
  pageSize,
  sort,
  dict,
  basePath,
}: {
  pageSize: number;
  sort: PublicSort;
  dict: SearchDictionary;
  basePath: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-stone-500)]">
      <span>{dict.pageSizeLabel}</span>
      <div
        role="group"
        aria-label={dict.pageSizeAriaLabel}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-stone-200)] bg-white p-1"
      >
        {ALLOWED_PUBLIC_PAGE_SIZES.map((sz) => {
          const active = sz === pageSize;
          /* sort PRESERVE: pageSize değişiminde kullanıcının seçtiği
             sıralama korunur (caller her zaman `sort` geçer). */
          const href = buildArchiveHref(
            { pageSize: sz, page: 1, sort },
            basePath
          );
          return (
            <Link
              key={sz}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                "inline-flex items-center justify-center min-w-[36px] " +
                "px-2.5 py-1 rounded-full " +
                "text-[12.5px] font-medium tabular-nums " +
                "transition-colors motion-reduce:transition-none " +
                (active
                  ? "bg-[var(--color-stone-900)] text-white"
                  : "text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)]")
              }
            >
              {sz}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ===============================================================
   🛡️ PAGINATION NAV — numbered window (admin paterni)
   ===============================================================
   `computePageWindow` (lib/pagination) ile aynı algoritma admin'le.
   pageSize URL'de korunur; sayfa linklerinde page güncellenir. */
function PaginationNav({
  currentPage,
  totalPages,
  pageSize,
  sort,
  dict,
  basePath,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  sort: PublicSort;
  dict: SearchDictionary;
  basePath: string;
}) {
  const pages = computePageWindow(currentPage, totalPages);
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      aria-label={dict.paginationAriaLabel}
      className="mt-16 md:mt-20 flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-[var(--color-stone-600)]"
    >
      {prevDisabled ? (
        <span
          aria-disabled="true"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-300)] cursor-not-allowed"
        >
          <ChevronLeft size={14} />
          {dict.paginationPrev}
        </span>
      ) : (
        <Link
          href={buildArchiveHref(
            { page: currentPage - 1, pageSize, sort },
            basePath
          )}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
        >
          <ChevronLeft size={14} />
          {dict.paginationPrev}
        </Link>
      )}

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`gap-${idx}`}
            className="px-2 py-1.5 text-[12.5px] text-[var(--color-stone-400)]"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildArchiveHref({ page: p, pageSize, sort }, basePath)}
            aria-current={p === currentPage ? "page" : undefined}
            className={
              "inline-flex items-center justify-center min-w-[32px] " +
              "px-2.5 py-1.5 rounded-full " +
              "text-[12.5px] font-medium tabular-nums " +
              "transition-colors motion-reduce:transition-none " +
              (p === currentPage
                ? "bg-[var(--color-stone-900)] text-white"
                : "text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)]")
            }
          >
            {p}
          </Link>
        )
      )}

      {nextDisabled ? (
        <span
          aria-disabled="true"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-300)] cursor-not-allowed"
        >
          {dict.paginationNext}
          <ChevronRight size={14} />
        </span>
      ) : (
        <Link
          href={buildArchiveHref(
            { page: currentPage + 1, pageSize, sort },
            basePath
          )}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
        >
          {dict.paginationNext}
          <ChevronRight size={14} />
        </Link>
      )}
    </nav>
  );
}

/* ===============================================================
   🛡️ SORT SELECTOR — Link/details dropdown (server-safe, JS-less)
   ===============================================================
   /arama ile birebir aynı pattern. URL inşası TEK source-of-truth:
   buildArchiveHref({ sort, page: 1, pageSize }) → pageSize KORUNUR,
   page=1 reset. Hard navigation YOK; soft navigation (<Link>) ile
   React state korunur, race condition yok.

   🛡️ Etiketler `PUBLIC_SORT_LABELS` yerine dictionary'den okunur
   (`SORT_DICT_KEY` köprüsü). TR değerleri BİREBİR aynıdır;
   `lib/pagination.ts` DEĞİŞTİRİLMEDİ. */
function SortSelector({
  pageSize,
  sort,
  dict,
  basePath,
}: {
  pageSize: number;
  sort: PublicSort;
  dict: SearchDictionary;
  basePath: string;
}) {
  const currentLabel = dict.sortOptions[SORT_DICT_KEY[sort]];
  return (
    <details className="relative group/sort">
      <summary
        className={
          "list-none cursor-pointer select-none " +
          "inline-flex items-center gap-2 px-3 py-1 rounded-full " +
          "border border-[var(--color-stone-200)] bg-white " +
          "text-[12.5px] font-medium text-[var(--color-stone-700)] " +
          "hover:border-[var(--color-stone-300)] " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
          "transition-colors motion-reduce:transition-none"
        }
        aria-label={dict.sortAriaLabel}
      >
        <span className="text-[var(--color-stone-500)]">{dict.sortLabel}</span>
        <span>{currentLabel}</span>
        <span
          aria-hidden="true"
          className="text-[var(--color-stone-400)] transition-transform group-open/sort:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div
        role="menu"
        className={
          "absolute right-0 top-full mt-2 z-20 " +
          "min-w-[220px] rounded-xl border border-[var(--color-stone-200)] " +
          "bg-white shadow-lg p-1"
        }
      >
        {ALLOWED_PUBLIC_SORTS.map((s) => {
          const active = s === sort;
          /* pageSize PRESERVE + page=1 reset. */
          const href = buildArchiveHref(
            { sort: s, page: 1, pageSize },
            basePath
          );
          return (
            <Link
              key={s}
              href={href}
              role="menuitemradio"
              aria-checked={active}
              className={
                "block px-3 py-2 rounded-lg " +
                "text-[12.5px] font-medium " +
                "transition-colors motion-reduce:transition-none " +
                (active
                  ? "bg-[var(--color-stone-900)] text-white"
                  : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]")
              }
            >
              {dict.sortOptions[SORT_DICT_KEY[s]]}
            </Link>
          );
        })}
      </div>
    </details>
  );
}
