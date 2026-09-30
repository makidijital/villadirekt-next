import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import KiralikVillalarPageBody, {
  type ArchiveSearchParams,
} from "@/app/components/search/KiralikVillalarPageBody";
import { getCachedSettings } from "@/lib/cache.helpers";
import {
  DEFAULT_LOCALE,
  isMultilingualEnabled,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";
import {
  DEFAULT_PUBLIC_PAGE_SIZE,
  parsePublicPage,
  parsePublicPageSize,
} from "@/lib/pagination";
import {
  CATEGORY_LANDING_TR_PREFIX,
  REGION_LANDING_TR_PREFIX,
} from "@/lib/taxonomy-landing";
import {
  countPublicLandingVillas,
  resolveCategoryLanding,
  resolveRegionGroupLanding,
  type CategoryLanding,
  type RegionGroupLanding,
} from "@/lib/taxonomy-landing.server";

/* ===============================================================
   🛡️ SEO LANDING — /villa-turleri/[slug] + /bolgeler/[slug] (ORTAK)
   ===============================================================
   TR/EN/DE route dosyaları yalnız bu modülü çağırır (Arama/Arşiv
   gövdelerindeki "tek gövde + locale prop" deseni).

   LİSTE: MEVCUT `KiralikVillalarPageBody` (+ opsiyonel `scope`) —
   yeni listeleme/sorgu sistemi YOK; kartlar, sort, pagination, JSON-LD
   ve FilterSidebar (redirect → mevcut /arama) aynen.

   404: geçersiz slug, UUID, alt bölge, kökü olmayan grup.
   Villa yok: sayfa boş durumuyla render edilir, `noindex,follow`
   (sitemap zaten dışarıda bırakır) — geçici boşlukta 404/200 dalgalanması
   yerine indexten güvenli çıkış.
   =============================================================== */

export type LandingKind = "category" | "region";

type Resolved = {
  landing: CategoryLanding | RegionGroupLanding;
  displayName: string;
  trPath: string;
};

async function resolveLanding(
  kind: LandingKind,
  rawSlug: string,
  locale: Locale
): Promise<Resolved | null> {
  if (kind === "category") {
    const landing = await resolveCategoryLanding(rawSlug);
    if (!landing) return null;
    /* Kategori adı: mevcut çeviri sistemi (TR'de sorgu YOK). */
    let displayName = landing.name;
    if (locale !== DEFAULT_LOCALE) {
      const byId = await getVillaTypeNamesByLocale([landing.id]).catch(
        () => ({})
      );
      displayName = resolveTaxonomyName(
        landing.name,
        (byId as Record<string, Parameters<typeof resolveTaxonomyName>[1]>)[
          landing.id
        ],
        locale
      );
    }
    return {
      landing,
      displayName,
      trPath: `${CATEGORY_LANDING_TR_PREFIX}/${encodeURIComponent(landing.slug)}`,
    };
  }
  const landing = await resolveRegionGroupLanding(rawSlug);
  if (!landing) return null;
  /* Bölge adları çevrilmez (Phase 10I — özel isim). */
  return {
    landing,
    displayName: landing.name,
    trPath: `${REGION_LANDING_TR_PREFIX}/${encodeURIComponent(landing.slug)}`,
  };
}

function texts(kind: LandingKind, locale: Locale, name: string, brand: string) {
  const d = getDictionary(locale).taxonomyLanding;
  const v = { name, brand };
  return kind === "category"
    ? {
        metaTitle: formatDictionaryString(d.categoryMetaTitle, v),
        metaDescription: formatDictionaryString(d.categoryMetaDescription, v),
        heroEyebrow: d.categoryHeroEyebrow,
        heroTitle: formatDictionaryString(d.categoryHeroTitle, v),
      }
    : {
        metaTitle: formatDictionaryString(d.regionMetaTitle, v),
        metaDescription: formatDictionaryString(d.regionMetaDescription, v),
        heroEyebrow: d.regionHeroEyebrow,
        heroTitle: formatDictionaryString(d.regionHeroTitle, v),
      };
}

function brandOf(settings: { site_name?: string | null } | null): string {
  /* `buildVillasArchiveMetadata` ile AYNI marka fallback'i. */
  return settings?.site_name?.trim() || "Villa Kiralama";
}

/* ---------------------------------------------------------------
   METADATA
   --------------------------------------------------------------- */
export async function buildTaxonomyLandingMetadata(
  kind: LandingKind,
  rawSlug: string,
  locale: Locale,
  searchParams?: ArchiveSearchParams
): Promise<Metadata> {
  const resolved = await resolveLanding(kind, rawSlug, locale);
  if (!resolved) notFound();

  const settings = await getCachedSettings().catch(() => null);
  const t = texts(kind, locale, resolved.displayName, brandOf(settings));
  const count = await countPublicLandingVillas(resolved.landing.villaIds);

  /* Sayfalama canonical'ı: sayfa 1 → temel URL; sayfa N (varsayılan
     sayfa boyutunda) → kendi `?page=N` URL'i. sort/pageSize
     varyantları temel URL'e toplanır. */
  const sp = searchParams ? await searchParams : {};
  const pageSize = parsePublicPageSize(sp.pageSize);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(Math.max(1, parsePublicPage(sp.page)), totalPages);
  const pageQuery =
    current > 1 && pageSize === DEFAULT_PUBLIC_PAGE_SIZE ? `?page=${current}` : "";

  const { canonical, languages } = buildLocaleAlternates(resolved.trPath, locale);
  const canonicalUrl = `${canonical}${pageQuery}`;
  const alternates = isMultilingualEnabled(settings)
    ? {
        canonical: canonicalUrl,
        languages: Object.fromEntries(
          Object.entries(languages).map(([k, v]) => [k, `${v}${pageQuery}`])
        ),
      }
    : { canonical: canonicalUrl };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const pageUrl = siteUrl ? `${siteUrl}${canonicalUrl}` : canonicalUrl;

  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates,
    openGraph: {
      title: t.metaTitle,
      description: t.metaDescription,
      type: "website",
      url: pageUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: t.metaTitle,
      description: t.metaDescription,
    },
    /* Villa yoksa indexleme; aksi halde root layout'un site geneli
       robots politikası (settings.robots_index/follow) miras kalır. */
    ...(count === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

/* ---------------------------------------------------------------
   BODY
   --------------------------------------------------------------- */
export default async function TaxonomyLandingPageBody({
  kind,
  slug,
  locale = DEFAULT_LOCALE,
  searchParams,
}: {
  kind: LandingKind;
  slug: string;
  locale?: Locale;
  searchParams: ArchiveSearchParams;
}) {
  const resolved = await resolveLanding(kind, slug, locale);
  if (!resolved) notFound();

  const settings = await getCachedSettings().catch(() => null);
  const t = texts(kind, locale, resolved.displayName, brandOf(settings));
  const { landing } = resolved;

  return (
    <KiralikVillalarPageBody
      locale={locale}
      searchParams={searchParams}
      scope={{
        trPath: resolved.trPath,
        villaIds: landing.villaIds,
        heroEyebrow: t.heroEyebrow,
        heroTitle: t.heroTitle,
        collectionName: t.heroTitle,
        collectionDescription: t.metaDescription,
        sidebarCategories: landing.kind === "category" ? [landing.id] : [],
        sidebarRegions: landing.kind === "region" ? [landing.id] : [],
      }}
    />
  );
}
