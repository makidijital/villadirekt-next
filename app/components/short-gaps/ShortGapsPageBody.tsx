import { notFound } from "next/navigation";

import VillaCard from "@/app/components/villa/VillaCard";
import { JsonLd, buildItemList } from "@/app/components/seo/StructuredData";
import { shortGapsRepository } from "@/lib/db/short-gaps.repository";
/* 🛡️ Villa Migration S5E — findShortGapVillas native embed'e taşındı. Bu
   sayfa server RSC + villaRepository'yi YALNIZ findShortGapVillas için
   kullanıyor → server-only native repo import'u güvenli, tek call-site. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { getCachedVillaLocations, getCachedVillaTypes } from "@/lib/cache.helpers";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
/* 🛡️ Kart başlangıç fiyatı — TÜM public kartlarla aynı ortak mantık. */
import { getStartingPrice } from "@/lib/price.engine";
import {
  resolveBucketMonthFromSlug,
  parseGapNights,
  formatGapRange,
} from "@/lib/short-gaps.helpers";
import GapFilterSidebar, {
  type GapFilterOption,
} from "@/app/(public)/kisa-sureli-tarihler/GapFilterSidebar";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`shortGaps` namespace). Ay adı `home.months` + MEVCUT
   `bucketMonthLabel` çekirdeğinden (ShortGapsSection ile AYNI yol).
   Gap/villa sorguları, fiyat mantığı ve URL contract DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { MonthNumber } from "@/lib/i18n/dictionaries/types";
import { getVillaBadgesByLocale } from "@/lib/i18n/get-villa-badge-translations.server";
/* 🛡️ VİLLA TİPİ ADI (EN/DE) — `AramaPageBody` / `KiralikVillalarPageBody`
   ile AYNI, ZATEN VAR OLAN iki helper. Yeni translation sistemi veya DB
   katmanı YAZILMADI. */
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import {
  resolveTaxonomyName,
  type TaxonomyNameByLocale,
} from "@/lib/i18n/taxonomy-name.helper";
import { shortGapsMonthLabel } from "@/app/components/short-gaps/short-gaps-metadata";

/* ===============================================================
   🛡️ KISA SÜRELİ TARİHLER — LİSTELEME SAYFASI
   ===============================================================
   /kisa-sureli-tarihler/[ay]/[gece]  (ör. /haziran/2)

   - villa_short_gaps (053) → bucket_month + gap_nights filtreli
     DISTINCT villa_id seti + temsilci boşluk tarihi.
   - Sonra mevcut villa sorgusu (arama ile aynı shape) YALNIZ bu
     villa_id'ler içinde çalışır.
   - TARİH FİLTRESİ YOK. minimum_stay_nights KULLANILMAZ.
   - /arama, booking, availability, pricing'e SIFIR dokunuş.
   =============================================================== */

type RouteParams = { ay: string; gece: string };
type SearchParams = {
  bolgeler?: string | string[];
  "villa-turleri"?: string | string[];
  guests?: string | string[];
};

/* ----------------------------- helpers ----------------------------- */

function toTokenList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

function tokensToIds(
  tokens: string[],
  options: { id: string; slug: string | null }[]
): string[] {
  if (tokens.length === 0) return [];
  const out = new Set<string>();
  for (const t of tokens) {
    const match = options.find((o) => o.id === t || o.slug === t);
    if (match) out.add(match.id);
  }
  return Array.from(out);
}

/* ------------------------------- page ------------------------------- */

type GapRow = { villa_id: string; gap_start: string; gap_end: string };

type VillaImageEmbed = {
  image_url: string | null;
  is_cover: boolean | null;
  sort_order: number | null;
};
/* VillaCard.tsx `StayPrice` ile birebir aynı shape (structural). */
type StayPrice = {
  price: number;
  currency: string;
  start_date: string;
  end_date: string;
};
type VillaPriceEmbed = {
  price: number | null;
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
};
type VillaRow = {
  id: string;
  slug: string | null;
  title: string | null;
  badge: string | null;
  price: number | null;
  currency: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  /* Temizlik ücreti alanları — villa satırı kolonları (`*` ile gelir).
     VillaCard calculateGrandTotal'a aynen iletilir (yeni hesap yok). */
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  location: { name: string } | null;
  villa_images: VillaImageEmbed[] | null;
  villa_prices: VillaPriceEmbed[] | null;
};

export default async function ShortGapsPageBody({
  params,
  searchParams,
  locale = DEFAULT_LOCALE,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
  locale?: Locale;
}) {
  const dict = getDictionary(locale).shortGaps;
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const { ay, gece } = await params;
  const sp = await searchParams;

  const nights = parseGapNights(gece);
  const bucketMonth = resolveBucketMonthFromSlug(ay);
  if (!nights || !bucketMonth) notFound();

  /* 1) Boşluk seti — bucket_month + gap_nights filtreli. */
  const { data: gapData } = await shortGapsRepository.findGapsByMonthNights(
    bucketMonth,
    nights
  );

  const gapRows: GapRow[] = Array.isArray(gapData) ? (gapData as GapRow[]) : [];

  /* 1 gap = 1 kart: TÜM boşluklar korunur (dedup YOK). Villa sorgusu
     için yalnız UNIQUE villa_id'ler kullanılır (aynı villayı tekrar
     çekmemek için); render gapRows üzerinden gap-başına döner. */
  const gapVillaIds = Array.from(new Set(gapRows.map((g) => g.villa_id)));

  const monthLabel = shortGapsMonthLabel(ay, locale);

  /* 🛡️ Kart tarih aralığı ay adı — `shortGapsMonthLabel` ile AYNI
     kaynak (`home.months`). TR'de `formatGapRangeTr` çıktısıyla
     BİREBİR aynı; EN/DE kendi ay adlarını alır. */
  const gapMonths = getDictionary(locale).home.months;
  const gapMonthName = (m: number): string =>
    gapMonths[m as MonthNumber] ?? "";

  /* Filtre opsiyonları (taxonomy) — sidebar + token resolve. */
  const [regionOptionsRaw, typeOptionsRaw] = await Promise.all([
    getCachedVillaLocations().catch(() => []),
    getCachedVillaTypes().catch(() => []),
  ]);

  const regionTokens = toTokenList(sp.bolgeler);
  const typeTokens = toTokenList(sp["villa-turleri"]);
  const guests = Number(toTokenList(sp.guests)[0] || 0) || 0;

  /* Boşluk yoksa kısa devre — boş state. */
  let villas: Array<{
    id: string;
    slug: string;
    title: string;
    location: string;
    price: number | null;
    currency: string;
    images: string[];
    badge?: string;
    bedrooms: number;
    bathrooms: number;
    guests: number;
    prices: StayPrice[];
    cleaningFee: number;
    cleaningCurrency: string;
    cleaningLimit: number;
  }> = [];

  if (gapVillaIds.length > 0) {
    /* 2) Villa sorgusu — arama ile AYNI shape, YALNIZ gap villa_id'leri. */

    /* Bölge (grup-kökü genişletme — arama ile aynı mantık). */
    const regionIds = tokensToIds(regionTokens, regionOptionsRaw);
    let expandedRegions: string[] = [];
    if (regionIds.length > 0) {
      const byId = new Map(regionOptionsRaw.map((o) => [o.id, o]));
      const expanded = new Set<string>();
      for (const id of regionIds) {
        const loc = byId.get(id);
        const group = (loc?.filter_group_name || "").trim();
        const isGroupRoot = !!loc && !!group && loc.name === group;
        if (isGroupRoot) {
          for (const o of regionOptionsRaw) {
            if ((o.filter_group_name || "").trim() === group) expanded.add(o.id);
          }
        } else {
          expanded.add(id);
        }
      }
      expandedRegions = Array.from(expanded);
    }

    /* Villa tipi (villa_type_relations junction → villa_id intersection). */
    const typeIds = tokensToIds(typeTokens, typeOptionsRaw);
    let typeIdFilter: string[] | null = null;
    if (typeIds.length > 0) {
      const { data: rels } =
        await villaTypeRepository.findVillaTypeRelationsByTypeAndVillaIds(
          typeIds,
          gapVillaIds
        );
      const typeVillaIds = Array.from(
        new Set((rels || []).map((r) => String(r.villa_id)).filter(Boolean))
      );
      // Eşleşme yoksa boş sonuç (geçersiz uuid hatası vermemek için guard).
      typeIdFilter = typeVillaIds.length > 0 ? typeVillaIds : [
        "00000000-0000-0000-0000-000000000000",
      ];
    }

    const { data: villaData } = await villaAdminRepository.findShortGapVillas({
      gapVillaIds,
      expandedRegions,
      typeIdFilter,
      guests,
    });
    const rows: VillaRow[] = Array.isArray(villaData)
      ? (villaData as VillaRow[])
      : [];

    villas = rows.map((v) => {
      let images: string[] = [];
      const raw: VillaImageEmbed[] = Array.isArray(v.villa_images)
        ? v.villa_images
        : [];
      if (raw.length > 0) {
        const sorted = [...raw].sort((a, b) => {
          if (a?.is_cover) return -1;
          if (b?.is_cover) return 1;
          return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
        });
        images = sorted
          .map((i) => resolveVillaImageUrl(i?.image_url))
          .filter(
            (u): u is string => typeof u === "string" && u.trim().length > 0
          );
      }
      /* Tarih-bazlı fiyatlar — /arama ile AYNI StayPrice normalize'ı.
         price.engine her tarih için kapsayıcı aralığı kendi bulur. */
      const rawPrices: VillaPriceEmbed[] = Array.isArray(v.villa_prices)
        ? v.villa_prices
        : [];
      const prices: StayPrice[] = rawPrices
        .filter(
          (p): p is VillaPriceEmbed & { start_date: string; end_date: string } =>
            !!p &&
            typeof p.start_date === "string" &&
            typeof p.end_date === "string" &&
            p.start_date.length > 0 &&
            p.end_date.length > 0
        )
        .map((p) => ({
          price: Number(p.price || 0),
          currency: p.currency || "TRY",
          start_date: p.start_date,
          end_date: p.end_date,
        }));
      /* Kart başlangıç fiyatı = villa_prices MIN nightly (getStartingPrice,
         ortak mantık). villa.price kolonu KULLANILMAZ. */
      const starting = getStartingPrice(prices);
      return {
        id: v.id,
        slug: v.slug ?? "",
        title: v.title ?? "",
        location: v.location?.name ?? "",
        price: starting?.price ?? null,
        currency: starting?.currency || "TRY",
        images,
        badge: v.badge ?? undefined,
        bedrooms: v.bedrooms || 1,
        bathrooms: v.bathrooms || 1,
        guests: v.guests || 2,
        prices,
        cleaningFee: Number(v.cleaning_fee || 0),
        cleaningCurrency: v.cleaning_currency || "TRY",
        cleaningLimit: Number(v.cleaning_limit || 0),
      };
    });
  }

  /* 1 gap = 1 kart: filtreden geçen villalar id→veri map'i; render
     edilecek gap'ler (villası filtreyi geçmeyen gap'ler elenir). */
  const villaById = new Map(villas.map((v) => [v.id, v]));
  const visibleGaps = gapRows.filter((g) => villaById.has(g.villa_id));

  /* 🛡️ Kart rozeti (villa_translations.badge) TEK batch sorguda
     çözülür — `VillaList` / `DiscountCollection` ile AYNI desen,
     N+1 YOK. TR'de sorgu HİÇ atılmaz → TR çıktısı ve maliyeti
     BİREBİR eskisi gibi. Çeviri yoksa canonical rozet gösterilir. */
  const badgeByVillaId = await getVillaBadgesByLocale(
    villas.map((v) => v.id),
    locale
  );

  const basePath = `${localePrefix}/kisa-sureli-tarihler/${ay}/${nights}`;
  /* Sidebar — /arama FilterSidebar replikası ile aynı prop şekli.
     show_in_filter curation'ı bileşen içinde (regionGroups) uygulanır. */
  const sidebarRegionOptions: GapFilterOption[] = regionOptionsRaw.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    show_in_filter: o.show_in_filter,
    filter_group_name: o.filter_group_name,
  }));
  /* ===============================================================
     🛡️ VİLLA TİPİ ADI — SIDEBAR GÖRÜNÜMÜ İÇİN LOCALE-AWARE
     ===============================================================
     `AramaPageBody` / `KiralikVillalarPageBody` ile BİREBİR AYNI desen:
       • locale === "tr" → çeviri sorgusu HİÇ atılmaz; TR davranışı ve
         sorgu sayısı BİREBİR eskisi gibi.
       • EN/DE → `getVillaTypeNamesByLocale` (TEK batch `.in()` sorgusu,
         N+1 YOK) + `resolveTaxonomyName` (çeviri yoksa canonical TR
         adına düşer). Hata → `{}` → TR fallback.

     ⚠️ YALNIZ GÖRÜNEN `name` değişir. Canonical `typeOptionsRaw` dizisi
     (tokensToIds / URL token üretimi / `villa_type_relations` filtresi)
     DEĞİŞMEZ — sidebar'a ayrı bir kopya geçer.
     ⚠️ BÖLGELER çevrilmez (Phase 10I: özel isim → canonical) —
     `sidebarRegionOptions` yukarıda AYNEN korunur.
     =============================================================== */
  const typeNameByLocale: Record<string, TaxonomyNameByLocale> =
    locale !== DEFAULT_LOCALE && typeOptionsRaw.length > 0
      ? await getVillaTypeNamesByLocale(
          typeOptionsRaw.map((t) => String(t.id))
        ).catch(() => ({}))
      : {};
  const sidebarCategoryOptions: GapFilterOption[] = typeOptionsRaw.map((o) => ({
    id: o.id,
    name: resolveTaxonomyName(o.name, typeNameByLocale[String(o.id)], locale),
    slug: o.slug,
  }));
  /* Seçili durum: URL token'ları (slug|id) → canonical id dizileri. */
  const initialRegionIds = tokensToIds(regionTokens, regionOptionsRaw);
  const initialCategoryIds = tokensToIds(typeTokens, typeOptionsRaw);

  /* JSON-LD ItemList — kartlar gap-başına olsa da structured data
     villa-başına temiz kalsın diye slug'a göre dedupe edilir
     (aynı villa URL'i tek ListItem). buildItemList/SEO koduna dokunulmaz. */
  const itemListItems: { slug: string; title: string; image?: string }[] = [];
  const seenItemSlugs = new Set<string>();
  for (const g of visibleGaps) {
    const v = villaById.get(g.villa_id);
    if (!v || !v.slug || seenItemSlugs.has(v.slug)) continue;
    seenItemSlugs.add(v.slug);
    itemListItems.push({ slug: v.slug, title: v.title, image: v.images[0] });
  }
  const itemListLd = buildItemList(itemListItems);

  return (
    <main className="px-5 md:px-10 lg:px-16 py-10 md:py-14">
      <JsonLd data={itemListLd} />
      <div className="max-w-[1280px] mx-auto">
        <header className="mb-8 md:mb-10">
          <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
            {dict.heroEyebrow}
          </p>
          <h1 className="font-display font-medium text-[26px] md:text-[32px] text-[var(--color-stone-900)] mt-2 leading-tight tracking-[-0.02em]">
            {formatDictionaryString(dict.heroTitle, {
              month: monthLabel,
              n: nights,
            })}
          </h1>
          <p className="mt-2 text-[14px] text-[var(--color-stone-500)]">
            {formatDictionaryString(dict.heroSubtitle, {
              n: nights,
              count: visibleGaps.length,
            })}
          </p>
        </header>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          <aside className="lg:w-64 lg:flex-shrink-0">
            <GapFilterSidebar
              basePath={basePath}
              regionOptions={sidebarRegionOptions}
              categoryOptions={sidebarCategoryOptions}
              initial={{
                regions: initialRegionIds,
                categories: initialCategoryIds,
                guests,
              }}
              resultCount={visibleGaps.length}
              locale={locale}
            />
          </aside>

          <div className="flex-1 min-w-0">
            {visibleGaps.length === 0 ? (
              <div className="rounded-2xl border border-[var(--color-stone-200)] bg-white p-10 text-center text-[var(--color-stone-500)]">
                {dict.emptyBody}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {/* 1 gap = 1 kart: gap-başına döner; aynı villa birden çok
                    boşluğuyla birden çok kart olarak görünür. Her kart kendi
                    gap_start/gap_end ile fiyat + detay linki üretir. */}
                {visibleGaps.map((gap) => {
                  const villa = villaById.get(gap.villa_id);
                  if (!villa) return null;
                  const gapLabel = formatGapRange(
                    gap.gap_start,
                    gap.gap_end,
                    gapMonthName
                  );
                  return (
                    <div key={`${gap.villa_id}_${gap.gap_start}`}>
                      <VillaCard
                        id={villa.id}
                        slug={villa.slug}
                        title={villa.title}
                        location={villa.location}
                        price={villa.price ?? undefined}
                        currency={villa.currency}
                        images={villa.images}
                        badge={badgeByVillaId.get(villa.id) ?? villa.badge}
                        bedrooms={villa.bedrooms}
                        bathrooms={villa.bathrooms}
                        guests={villa.guests}
                        /* 🛡️ Boşluk tarihleriyle /arama ile birebir aynı
                           toplam fiyat (VillaCard calculateGrandTotal) +
                           detay linkine start/end continuity (VillaCard
                           detailHref otomatik ekler). Her kart KENDİ gap'i. */
                        stayStart={gap.gap_start}
                        stayEnd={gap.gap_end}
                        prices={villa.prices}
                        cleaningFee={villa.cleaningFee}
                        cleaningCurrency={villa.cleaningCurrency}
                        cleaningLimit={villa.cleaningLimit}
                        /* 🛡️ Kart-içi gap bilgi alanı + "Hemen Rezervasyon
                           Yap" CTA verisi (VillaCard butonun altında render
                           eder). Yalnız bu sayfada (prop verildiği için). */
                        reserveInfo={
                          villa.slug
                            ? {
                                label: gapLabel,
                                nights,
                                href: `${localePrefix}/rezervasyon/${villa.slug}?start=${gap.gap_start}&end=${gap.gap_end}`,
                              }
                            : undefined
                        }
                        /* 🛡️ Kart metinleri + detay linki locale-aware. */
                        locale={locale}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
