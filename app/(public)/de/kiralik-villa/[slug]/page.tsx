import type { Metadata } from "next";
import { cache } from "react";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import { getVillaBySlug } from "@/app/services/villa.service";
import {
  getVillaTranslatedDescription,
  getVillaTranslatedSeoDescription,
  /* 🛡️ PHASE 10B, Section 11 — SEO title override (varsa). */
  getVillaTranslatedSeoTitle,
} from "@/lib/i18n/get-villa-translation.server";
/* 🛡️ PHASE 8D-2 — batch translation okuma (8D-1) + generic fallback. */
import {
  getTranslationsForParents,
  resolveTranslatedField,
} from "@/lib/i18n/get-translation.server";
import {
  getCachedSettings,
  getCachedVillaReviews,
  getCachedVillaReviewStats,
} from "@/lib/cache.helpers";
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { stripHtml } from "@/lib/html-sanitize";
/* 🛡️ PHASE 8D-2 — location/features/rules/priceIncludes/distances ham
   veri (TR sayfasındaki AYNI servisler, DEĞİŞTİRİLMEDİ). */
import { getVillaDistances } from "@/app/services/villa-distance.service";
import {
  getVillaFeaturesByVilla,
  type Feature,
} from "@/app/services/villa-feature.service";
import { getRuleItemsByVilla } from "@/app/services/rule-item.service";
import { getPriceIncludeItemsByVilla } from "@/app/services/price-include-item.service";
import { getDistanceIconKey } from "@/lib/distance.helper";
import { getTranslatedDistanceLabel } from "@/lib/distance-label.helper";
import type { TranslatedDistance } from "@/app/components/villa/VillaDistancesSection";
import type { TranslatedFeature } from "@/app/components/villa/VillaFeaturesSection";
import type {
  TranslatedPriceInclude,
  TranslatedRule,
} from "@/app/components/villa/VillaPriceIncludesAndRulesSection";

/* ===============================================================
   🛡️ PHASE 10G — TR / EN / DE TASARIM PARİTESİ
   ===============================================================
   Bu sayfa ARTIK TR ile AYNI gövdeyi render ediyor:
   `app/components/villa/VillaDetailBody.tsx` (TR'nin kendi
   gövdesinden, DOM/CSS DEĞİŞTİRİLMEDEN çıkarılan ortak component).
   Önceki tek-kolon `max-w-3xl` düzeni + ayrı başlık bloğu KALDIRILDI;
   iki-kolon `max-w-[1280px]` grid + VillaDetailTabs + sağ kolon
   (rezervasyon formu, giriş/çıkış saatleri, "Nerede?" haritası) +
   yorumlar + "Benzer Villalar" TR ile birebir aynı sırada geliyor.

   Tüm UI metinleri i18n dictionary'den çözülür (hardcoded TR metin
   KALMADI). DB-backed içerik (features/rules/priceIncludes/location/
   badge) Phase 8D-1'in batch helper'ı ile KOLEKSİYON BAŞINA TEK
   sorguda çözülür; villa ADI çevrilmez (özel isim → canonical
   `villa.title`).

   🛡️ ICON KEY (kritik): `getDistanceIconKey` TÜRKÇE anahtar kelimeye
   bağlı — icon key HER ZAMAN orijinal (TR) `distance.title`'dan
   hesaplanır, ÇEVRİLMİŞ `displayTitle`'dan DEĞİL.

   ROBOTS: BU FAZDA DEĞİŞMEDİ — hâlâ koşulsuz
   `{index:false, follow:false}`.
   =============================================================== */
import VillaDetailBody from "@/app/components/villa/VillaDetailBody";

/* 🛡️ Gallery/PriceList/AvailabilityInlineCalendar/BookingSidebar/
   MobileBookingCta'nın ihtiyaç duyduğu veri: TR sayfasındaki AYNI
   servisler/helper'lar, AYNI argümanlar. */
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDiscounts } from "@/app/services/villa-discount.service";
import {
  resolveVillaImageUrl,
  resolveAssetUrlVersioned,
} from "@/lib/storage.helpers";
import {
  fetchExternalCalendarStringsForVilla,
  EMPTY_EXTERNAL_STRING_ARRAYS,
} from "@/lib/external-calendar.public.helper";
import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";
/* 🛡️ PHASE 10B, Section 10 — JSON-LD (TR'nin KULLANDIĞI AYNI builder'lar). */
import {
  buildBreadcrumb,
  buildVacationRental,
} from "@/app/components/seo/StructuredData";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isValidYmd } from "@/lib/availability.helper";

/* ⚡ PERF — generateMetadata + page body aynı request içinde aynı
   villayı çağırır; React cache() ile TEK DB sorgusu paylaşılır. */
const getVillaBySlugCached = cache((slug: string) => getVillaBySlug(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const villa = await getVillaBySlugCached(slug);

  if (!villa) {
    return {
      title: "Villa nicht gefunden",
      robots: { index: false, follow: false },
    };
  }

  /* 🛡️ VİLLA ADI ÇEVRİLMEZ — özel isimdir, her locale'de canonical
     `villa.title` kullanılır. (seo_title çevirisi AYNEN devam eder.) */
  const fallbackTitle = villa.title;
  const translatedSeoTitle = await getVillaTranslatedSeoTitle(
    villa.id,
    villa.seo_title,
    "de"
  );
  const title =
    (translatedSeoTitle && translatedSeoTitle.trim()) || fallbackTitle;
  const description = await getVillaTranslatedSeoDescription(
    villa.id,
    villa.seo_description,
    villa.description,
    "de"
  );
  const trCanonicalPath = `/kiralik-villa/${villa.slug || slug}`;
  const settings = await getCachedSettings().catch(() => null);
  const { canonical, languages } = buildLocaleAlternates(
    trCanonicalPath,
    "de"
  );

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — KOŞULSUZ `noindex` KALDIRILDI.
     Bu override Phase 4A/6B/7C'nin GEÇİCİ `LocaleRouteComingSoon`
     placeholder'ından kalmıştı (bkz. app/sitemap.ts, Phase 7D notu);
     sayfa Phase 10B'den beri TR ile AYNI, tam çevrilmiş gerçek içeriği
     render ediyor ve sitemap TR entry'sine bu URL'leri hreflang
     alternate olarak veriyor. Index politikası artık root layout'un
     `settings.robots_index/robots_follow` ayarından miras alınır —
     `multilingual_enabled` kapalıyken route zaten
     `requirePublicLocaleEnabled()` ile 404 döner.
     ⚠️ Villa BULUNAMADIĞINDA dönen `noindex` (yukarıda) DEĞİŞMEDİ. */
  return {
    title,
    description,
    alternates: isMultilingualEnabled(settings)
      ? { canonical, languages }
      : { canonical },
    openGraph: {
      title,
      type: "website",
      url: canonical,
    },
  };
}

export default async function DeVillaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /* 🛡️ DATE CONTINUITY — TR sayfasındaki AYNI desen (/arama → detay
     geçişinde URL ile taşınan giriş/çıkış tarihleri). */
  searchParams?: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
}) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  const dict = getDictionary("de");

  const { slug } = await params;

  const sp = searchParams ? await searchParams : {};
  const rawStart = Array.isArray(sp?.start) ? sp.start[0] : sp?.start;
  const rawEnd = Array.isArray(sp?.end) ? sp.end[0] : sp?.end;
  const initialStart = isValidYmd(rawStart) ? rawStart : null;
  const initialEnd = isValidYmd(rawEnd) ? rawEnd : null;
  const hasInitialRange =
    !!initialStart && !!initialEnd && initialStart < initialEnd;

  const villa = await getVillaBySlugCached(slug);
  if (!villa) {
    /* 🛡️ PHASE 10B, Section 13 — TR sayfasının "Villa bulunamadı"
       bloğuyla AYNI desen/stil, locale-aware metinle. */
    return (
      <section className="section-narrow py-32 text-center">
        <p className="eyebrow !text-[var(--color-stone-400)]">404</p>
        <h2 className="font-display text-3xl text-[var(--color-stone-900)] mt-3">
          {dict.villa.notFoundTitle}
        </h2>
        <p className="text-[var(--color-stone-500)] mt-3">
          {dict.villa.notFoundBody}
        </p>
        <a href="/de/arama" className="btn-ghost mt-6 inline-flex">
          {dict.villa.notFoundCta}
        </a>
      </section>
    );
  }

  /* 🛡️ VİLLA ADI ÇEVRİLMEZ — canonical `villa.title`. */
  const title = villa.title;
  const description = await getVillaTranslatedDescription(
    villa.id,
    villa.description,
    "de"
  );

  const youtubeVideos: VillaYouTubeVideo[] = normalizeYouTubeVideos(
    villa.youtube_videos
  );

  const [distances, features, rules, priceIncludes] = await Promise.all([
    getVillaDistances(villa.id),
    getVillaFeaturesByVilla(villa.id) as Promise<Feature[]>,
    getRuleItemsByVilla(villa.id),
    getPriceIncludeItemsByVilla(villa.id),
  ]);

  const [
    images,
    prices,
    discounts,
    externalBlocks,
    settings,
    reviews,
    reviewStats,
  ] = await Promise.all([
    getVillaImages(villa.id),
    getVillaPrices(villa.id),
    getVillaDiscounts(villa.id),
    fetchExternalCalendarStringsForVilla(villa.id).catch(
      () => EMPTY_EXTERNAL_STRING_ARRAYS
    ),
    getCachedSettings(),
    getCachedVillaReviews(villa.id),
    getCachedVillaReviewStats(villa.id),
  ]);

  /* 🛡️ PHASE 8D-2 — koleksiyon başına TAM 1 batch çeviri sorgusu.
     ⚠️ MESAFELER BU BATCH'TE YOKTUR: villa başına mesafe çevirisi
     KALDIRILDI (bkz. aşağıdaki `translatedDistances`). Mesafe
     başlıkları DB'den değil, statik `distanceLabels` dictionary'sinden
     çözülür → mesafeler için SIFIR sorgu. */
  const [featureTranslations, ruleTranslations, priceIncludeTranslations] =
    await Promise.all([
      getTranslationsForParents(
        "villa_feature",
        features.map((f) => f.id),
        "de"
      ),
      getTranslationsForParents("rule_item", rules.map((r) => r.id), "de"),
      getTranslationsForParents(
        "price_include_item",
        priceIncludes.map((p) => p.id),
        "de"
      ),
    ]);

  /* 🛡️ ICON KEY — ORİJİNAL (TR) d.title'dan hesaplanır. */
  const translatedDistances: TranslatedDistance[] = distances.map((d) => ({
    id: d.id,
    /* 🛡️ PHASE 10D BATCH 4 — 12 CANONICAL başlık için statik i18n
       dictionary (`getTranslatedDistanceLabel` → `distanceLabels`).
       Canonical OLMAYAN (legacy/custom) başlık helper'ın kendi
       fallback'i ile AYNEN döner. Villa başına DB çevirisi YOKTUR. */
    displayTitle: getTranslatedDistanceLabel(d.title, "de"),
    /* 🛡️ Mesafe DEĞERİ hiçbir zaman çevrilmez. */
    displayDistance: d.distance,
    iconKey: getDistanceIconKey(d.title),
  }));

  const translatedFeatures: TranslatedFeature[] = features.map((f) => ({
    id: f.id,
    displayName: resolveTranslatedField(
      featureTranslations.get(f.id)?.name,
      f.name
    ),
  }));

  const translatedRules: TranslatedRule[] = rules.map((r) => ({
    id: r.id,
    displayTitle: resolveTranslatedField(
      ruleTranslations.get(r.id)?.title,
      r.title
    ),
  }));

  const translatedPriceIncludes: TranslatedPriceInclude[] = priceIncludes.map(
    (p) => ({
      id: p.id,
      displayTitle: resolveTranslatedField(
        priceIncludeTranslations.get(p.id)?.title,
        p.title
      ),
    })
  );

  /* 🛡️ PHASE 10I — BÖLGE ADI ÇEVRİLMEZ: Kalkan/Kaş/Fethiye/Çavdır gibi
     bölge adları ÖZEL İSİMDİR, EN/DE karşılıkları yoktur. Her locale'de
     canonical `villa.location` (villa_locations.name) gösterilir.
     (`villa_location` çeviri okuması KALDIRILDI — bkz. Phase 10I.) */
  const locationName = villa.location;

  /* 🛡️ TR sayfasındaki AYNI watermark objesi. */
  const watermark = {
    logo:
      resolveAssetUrlVersioned(
        settings?.watermark_logo,
        settings?.updated_at
      ) ?? null,
    enabled: settings?.watermark_enabled ?? false,
    opacity: settings?.watermark_opacity ?? 0.15,
    position: settings?.watermark_position ?? "center",
    size: settings?.watermark_size ?? 25,
  } as const;

  /* 🛡️ Bucket-fix — TR sayfasındaki AYNI resolveVillaImageUrl reuse. */
  const imageUrls = images
    .map((img) => resolveVillaImageUrl(img.image_url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  /* 🛡️ TR'nin AYNI saf minPrice reduce'u. */
  const minPrice = prices?.length
    ? prices.reduce(
        (acc, pr) =>
          pr.price > 0 && (acc === null || pr.price < acc.price)
            ? { price: Number(pr.price), currency: pr.currency || "TRY" }
            : acc,
        null as { price: number; currency: string } | null
      )
    : null;

  /* 🛡️ PHASE 10B, Section 10 — JSON-LD (locale="de"). */
  const vacationRentalLd = buildVacationRental({
    slug: villa.slug || slug,
    title,
    description: stripHtml(description || villa.description),
    images: imageUrls,
    locationName: locationName || null,
    latitude: typeof villa.latitude === "number" ? villa.latitude : null,
    longitude: typeof villa.longitude === "number" ? villa.longitude : null,
    guests: villa.guests,
    bedrooms: villa.bedrooms,
    bathrooms: villa.bathrooms,
    features: translatedFeatures.map((f) => f.displayName).filter(Boolean),
    priceFrom: minPrice
      ? { amount: minPrice.price, currency: minPrice.currency }
      : null,
    aggregateRating:
      reviewStats.count > 0
        ? { ratingValue: reviewStats.average, reviewCount: reviewStats.count }
        : null,
    locale: "de",
  });

  const breadcrumbLd = buildBreadcrumb(
    [
      { name: dict.header.home, url: "/" },
      /* 🛡️ SEO — robots-engelli /de/arama yerine indexlenebilir arşiv. */
      { name: dict.header.villas, url: "/de/kiralik-villalar" },
      { name: title },
    ],
    "de"
  );

  return (
    <VillaDetailBody
      locale="de"
      villa={villa}
      villaTitle={title}
      displayLocation={locationName}
      displayDescription={description}
      imageUrls={imageUrls}
      watermark={watermark}
      youtubeVideos={youtubeVideos}
      prices={prices}
      discounts={discounts}
      externalBlocks={externalBlocks}
      distances={translatedDistances}
      features={translatedFeatures}
      rules={translatedRules}
      priceIncludes={translatedPriceIncludes}
      reviews={reviews}
      reviewStats={reviewStats}
      orphanGapRuleEnabled={settings?.orphan_gap_rule_enabled ?? true}
      /* 🔄 Mobil CTA'nın WhatsApp/telefon aksiyonları — ham settings
         alanları; href türetmesi VillaDetailBody'de TEK yerde. */
      contactPhone={settings?.phone ?? null}
      contactWhatsappLink={settings?.whatsapp_link ?? null}
      initialStart={hasInitialRange ? initialStart : undefined}
      initialEnd={hasInitialRange ? initialEnd : undefined}
      bookingSidebarId="booking-sidebar-de"
      vacationRentalLd={vacationRentalLd}
      breadcrumbLd={breadcrumbLd}
    />
  );
}
