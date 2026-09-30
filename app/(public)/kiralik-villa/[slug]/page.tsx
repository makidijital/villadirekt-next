import type { Metadata } from "next";
import { cache } from "react";

/* 🛡️ FAZ 19 — distance icon key (TÜRKÇE anahtar kelimeye bağlı; her
   zaman ORİJİNAL TR title'dan hesaplanır). */
import { getDistanceIconKey } from "@/lib/distance.helper";

/* ===============================================================
   🛡️ PHASE 10G — TR / EN / DE TASARIM PARİTESİ
   ===============================================================
   Bu sayfanın GÖVDESİ (galeri + tab band + konaklama düzeni + havuz +
   dahil/kurallar + yorumlar + sağ kolon + mobile CTA + benzer villalar)
   `app/components/villa/VillaDetailBody.tsx`e TAŞINDI — DOM/CSS/sıra/
   koşullar BİREBİR aynı, yalnız artık EN/DE sayfaları da AYNI
   component'i render ediyor. Bu dosyada kalan: veri okuma (TÜM
   servisler/argümanlar DEĞİŞMEDİ), SEO metadata, JSON-LD üretimi ve
   "Villa bulunamadı" bloğu.

   TR'de çeviri katmanı HİÇ ÇALIŞMAZ: `displayTitle/displayName/
   displayDistance` alanları doğrudan orijinal TR değerlerle doldurulur
   (ek DB sorgusu YOK). Villa adı zaten hiçbir locale'de çevrilmez.
   =============================================================== */
import VillaDetailBody from "@/app/components/villa/VillaDetailBody";
import type { TranslatedDistance } from "@/app/components/villa/VillaDistancesSection";
import type { TranslatedFeature } from "@/app/components/villa/VillaFeaturesSection";
import type {
  TranslatedPriceInclude,
  TranslatedRule,
} from "@/app/components/villa/VillaPriceIncludesAndRulesSection";

import { getVillaBySlug } from "@/app/services/villa.service";
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import {
  resolveVillaImageUrl,
  resolveAssetUrlVersioned,
} from "@/lib/storage.helpers";
/* 🛡️ Rich text — SEO meta/JSON-LD'de düz metin (render'daki sanitize
   artık VillaDetailBody içinde). */
import { stripHtml } from "@/lib/html-sanitize";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDiscounts } from "@/app/services/villa-discount.service";
import { getVillaDistances } from "@/app/services/villa-distance.service";
import { getVillaFeaturesByVilla } from "@/app/services/villa-feature.service";
import { getRuleItemsByVilla } from "@/app/services/rule-item.service";
import { getPriceIncludeItemsByVilla } from "@/app/services/price-include-item.service";
/* 🛡️ FAZ 33 — Villa reviews + global settings (cached). */
import {
  getCachedSettings,
  getCachedVillaReviews,
  getCachedVillaReviewStats,
} from "@/lib/cache.helpers";
/* 🛡️ PHASE 7C — locale-aware canonical + hreflang (yalnız
   generateMetadata içinde kullanılır; body/render akışına dokunmaz). */
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";

import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";

/* 🛡️ FAZ 56H-B/C — External iCal availability arrays. */
import {
  fetchExternalCalendarStringsForVilla,
  EMPTY_EXTERNAL_STRING_ARRAYS,
} from "@/lib/external-calendar.public.helper";

import {
  buildBreadcrumb,
  buildVacationRental,
} from "@/app/components/seo/StructuredData";

import { isValidYmd } from "@/lib/availability.helper";

type Feature = {
  id: string;
  name: string;
};

/* ============================================================
   🔥 SEO METADATA
   ============================================================
   - title fallback: villa.title
   - description fallback: villa.description'dan kısa excerpt
   - robots: villa.noindex true ise noindex,nofollow; aksi index,follow
   - OpenGraph image: villa kapak görseli
   ============================================================ */
function makeExcerpt(text: string | undefined, max = 160) {
  const clean = (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

/* ⚡ PERF — getVillaBySlug request-scoped dedupe.
   generateMetadata + page aynı request içinde aynı villayı çağırır;
   React cache() ile TEK DB sorgusu paylaşılır. Dönen DTO, null/404
   davranışı ve mapVilla çıktısı BİREBİR aynı (yalnız memoize katmanı). */
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
      title: "Villa bulunamadı",
      robots: { index: false, follow: false },
    };
  }

  const title =
    (villa.seo_title && villa.seo_title.trim()) ||
    villa.title ||
    "Villa";

  const description =
    (villa.seo_description && villa.seo_description.trim()) ||
    makeExcerpt(stripHtml(villa.description), 160);

  // OG: kapak görseli (mapVilla images sıralaması is_cover öncelikli)
  const cover =
    villa.images && villa.images.length > 0
      ? villa.images[0]
      : undefined;

  const robots = villa.noindex
    ? { index: false, follow: false }
    : { index: true, follow: true };

  /* 🛡️ PHASE 7C — CANONICAL + HREFLANG (Phase 7B helper reuse).
     `buildLocaleAlternates` TEK kaynak — URL'ler elle string
     birleştirilerek YENİDEN üretilmedi. `multilingual_enabled=false`
     iken (bugün production) EN/DE route'ları zaten Phase 4A gate'i
     (`requirePublicLocaleEnabled`) tarafından notFound() ile
     kapatılıyor; bu yüzden flag false iken hreflang kümesine
     var-olmayan/404 dönecek EN/DE URL'leri EKLENMEZ — yalnız
     `canonical` (TR path, ÖNCEKİ DAVRANIŞLA BYTE-IDENTICAL) döner.
     Flag true olduğunda tr/en/de/x-default karşılıklı üretilir. */
  const canonicalPath = `/kiralik-villa/${villa.slug || slug}`;
  const seoSettings = await getCachedSettings().catch(() => null);
  const { canonical, languages } = buildLocaleAlternates(
    canonicalPath,
    "tr"
  );

  return {
    title,
    description,
    robots,
    alternates: isMultilingualEnabled(seoSettings)
      ? { canonical, languages }
      : { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function VillaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /* 🛡️ DATE CONTINUITY — /arama → detail geçişinde URL ile
     taşınan giriş/çıkış tarihleri. BookingSidebar'a initialStart
     /initialEnd olarak iletilir; refresh-safe (URL source-of-truth).
     Geçersiz/eksikse BookingSidebar boş state ile açılır (eski davranış). */
  searchParams?: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
}) {
  const { slug } = await params;

  const sp = searchParams ? await searchParams : {};
  const rawStart = Array.isArray(sp?.start) ? sp.start[0] : sp?.start;
  const rawEnd = Array.isArray(sp?.end) ? sp.end[0] : sp?.end;
  const initialStart = isValidYmd(rawStart) ? rawStart : null;
  const initialEnd = isValidYmd(rawEnd) ? rawEnd : null;
  /* start < end değilse defensive olarak ikisini de düşür (Hero
     formatDate ve /arama sayfası aynı string-level lexicographic
     compare kullanıyor → drift yok). */
  const hasInitialRange =
    !!initialStart && !!initialEnd && initialStart < initialEnd;

  const villa = await getVillaBySlugCached(slug);

  if (!villa) {
    return (
      <section className="section-narrow py-32 text-center">
        <p className="eyebrow !text-[var(--color-stone-400)]">404</p>
        <h2 className="font-display text-3xl text-[var(--color-stone-900)] mt-3">
          Villa bulunamadı
        </h2>
        <p className="text-[var(--color-stone-500)] mt-3">
          Aradığın villa kaldırılmış veya taşınmış olabilir.
        </p>
        <a href="/arama" className="btn-ghost mt-6 inline-flex">
          Tüm villalara dön
        </a>
      </section>
    );
  }

  /* 🛡️ YouTube videos — VillaDTO.youtube_videos zaten normalize edilmiş
     (villa.service > mapVilla). Defansif olarak parent component-side
     bir kez daha normalize edilir; backward-compat (DTO field eksikse).
     Saf sync map; villa.id'ye bağlı değil. */
  const youtubeVideos: VillaYouTubeVideo[] = normalizeYouTubeVideos(
    villa.youtube_videos
  );

  /* ⚡ PERF — villa yüklendikten sonra çalışan TÜM bağımsız okumalar
     tek paralel dalgada toplandı (önceki sıralı await zinciri yerine).
     Veri çıktıları, sıralama ve fallback davranışı BİREBİR korunur:
       • images/prices/distances/features/rules/priceIncludes: aynı
         servisler, aynı argüman (villa.id), aynı sonuç sırası.
       • externalBlocks: helper fail-safe + .catch() ile eski try/catch
         davranışı aynen (hata → EMPTY_EXTERNAL_STRING_ARRAYS).
       • settings: getCachedSettings (getPublicSettings sarmalayıcısı) —
         watermark/logo/footer alanları ve admin invalidation korunur.
       • reviews/reviewStats: zaten cached; aynı "villa-reviews" tag. */
  const [
    images,
    prices,
    discounts,
    distances,
    features,
    rules,
    priceIncludes,
    externalBlocks,
    settings,
    reviews,
    reviewStats,
  ] = await Promise.all([
    getVillaImages(villa.id),
    getVillaPrices(villa.id),
    getVillaDiscounts(villa.id),
    getVillaDistances(villa.id),
    getVillaFeaturesByVilla(villa.id) as Promise<Feature[]>,
    getRuleItemsByVilla(villa.id),
    getPriceIncludeItemsByVilla(villa.id),
    fetchExternalCalendarStringsForVilla(villa.id).catch(
      () => EMPTY_EXTERNAL_STRING_ARRAYS
    ),
    getCachedSettings(),
    getCachedVillaReviews(villa.id),
    getCachedVillaReviewStats(villa.id),
  ]);

  const watermark = {
    /* 🛡️ Watermark logo, diğer site-asset'ler (site_logo/footer_logo/hero/
       favicon) ile AYNI şekilde resolveAssetUrl'den geçer: bucket-relative
       path → R2/CDN public URL; legacy full URL pass-through. Ham path
       <img src>'e gidip relative çözülünce 404 oluyordu (watermark görünmüyor). */
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

  /* 🛡️ Bucket-fix — resolveVillaImageUrl: image_url HEM FULL URL (legacy)
     HEM relative path (Phase B sonrası) olabilir. villa-images bucket'ından
     doğru URL üretir. Ham path Gallery component'ine veya JSON-LD'ye
     gitmesin. */
  const imageUrls = images
    .map((img) => resolveVillaImageUrl(img.image_url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  /* 🛡️ JSON-LD structured data — SEO için fonksiyonel kazanç.
     Fake rating/aggregateRating üretilmez; yalnız var olan villa
     verisinden VacationRental + BreadcrumbList markup'ı çıkarılır. */
  const minPrice = prices?.length
    ? prices.reduce(
        (acc, p) =>
          p.price > 0 && (acc === null || p.price < acc.price)
            ? { price: Number(p.price), currency: p.currency || "TRY" }
            : acc,
        null as { price: number; currency: string } | null
      )
    : null;

  const vacationRentalLd = buildVacationRental({
    slug: villa.slug || slug,
    title: villa.title,
    description: stripHtml(villa.description),
    images: imageUrls,
    locationName: villa.location || null,
    latitude:
      typeof villa.latitude === "number" ? villa.latitude : null,
    longitude:
      typeof villa.longitude === "number" ? villa.longitude : null,
    guests: villa.guests,
    bedrooms: villa.bedrooms,
    bathrooms: villa.bathrooms,
    features: features.map((f) => f.name).filter(Boolean),
    priceFrom: minPrice
      ? { amount: minPrice.price, currency: minPrice.currency }
      : null,
    /* 🛡️ FAZ 33 — AggregateRating (SEO).
       Yalnız approved review varsa (count > 0) JSON-LD'ye gömülür.
       Fake / placeholder ÜRETİLMEZ; stats service approved-only
       hesaplar. */
    aggregateRating:
      reviewStats.count > 0
        ? {
            ratingValue: reviewStats.average,
            reviewCount: reviewStats.count,
          }
        : null,
    /* 🛡️ PHASE 7D — yalnız inLanguage:"tr-TR" için. Diğer TÜM alanlar
       DEĞİŞMEDİ. */
    locale: "tr",
  });

  const breadcrumbLd = buildBreadcrumb(
    [
      { name: "Ana sayfa", url: "/" },
      /* 🛡️ SEO — "Villalar" robots-engelli /arama yerine indexlenebilir
         arşive (`/kiralik-villalar`) işaret eder. */
      { name: "Villalar", url: "/kiralik-villalar" },
      { name: villa.title },
    ],
    /* 🛡️ PHASE 7D — yalnız inLanguage:"tr-TR" için. */
    "tr"
  );

  /* 🛡️ PHASE 10G — "caller resolves, component renders": TR'de çeviri
     katmanı HİÇ çalışmaz, orijinal değerler display alanlarına doğrudan
     kopyalanır (ek sorgu YOK, çıktı öncekiyle BİREBİR aynı).
     🛡️ ICON KEY — ORİJİNAL (TR) `d.title`'dan hesaplanır. */
  const displayDistances: TranslatedDistance[] = distances.map((d) => ({
    id: d.id,
    displayTitle: d.title,
    displayDistance: d.distance,
    iconKey: getDistanceIconKey(d.title),
  }));
  const displayFeatures: TranslatedFeature[] = features.map((f) => ({
    id: f.id,
    displayName: f.name,
  }));
  const displayRules: TranslatedRule[] = rules.map((r) => ({
    id: r.id,
    displayTitle: r.title,
  }));
  const displayPriceIncludes: TranslatedPriceInclude[] = priceIncludes.map(
    (p) => ({
      id: p.id,
      displayTitle: p.title,
    })
  );

  return (
    <VillaDetailBody
      locale="tr"
      villa={villa}
      villaTitle={villa.title}
      displayLocation={villa.location}
      displayDescription={villa.description}
      imageUrls={imageUrls}
      watermark={watermark}
      youtubeVideos={youtubeVideos}
      prices={prices}
      discounts={discounts}
      externalBlocks={externalBlocks}
      distances={displayDistances}
      features={displayFeatures}
      rules={displayRules}
      priceIncludes={displayPriceIncludes}
      reviews={reviews}
      reviewStats={reviewStats}
      orphanGapRuleEnabled={settings?.orphan_gap_rule_enabled ?? true}
      /* 🔄 Mobil CTA'nın WhatsApp/telefon aksiyonları — ham settings
         alanları; href türetmesi VillaDetailBody'de TEK yerde. */
      contactPhone={settings?.phone ?? null}
      contactWhatsappLink={settings?.whatsapp_link ?? null}
      initialStart={hasInitialRange ? initialStart : undefined}
      initialEnd={hasInitialRange ? initialEnd : undefined}
      bookingSidebarId="booking-sidebar"
      vacationRentalLd={vacationRentalLd}
      breadcrumbLd={breadcrumbLd}
    />
  );
}
