import { notFound } from "next/navigation";
import {
  MapPin,
  /* Users / Bed / Bath import'ları artık VillaInfoBar içinde
     kullanılıyor; eski duplicate header silindiği için bu sayfada
     gerek kalmadı. */
  Wallet,
  Map,
  Waves,
  Check,
  ExternalLink,
  /* 🛡️ FAZ 19 — distance icon mapping */
  UtensilsCrossed,
  ShoppingBag,
  Plane,
  Bus,
  Building2,
  Cross,
  Fuel,
  GraduationCap,
  /* 🛡️ FAZ 24 — tourism document trust badge */
  ShieldCheck,
  /* 🛡️ FAZ 31 — off-market badge */
  EyeOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  getDistanceIconKey,
  DISTANCE_TONE_MAP,
  type DistanceIconKey,
} from "@/lib/distance.helper";

import PriceList from "@/app/components/villa/PriceList";
import Gallery from "@/app/components/villa/Gallery";
import VillaInfoBar from "@/app/components/villa/VillaInfoBar";
import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";
import BookingSidebar from "@/app/components/villa/BookingSidebar";
import AvailabilityInlineCalendar from "@/app/components/villa/AvailabilityInlineCalendar";

import { getVillaByPrivateToken } from "@/app/services/villa.service";
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import {
  resolveVillaImageUrl,
  resolveAssetUrlVersioned,
} from "@/lib/storage.helpers";
/* 🛡️ Rich text — render'da XSS-güvenli HTML. */
import { sanitizeHtml } from "@/lib/html-sanitize";
import { extractSafeMapEmbedSrc } from "@/lib/map-embed.helper";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDistances } from "@/app/services/villa-distance.service";
import { getVillaFeaturesByVilla } from "@/app/services/villa-feature.service";
import { getRuleItemsByVilla } from "@/app/services/rule-item.service";
import { getPriceIncludeItemsByVilla } from "@/app/services/price-include-item.service";
import { getPublicSettings } from "@/app/services/settings.service";

import { isValidYmd } from "@/lib/availability.helper";
import { formatPoolDimension } from "@/lib/dimension.helper";
/* 🛡️ PHASE 10E BATCH 5 — TR literal tekrarı kaldırıldı. */
import { buildPoolCards } from "@/lib/pool.helper";
import { getPoolTypeLabel } from "@/lib/pool-label.helper";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den.
   Bölüm başlıkları `villa` / `pool` / `map` / `villaTabs` / `price` /
   `layout` namespace'lerinden REUSE edilir; yalnız bu sayfaya ÖZGÜ
   metinler `privateVilla` namespace'indedir. Token resolve, veri
   yükleme, fiyat/müsaitlik mantığı ve `notFound()` DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ ÇOKLU DİL — DB kaynaklı içerik alanları (açıklama / özellikler /
   kurallar / fiyata dahiller) için MEVCUT okuma katmanı. Yeni bir
   translation sistemi veya DB katmanı YAZILMADI; `/en|de/kiralik-villa/
   [slug]` sayfasındaki desen BİREBİR reuse edilir.
     • `locale === "tr"` → bu helper'ların hepsi DB'ye HİÇ SORGU ATMAZ
       (bkz. get-translation.server.ts "TR KISAYOLU") → TR davranışı ve
       sorgu sayısı BİREBİR eskisi gibi.
     • EN/DE → koleksiyon başına TEK batch `.in()` sorgusu (N+1 YOK);
       çeviri yoksa canonical TR değerine düşülür. */
import { getVillaTranslatedDescription } from "@/lib/i18n/get-villa-translation.server";
import {
  getTranslationsForParents,
  resolveTranslatedField,
} from "@/lib/i18n/get-translation.server";
/* 🛡️ Mesafe başlıkları DB'den DEĞİL, statik `distanceLabels`
   dictionary'sinden çözülür (Phase 10D Batch 4 + migration 090) →
   mesafeler için SIFIR ek sorgu. TR'de identity-map (byte-identical). */
import { getTranslatedDistanceLabel } from "@/lib/distance-label.helper";

/* ===============================================================
   🛡️ FAZ 31 — PRIVATE / TEMPORARY VILLA URL ROUTE
   ===============================================================
   `/v/[token]` — off-market preview route.

   ⚠️ ROUTE PATH KARARI:
     Spec'te `/p/[token]` istenmişti; ancak `app/p/[slug]/page.tsx`
     mevcut CMS sayfaları için zaten ALAN bir dynamic segment.
     Next.js aynı path'te iki dinamik segment'a build-time hata verir.
     Bu yüzden `/v/[token]` ("v" = villa) kullanıldı:
       - Premium / kısa (Bitly hissi)
       - CMS slug sistemini DOKUNULMAZ bırakır
       - Pattern: domain.com/v/8fK29QaLm2Px91AbCdE

   AMAÇ:
     - Pasif (is_active=false) villalar dahil, secret token bilen
       herkesin villayı görüntüleyebilmesi.
     - Public listelerde (homepage, /arama, kategori, sitemap, search)
       ASLA görünmez — bu route ayrı bir erişim katmanı.

   SEO:
     - robots: { index: false, follow: false } (metadata)
     - JSON-LD structured data render edilmez (SEO yüzeyi yok)
     - breadcrumb SEO yok
     - canonical yok
     - sitemap'e eklenmez

   CACHE:
     - export const dynamic = "force-dynamic"
       → token rotasyonu / revoke senaryosunda anlık yansıma
       → kullanıcı paylaşılan link açtığında her zaman fresh state

   REUSE:
     - Aynı Gallery / BookingSidebar / AvailabilityInlineCalendar /
       PriceList component'leri
     - Aynı service helper'ları
     - JSON-LD enjekte EDİLMEZ (off-market kayıt SEO'ya girmesin)

   DOKUNULMAYAN:
     - reservation engine, pricing engine, availability, BookingSidebar
       logic, gallery, image upload, slug sistemi (villa + CMS), sort,
       permissions, cache, FAQ, tourism doc, minimum stay, map picker,
       search.
     - /kiralik-villa/[slug] route TAMAMEN dokunulmadı.
     - /p/[slug] CMS route TAMAMEN dokunulmadı.
   =============================================================== */

/* 🛡️ Force-dynamic: token-based access; route segment cache YOK.
   Admin pasif→aktif veya token revoke senaryosunda link davranışı
   anında değişmeli. Stale render önlenir. */
export const dynamic = "force-dynamic";

/* 🛡️ FAZ 19 — Distance icon map (kiralik-villa/[slug] sayfası ile
   birebir aynı). Bundle açısından page-local; tree-shake friendly. */
const DISTANCE_ICON_MAP: Record<DistanceIconKey, LucideIcon> = {
  restaurant: UtensilsCrossed,
  store: ShoppingBag,
  waves: Waves,
  plane: Plane,
  bus: Bus,
  building: Building2,
  cross: Cross,
  fuel: Fuel,
  school: GraduationCap,
  pin: MapPin,
};

type Feature = {
  id: string;
  name: string;
};

/* ============================================================
   🛡️ FAZ 31 — METADATA: noindex / nofollow
   ============================================================
   Critical SEO gate. Token URL'i ASLA index'lenmemeli.
   - robots: noindex/nofollow → arama motorları crawl etmez
   - canonical YOK → arama motoru başka bir URL'i kanonik sanmasın
   - OpenGraph kasıtla minimum (paylaşımda hâlâ preview gelir)
   - JSON-LD render edilmez (page body içinde de yok)
   ============================================================ */
export default async function PrivateVillaPageBody({
  params,
  searchParams,
  locale = DEFAULT_LOCALE,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
  /* 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale?: Locale;
}) {
  const dictionary = getDictionary(locale);
  const dict = dictionary.privateVilla;
  const { token } = await params;

  /* /arama'dan değil ama token URL'ine eklenmiş tarihleri de tolere
     ederiz — kullanıcı linki bir öneri ile paylaşmak isteyebilir. */
  const sp = searchParams ? await searchParams : {};
  const rawStart = Array.isArray(sp?.start) ? sp.start[0] : sp?.start;
  const rawEnd = Array.isArray(sp?.end) ? sp.end[0] : sp?.end;
  const initialStart = isValidYmd(rawStart) ? rawStart : null;
  const initialEnd = isValidYmd(rawEnd) ? rawEnd : null;
  const hasInitialRange =
    !!initialStart && !!initialEnd && initialStart < initialEnd;

  /* 🛡️ Token ile villa fetch. is_active filter YOK; deleted_at IS NULL
     korunur. Yoksa 404 (notFound). */
  const villa = await getVillaByPrivateToken(token);
  if (!villa) {
    notFound();
  }

  /* Paralel veri yükleme — kiralik-villa/[slug] sayfası ile birebir
     aynı pattern. Mevcut servisler reuse edilir; yeni servis YOK. */
  const [images, prices, distances, features, rules, priceIncludes, settings] =
    await Promise.all([
      getVillaImages(villa.id),
      getVillaPrices(villa.id),
      getVillaDistances(villa.id),
      getVillaFeaturesByVilla(villa.id) as Promise<Feature[]>,
      getRuleItemsByVilla(villa.id),
      getPriceIncludeItemsByVilla(villa.id),
      getPublicSettings(),
    ]);

  /* 🛡️ ÇOKLU DİL — KOLEKSİYON BAŞINA TAM 1 BATCH ÇEVİRİ SORGUSU.
     `/en|de/kiralik-villa/[slug]/page.tsx` ile BİREBİR AYNI desen ve
     sıra; villa verisi zaten yukarıdaki tek Promise.all'dan geldiği
     için burada yalnız çeviri okumaları paralelleşir — döngü içinde
     DB sorgusu YOKTUR (N+1 yok).

     ⚠️ MESAFELER BU BATCH'TE YOKTUR: villa başına mesafe çevirisi
     migration 090 ile KALDIRILDI; `getTranslatedDistanceLabel` statik
     dictionary'den çözer.

     ⚠️ `locale === "tr"` → dördü de sorgu ATMADAN kısa devre yapar
     (`getTranslationsForParents` boş Map, `getVillaTranslatedDescription`
     canonical `villa.description`) → TR çıktısı BİREBİR eskisi gibi. */
  const [
    description,
    featureTranslations,
    ruleTranslations,
    priceIncludeTranslations,
  ] = await Promise.all([
    getVillaTranslatedDescription(villa.id, villa.description, locale),
    getTranslationsForParents(
      "villa_feature",
      features.map((f) => f.id),
      locale
    ),
    getTranslationsForParents(
      "rule_item",
      rules.map((r) => r.id),
      locale
    ),
    getTranslationsForParents(
      "price_include_item",
      priceIncludes.map((p) => p.id),
      locale
    ),
  ]);

  /* 🛡️ YouTube videos — VillaDTO.youtube_videos zaten normalize edilmiş
     (villa.service > mapVilla). Defansif olarak parent component-side
     bir kez daha normalize edilir. */
  const youtubeVideos: VillaYouTubeVideo[] = normalizeYouTubeVideos(
    villa.youtube_videos
  );

  const watermark = {
    /* 🛡️ Watermark logo, diğer site-asset'lerle AYNI resolveAssetUrl yolu:
       bucket-relative path → R2/CDN URL; legacy full URL pass-through.
       Ham path relative çözülünce 404 oluyordu. */
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

  /* 🛡️ Bucket-fix — resolveVillaImageUrl: villa-images bucket'ından URL
     üretir. Ham path Gallery'ye gitmesin. */
  const imageUrls = images
    .map((img) => resolveVillaImageUrl(img.image_url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const isOffMarket = villa.is_active === false;

  return (
    <div className="px-5 md:px-10 lg:px-16 pt-28 md:pt-40 pb-24 md:pb-32">
      <div className="max-w-[1280px] mx-auto">
        {/* 🛡️ FAZ 31 — OFF-MARKET PREMIUM BADGE
            ─────────────────────────────────────────────────────
            "VIP / hidden luxury inventory" hissi; debug görünmemeli.
            Conditional: pasif villalar için göster (aktif villaya da
            aynı token URL'i ile erişilebilir; o durumda badge gizli).
            ───────────────────────────────────────────────────── */}
        {isOffMarket && (
          <div className="mb-8 md:mb-10">
            <div
              className="
                inline-flex items-center gap-2.5
                rounded-full
                px-4 py-2
                bg-white/80 backdrop-blur
                border border-[var(--color-stone-200)]
                text-[11px] tracking-[0.18em] uppercase font-medium
                text-[var(--color-stone-700)]
                shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
              "
            >
              <span
                className="
                  w-6 h-6 rounded-full
                  bg-[var(--color-sand-100)]
                  flex items-center justify-center
                  text-[var(--color-champagne-700)]
                "
                aria-hidden
              >
                <EyeOff size={12} />
              </span>
              <span>{dict.badge}</span>
              <span
                className="
                  text-[var(--color-stone-400)] normal-case tracking-normal
                  text-[11.5px] font-normal
                "
              >
                · {dict.badgeNote}
              </span>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            🛡️ EDITORIAL HEADER kaldırıldı — duplicate cleanup.
            ════════════════════════════════════════════════════
            Villa adı + lokasyon + guests/bedrooms/bathrooms info'ları
            artık `VillaInfoBar` içinde (Gallery üstünde). Private rota
            FavoriteButton içermez; actions slot kullanılmadı.
            ──────────────────────────────────────────────────── */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-12">
            {/* HERO: InfoBar (üstte) + Gallery (altta).
                Private rota parity — public detail page'i ile aynı UX. */}
            <section className="space-y-4">
              <VillaInfoBar
                locale={locale}
                villaTitle={villa.title}
                location={villa.location}
                guests={villa.guests}
                bedrooms={villa.bedrooms}
                bathrooms={villa.bathrooms}
              />

              <div className="rounded-3xl overflow-hidden ring-1 ring-[var(--color-stone-100)]">
                <Gallery
                  locale={locale}
                  images={imageUrls}
                  watermark={watermark}
                  villaTitle={villa.title}
                  videos={youtubeVideos}
                />
              </div>
            </section>

            {/* DESCRIPTION */}
            <section>
              <p className="eyebrow mb-3">{dict.detailsEyebrow}</p>
              <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                {dictionary.villa.aboutTitle}
              </h2>
              {description && description.trim() ? (
                <div
                  className="villa-description card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(description),
                  }}
                />
              ) : (
                <div className="card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]">
                  <span className="italic text-[var(--color-stone-400)]">
                    {dictionary.villa.descriptionEmpty}
                  </span>
                </div>
              )}
            </section>

            {/* POOL */}
            {(villa.pool_type !== "yok" || villa.indoor_pool || villa.child_pool) &&
              (() => {
                /* 🛡️ PHASE 10E BATCH 5 — kart türetimi lib/pool.helper.ts'e
                   taşındı. `distinguishSheltered: false` BİLİNÇLİ: bu sayfa
                   bugün `pool_sheltered`'ı HİÇ okumuyor ve korunaklı havuzu da
                   "Özel Havuz" olarak gösteriyor; kullanıcıya görünen TR metni
                   DEĞİŞMESİN diye o davranış AYNEN korundu (iki sayfayı
                   birleştirmek AYRI bir karar — bkz. Batch 5 raporu). */
                const cards = buildPoolCards(villa, {
                  distinguishSheltered: false,
                });
                if (cards.length === 0) return null;

                return (
                  <section>
                    <p className="eyebrow mb-4 flex items-center gap-2">
                      <Waves size={11} /> Havuz Bilgileri
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                      {cards.map((c) => {
                        const hasDims = !!(c.width || c.length || c.depth);
                        return (
                          <div
                            key={c.key}
                            className="
                              rounded-2xl border border-[var(--color-stone-100)] bg-white
                              px-4 py-3.5 md:px-5 md:py-4
                              hover:border-[var(--color-champagne-300)]
                              hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
                              transition-colors motion-reduce:transition-none
                            "
                          >
                            <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] flex items-center gap-1.5">
                              <span
                                className="inline-block w-1 h-1 rounded-full bg-[var(--color-champagne-500)]"
                                aria-hidden
                              />
                              {getPoolTypeLabel(c.type, locale)}
                            </p>
                            {hasDims ? (
                              <>
                                <p
                                  className="font-display text-[18px] md:text-[20px] text-[var(--color-stone-900)] mt-2 tracking-[-0.01em]"
                                  style={{
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {formatPoolDimension(c.width)} ×{" "}
                                  {formatPoolDimension(c.length)} ×{" "}
                                  {formatPoolDimension(c.depth)}
                                </p>
                                <p
                                  className="text-[9px] tracking-[0.18em] uppercase text-[var(--color-stone-300)] font-medium mt-1"
                                  aria-hidden
                                >
                                  {dict.dimensionsCaption}
                                </p>
                              </>
                            ) : (
                              <p className="text-[var(--color-stone-400)] text-sm italic mt-2">
                                {dictionary.pool.noDimensions}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

            {/* PRICES */}
            <section>
              <h2 className="eyebrow mb-4 flex items-center gap-2">
                <Wallet size={11} /> {dictionary.villa.seasonPricesTitle}
              </h2>
              {prices.length === 0 ? (
                <p className="text-[var(--color-stone-400)] text-sm italic">
                  {dictionary.price.noPriceInfo}
                </p>
              ) : (
                <PriceList
                  prices={prices}
                  minimumStayNights={villa.minimum_stay_nights ?? null}
                  locale={locale}
                />
              )}
            </section>

            {/* CALENDAR */}
            <section>
              <p className="eyebrow mb-3">{dictionary.villaTabs.availability}</p>
              <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                {dictionary.villa.calendarTitle}
              </h2>
              <div className="card-premium mt-5 overflow-x-auto">
                <AvailabilityInlineCalendar
                  villaId={villa.id}
                  prices={prices}
                  locale={locale}
                />
              </div>
            </section>

            {/* DISTANCES */}
            <section>
              <h2 className="eyebrow mb-4 flex items-center gap-2">
                <Map size={11} /> {dictionary.villa.distancesTitle}
              </h2>
              {distances.length === 0 ? (
                <p className="text-[var(--color-stone-400)] text-sm italic">
                  {dictionary.villa.distancesEmpty}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {distances.map((d, i) => {
                    const iconKey: DistanceIconKey = getDistanceIconKey(d.title);
                    const IconCmp: LucideIcon = DISTANCE_ICON_MAP[iconKey];
                    /* Tone palette: DISTANCE_TONE_MAP'ten kategori bazlı
                       soft pastel set; kiralik-villa/[slug] ile aynı. */
                    const tone = DISTANCE_TONE_MAP[iconKey];
                    return (
                      <div
                        key={i}
                        className={
                          "rounded-2xl border " +
                          tone.cardBorder +
                          " " +
                          tone.cardBg +
                          " px-4 py-3.5 md:px-5 md:py-4 " +
                          tone.cardHoverBorder +
                          " hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)] " +
                          "transition-colors motion-reduce:transition-none " +
                          "flex items-center gap-3"
                        }
                      >
                        <span
                          className={
                            "w-9 h-9 shrink-0 rounded-xl border " +
                            tone.iconBorder +
                            " " +
                            tone.iconBg +
                            " " +
                            tone.iconText +
                            " flex items-center justify-center"
                          }
                        >
                          <IconCmp size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] truncate">
                            {/* 🛡️ İKON KEY canonical (TR) `d.title`'dan
                                hesaplanır (yukarıda) — yalnız GÖRÜNEN
                                başlık locale'e göre çözülür. */}
                            {getTranslatedDistanceLabel(d.title, locale)}
                          </p>
                          <p
                            className="font-display text-[16px] md:text-[18px] text-[var(--color-stone-900)] mt-0.5 tracking-[-0.01em]"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {d.distance}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* FEATURES */}
            <section>
              <p className="eyebrow mb-3">{dictionary.villaTabs.features}</p>
              <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                {dictionary.villa.featuresTitle}
              </h2>

              {features.length === 0 ? (
                <div className="card-premium mt-5 p-6 text-sm text-[var(--color-stone-400)] italic">
                  {dictionary.villa.featuresEmpty}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
                  {features.map((f) => (
                    <div
                      key={f.id}
                      className="
                        flex items-center gap-2.5
                        text-[var(--color-stone-700)]
                        bg-white border border-[var(--color-stone-100)]
                        rounded-xl px-4 py-3 text-sm
                        hover:border-[var(--color-champagne-300)] hover:shadow-soft
                        transition
                      "
                    >
                      <span className="w-5 h-5 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center shrink-0">
                        <Check size={12} className="text-[var(--color-champagne-600)]" />
                      </span>
                      {resolveTranslatedField(
                        featureTranslations.get(f.id)?.name,
                        f.name
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* INCLUDES + RULES — desktop 2-kolon side-by-side card pair.
                Aynı pattern kiralik-villa/[slug] sayfasıyla birebir
                korunur (kart toneları, breakpoint'ler, içerik). */}
            {(priceIncludes.length > 0 || rules.length > 0) && (
              <div
                className={
                  "grid grid-cols-1 gap-4 md:gap-5 " +
                  (priceIncludes.length > 0 && rules.length > 0
                    ? "lg:grid-cols-2 lg:items-start"
                    : "")
                }
              >
                {/* PRICE INCLUDES — emerald positive tone card */}
                {priceIncludes.length > 0 && (
                  <section
                    className="
                      rounded-3xl border border-emerald-100
                      bg-emerald-50/60
                      p-6 md:p-7
                    "
                  >
                    <p className="eyebrow mb-3 text-emerald-700">{dict.priceIncludesEyebrow}</p>
                    <h2 className="font-display text-2xl md:text-3xl text-emerald-900 tracking-[-0.015em]">
                      {dictionary.villa.priceIncludesTitle}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                      {priceIncludes.map((p) => (
                        <div
                          key={p.id}
                          className="
                            flex items-center gap-2.5
                            text-[var(--color-stone-700)]
                            bg-white border border-emerald-100
                            rounded-xl px-4 py-3 text-sm
                            hover:border-emerald-300 hover:shadow-soft
                            transition
                          "
                        >
                          <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <Check size={12} className="text-emerald-600" />
                          </span>
                          {resolveTranslatedField(
                            priceIncludeTranslations.get(p.id)?.title,
                            p.title
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* RULES — rose warm caution tone card */}
                {rules.length > 0 && (
                  <section
                    className="
                      rounded-3xl border border-rose-100
                      bg-rose-50/60
                      p-6 md:p-7
                    "
                  >
                    <p className="eyebrow mb-3 text-rose-700">{dict.rulesEyebrow}</p>
                    <h2 className="font-display text-2xl md:text-3xl text-rose-900 tracking-[-0.015em]">
                      {dictionary.villa.rulesTitle}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                      {rules.map((r) => (
                        <div
                          key={r.id}
                          className="
                            flex items-center gap-2.5
                            text-[var(--color-stone-700)]
                            bg-white border border-rose-100
                            rounded-xl px-4 py-3 text-sm
                            hover:border-rose-300 hover:shadow-soft
                            transition
                          "
                        >
                          <span className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                            <Check size={12} className="text-rose-600" />
                          </span>
                          {resolveTranslatedField(
                            ruleTranslations.get(r.id)?.title,
                            r.title
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* MAP */}
            <section>
              <p className="eyebrow mb-3 flex items-center gap-2">
                <MapPin size={11} /> {dict.locationEyebrow}
              </p>
              <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                {dictionary.map.whereTitle}
              </h2>

              <div className="card-premium mt-5 overflow-hidden">
                {villa.map_type === "coords" &&
                  villa.latitude &&
                  villa.longitude && (
                    <>
                      <iframe
                        src={`https://www.google.com/maps?q=${villa.latitude},${villa.longitude}&hl=${dictionary.map.embedLanguage}&z=14&output=embed`}
                        className="w-full h-[400px] border-0"
                        loading="lazy"
                      />
                      <div className="p-4 md:px-5 border-t border-[var(--color-stone-100)] flex justify-between items-center text-sm">
                        <span className="text-[var(--color-stone-500)]">
                          {dict.approximateLocation}
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${villa.latitude},${villa.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-champagne-700)] font-medium hover:underline inline-flex items-center gap-1"
                        >
                          {dict.openInGoogleMaps}
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </>
                  )}

                {villa.map_type === "iframe" &&
                  extractSafeMapEmbedSrc(villa.map_embed) && (
                    <>
                      {/* 🛡️ SEC-05 — ham iframe HTML yerine allow-list'li
                         güvenli Google Maps src; iframe'i biz üretiriz. */}
                      <iframe
                        src={extractSafeMapEmbedSrc(villa.map_embed) as string}
                        title={dictionary.map.whereTitle}
                        className="w-full h-[400px] border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      <div className="p-4 md:px-5 border-t border-[var(--color-stone-100)] text-sm text-[var(--color-stone-500)]">
                        {dictionary.map.poweredByGoogle}
                      </div>
                    </>
                  )}

                {(!villa.map_type ||
                  (villa.map_type === "coords" &&
                    (!villa.latitude || !villa.longitude)) ||
                  (villa.map_type === "iframe" &&
                    !extractSafeMapEmbedSrc(villa.map_embed))) && (
                  <div className="h-[200px] flex items-center justify-center text-[var(--color-stone-400)] italic">
                    {dictionary.map.noLocation}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* RIGHT (sidebar) */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-32">
              <BookingSidebar
                locale={locale}
                villaSlug={villa.slug}
                villaId={villa.id}
                prices={prices}
                deposit={villa.deposit}
                cleaning_fee={villa.cleaning_fee}
                cleaning_currency={villa.cleaning_currency}
                cleaning_limit={villa.cleaning_limit}
                pool_heating_fee={villa.pool_heating_fee}
                pool_heating_currency={villa.pool_heating_currency}
                /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL → kısıtlama
                   yok (villa.service.ts mapVilla zaten NULL passthrough
                   uyguluyor, pool_heating_fee ile AYNI desen). */
                pool_heating_months={villa.pool_heating_months}
                custom_prepayment_rate={villa.custom_prepayment_rate ?? null}
                minimum_stay_nights={villa.minimum_stay_nights ?? null}
                initialStart={hasInitialRange ? initialStart : undefined}
                initialEnd={hasInitialRange ? initialEnd : undefined}
                /* 🛡️ Gizli link: pasif villa → rezervasyon akışı yok;
                   yalnız tarih seçimi + fiyat hesabı (CTA gizli). */
                hideReservationCta
              />

              {/* TOURISM DOCUMENT TRUST CARD (Faz 24) — aynı semantic */}
              {villa.tourism_document_number && (
                <div
                  className="
                    mt-4 rounded-2xl border border-[var(--color-stone-100)] bg-white
                    px-4 py-3.5 md:px-5 md:py-4
                    hover:border-[var(--color-champagne-300)]
                    hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
                    transition-colors motion-reduce:transition-none
                  "
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="
                        w-9 h-9 shrink-0 rounded-xl
                        bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
                        flex items-center justify-center
                        text-[var(--color-champagne-600)]
                      "
                      aria-hidden
                    >
                      <ShieldCheck size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                        {dict.tourismAuthority}
                      </p>
                      <p
                        className="
                          font-display text-[15px] md:text-[16px]
                          text-[var(--color-stone-900)] mt-1 tracking-[-0.01em]
                          select-all break-all
                        "
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        <span className="text-[var(--color-stone-500)] font-sans text-[12px] tracking-normal mr-1.5">
                          {dict.documentNumberLabel}
                        </span>
                        {villa.tourism_document_number}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
