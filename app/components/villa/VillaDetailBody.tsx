import type { ComponentProps } from "react";
import { Clock } from "lucide-react";

/* ===============================================================
   🛡️ VillaDetailBody — PHASE 10G (TR/EN/DE TASARIM PARİTESİ)
   ===============================================================
   TR villa detay sayfasının (`app/(public)/kiralik-villa/[slug]/
   page.tsx`) GÖVDESİNİN, hiçbir DOM/CSS değişikliği YAPILMADAN
   çıkarılmış ortak hali. Artık TR, EN ve DE AYNI component'i
   render eder — tek fark `locale` prop'u ve çağıran tarafta ZATEN
   ÇÖZÜLMÜŞ (çevrilmiş) metin prop'larıdır.

   ⚠️ SÖZLEŞME — "caller resolves, component renders":
   Bu component HİÇBİR veri çekmez, HİÇBİR çeviri sorgusu atmaz.
   Tüm DB okumaları + çeviri çözümü çağıran page.tsx'te yapılır
   (TR'de çeviri katmanı HİÇ ÇALIŞMAZ — identity değerler geçilir,
   ek sorgu YOK). Tek istisna `SimilarVillasSection`: kendi verisini
   çeker (mevcut, DEĞİŞTİRİLMEMİŞ davranış).

   ⚠️ VİLLA ADI ÇEVRİLMEZ — özel isimdir; her locale'de canonical
   `villa.title` gösterilir (`villaTitle` prop'u).

   ⚠️ TR ÇIKTISI: `locale="tr"` ile üretilen DOM, bu refactor
   ÖNCESİNDEKİ TR sayfasıyla BİREBİR AYNIDIR — tüm className/grid/
   ikon/sıra/koşullar taşındı, hiçbiri değiştirilmedi; hardcoded TR
   metinlerinin YERİNE geçen dictionary değerleri byte-identical'dır.
   =============================================================== */

import PriceList from "@/app/components/villa/PriceList";
import ShortStayFeeNotice from "@/app/components/villa/ShortStayFeeNotice";
import CollapsibleDescription from "@/app/components/villa/CollapsibleDescription";
import AccommodationLayout from "@/app/components/villa/AccommodationLayout";
import VillaPoolSection from "@/app/components/villa/VillaPoolSection";
import VillaReviewsSection from "@/app/components/villa/VillaReviewsSection";
import SimilarVillasSection from "@/app/components/villa/SimilarVillasSection";
import FavoriteButton from "@/app/components/favorites/FavoriteButton";
import AvailabilityInlineCalendar from "@/app/components/villa/AvailabilityInlineCalendar";
import Gallery from "@/app/components/villa/Gallery";
import BookingSidebar from "@/app/components/villa/BookingSidebar";
import MobileBookingCta from "@/app/components/villa/MobileBookingCta";
import VillaInfoBar from "@/app/components/villa/VillaInfoBar";
import VillaDetailTabs from "@/app/components/villa/VillaDetailTabs";
import VillaMapModal from "@/app/components/villa/VillaMapModal";
import VillaDistancesSection, {
  type TranslatedDistance,
} from "@/app/components/villa/VillaDistancesSection";
import VillaFeaturesSection, {
  type TranslatedFeature,
} from "@/app/components/villa/VillaFeaturesSection";
import VillaPriceIncludesAndRulesSection, {
  type TranslatedPriceInclude,
  type TranslatedRule,
} from "@/app/components/villa/VillaPriceIncludesAndRulesSection";

import { JsonLd } from "@/app/components/seo/StructuredData";
import { sanitizeHtml, stripHtml } from "@/lib/html-sanitize";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import type { VillaDTO } from "@/app/services/villa.service";

/* Alt component'lerin KENDİ prop tiplerinden türetilir — burada
   paralel/ikinci bir tip tanımı İCAT EDİLMEZ (drift riski yok). */
type PricesProp = ComponentProps<typeof PriceList>["prices"];
/* BookingSidebar'ın tipi PriceList'inkinden DAR (null kabul etmez) —
   ikisini de besleyen tek prop olduğu için dar olan seçilir. */
type DiscountsProp = ComponentProps<typeof BookingSidebar>["discounts"];
type ExternalBlocksProp = ComponentProps<
  typeof BookingSidebar
>["externalBlocks"];
type WatermarkProp = ComponentProps<typeof Gallery>["watermark"];
type VideosProp = ComponentProps<typeof Gallery>["videos"];
type ReviewsProp = ComponentProps<typeof VillaReviewsSection>["reviews"];
type ReviewStatsProp = ComponentProps<typeof VillaReviewsSection>["stats"];

export type VillaDetailBodyProps = {
  locale: Locale;
  villa: VillaDTO;
  /** Canonical villa adı — ÇEVRİLMEZ (özel isim). */
  villaTitle: string;
  /** Çözülmüş lokasyon adı (TR'de `villa.location`). */
  displayLocation: string;
  /** Çözülmüş açıklama HTML'i (TR'de `villa.description`). */
  displayDescription: string | null;

  imageUrls: string[];
  watermark: WatermarkProp;
  youtubeVideos: VideosProp;

  prices: PricesProp;
  discounts: DiscountsProp;
  externalBlocks: ExternalBlocksProp;

  distances: TranslatedDistance[];
  features: TranslatedFeature[];
  rules: TranslatedRule[];
  priceIncludes: TranslatedPriceInclude[];

  reviews: ReviewsProp;
  reviewStats: ReviewStatsProp;

  orphanGapRuleEnabled: boolean;
  /* ⓘ `minPrice` prop'u KALDIRILDI: bu component'te tek tüketicisi
     mobil CTA'nın fiyat gösterimiydi ve o kaldırıldı. Sayfalardaki
     `minPrice` değişkeni JSON-LD `priceFrom` için AYNEN duruyor. */

  /* 🔄 MOBİL CTA İLETİŞİM AKSİYONLARI — ham `settings` alanları.
     Türetme (tel: / wa.me fallback) AŞAĞIDA TEK YERDE yapılır;
     çağıran sayfalar (tr/en/de) yalnız ham değeri geçer. Yeni
     business logic YOK — `app/(public)/layout.tsx` ve
     `FloatingSocial` ile BİREBİR AYNI ifade. */
  contactPhone?: string | null;
  contactWhatsappLink?: string | null;

  /** /arama'dan gelen tarihler — opsiyonel hydrate (TR davranışı). */
  initialStart?: string;
  initialEnd?: string;

  /** Sayfa başına EŞSİZ olmalı (MobileBookingCta `targetId` ile eşleşir). */
  bookingSidebarId: string;

  /** JSON-LD — locale'e özel, çağıran tarafta üretilir. */
  vacationRentalLd: Record<string, unknown>;
  breadcrumbLd: Record<string, unknown>;
};

export default function VillaDetailBody({
  locale,
  villa,
  villaTitle,
  displayLocation,
  displayDescription,
  imageUrls,
  watermark,
  youtubeVideos,
  prices,
  discounts,
  externalBlocks,
  distances,
  features,
  rules,
  priceIncludes,
  reviews,
  reviewStats,
  orphanGapRuleEnabled,
  contactPhone,
  contactWhatsappLink,
  initialStart,
  initialEnd,
  bookingSidebarId,
  vacationRentalLd,
  breadcrumbLd,
}: VillaDetailBodyProps) {
  const dict = getDictionary(locale);

  /* 🔄 Mobil CTA iletişim href'leri — `app/(public)/layout.tsx` ve
     `FloatingSocial` ile BİREBİR AYNI türetme (yeni mantık YOK):
     whatsapp_link öncelikli, yoksa telefon hanelerinden wa.me. */
  const ctaPhoneDigits = (contactPhone || "").replace(/\D/g, "");
  const ctaPhoneHref = contactPhone?.trim()
    ? `tel:${contactPhone.trim()}`
    : null;
  const ctaWhatsappHref =
    contactWhatsappLink?.trim() ||
    (ctaPhoneDigits ? `https://wa.me/${ctaPhoneDigits}` : null);

  return (
    <>
      <div className="px-5 md:px-10 lg:px-16 pt-8 md:pt-12 pb-24 md:pb-32">
        <div className="max-w-[1280px] mx-auto">
          {/* SEO — JSON-LD structured data */}
          <JsonLd data={vacationRentalLd} />
          <JsonLd data={breadcrumbLd} />

          {/* ═══ VILLA INFO HEADER — full-width, Gallery + Booking
              grid'inin ÜSTÜNDE. */}
          <div className="mb-10 md:mb-14">
            <VillaInfoBar
              villaTitle={villaTitle}
              location={displayLocation}
              guests={villa.guests}
              bedrooms={villa.bedrooms}
              bathrooms={villa.bathrooms}
              tourismDocumentNumber={villa.tourism_document_number}
              locale={locale}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 lg:gap-10">
            {/* LEFT — ~70%: galeri + villa bilgi + içerik gövdesi */}
            <div className="lg:col-span-7 space-y-10 md:space-y-12">
              <div className="relative">
                <Gallery
                  images={imageUrls}
                  watermark={watermark}
                  villaTitle={villaTitle}
                  videos={youtubeVideos}
                  actions={
                    <FavoriteButton
                      villaId={villa.id}
                      variant="icon"
                      locale={locale}
                    />
                  }
                  locale={locale}
                />
              </div>

              {/* DESCRIPTION */}
              <section>
                <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                  {dict.villa.aboutTitle}
                </h2>
                {displayDescription && displayDescription.trim() ? (
                  <CollapsibleDescription
                    html={sanitizeHtml(displayDescription)}
                    collapsible={
                      stripHtml(displayDescription).trim().length > 280
                    }
                    locale={locale}
                  />
                ) : (
                  <div className="card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]">
                    <span className="italic text-[var(--color-stone-400)]">
                      {dict.villa.descriptionEmpty}
                    </span>
                  </div>
                )}
              </section>

              {/* 🛡️ TAB BAND — açıklama altı tab-content switching. */}
              <VillaDetailTabs
                locale={locale}
                fiyatlar={
                  <section>
                    <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em] mb-4">
                      {dict.villa.seasonPricesTitle}
                    </h2>
                    {prices.length === 0 ? (
                      <p className="text-[var(--color-stone-400)] text-sm italic">
                        {dict.price.noPriceInfo}
                      </p>
                    ) : (
                      <PriceList
                        prices={prices}
                        minimumStayNights={villa.minimum_stay_nights ?? null}
                        deposit={villa.deposit ?? null}
                        discounts={discounts}
                        locale={locale}
                      />
                    )}

                    <ShortStayFeeNotice
                      cleaningFee={villa.cleaning_fee}
                      cleaningCurrency={villa.cleaning_currency}
                      cleaningLimit={villa.cleaning_limit}
                      locale={locale}
                    />
                  </section>
                }
                musaitlik={
                  <section>
                    <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                      {dict.villa.calendarTitle}
                    </h2>
                    <div className="mt-5 overflow-x-auto">
                      <AvailabilityInlineCalendar
                        villaId={villa.id}
                        prices={prices}
                        externalBlocks={externalBlocks}
                        /* 🛡️ ADDITIVE — sayfa `getVillaDiscounts` ile
                           ZATEN çekilen public indirim kayıtları; takvim
                           günlük indirimli fiyatı bunlarla gösterir.
                           Yeni veri kaynağı/sorgu YOK. */
                        discounts={discounts}
                        locale={locale}
                      />
                    </div>
                  </section>
                }
                konum={
                  <div className="space-y-10">
                    <VillaDistancesSection
                      distances={distances}
                      locale={locale}
                    />
                  </div>
                }
                ozellikler={
                  <VillaFeaturesSection features={features} locale={locale} />
                }
              />

              {/* 🛡️ KONAKLAMA DÜZENİ (mig 047) */}
              <AccommodationLayout
                bedrooms={villa.bedroom_layout ?? []}
                bathrooms={villa.bathroom_layout ?? []}
                locale={locale}
              />

              {/* 🏊 HAVUZ BİLGİLERİ */}
              <VillaPoolSection villa={villa} locale={locale} />

              {/* 🔥 INCLUDES + RULES */}
              <VillaPriceIncludesAndRulesSection
                priceIncludes={priceIncludes}
                rules={rules}
                locale={locale}
              />

              {/* 🛡️ FAZ 33 — REVIEWS SECTION */}
              <VillaReviewsSection
                villaId={villa.id}
                reviews={reviews}
                stats={reviewStats}
                locale={locale}
              />
            </div>

            {/* RIGHT (sidebar) — sticky DEĞİL, normal akış. */}
            <aside id={bookingSidebarId} className="lg:col-span-3">
              <BookingSidebar
                villaSlug={villa.slug}
                villaId={villa.id}
                externalBlocks={externalBlocks}
                prices={prices}
                discounts={discounts}
                deposit={villa.deposit}
                cleaning_fee={villa.cleaning_fee}
                cleaning_currency={villa.cleaning_currency}
                cleaning_limit={villa.cleaning_limit}
                pool_heating_fee={villa.pool_heating_fee}
                pool_heating_currency={villa.pool_heating_currency}
                pool_heating_months={villa.pool_heating_months}
                custom_prepayment_rate={villa.custom_prepayment_rate ?? null}
                minimum_stay_nights={villa.minimum_stay_nights ?? null}
                orphanGapRuleEnabled={orphanGapRuleEnabled}
                initialStart={initialStart}
                initialEnd={initialEnd}
                locale={locale}
              />

              {/* 🕓 GİRİŞ & ÇIKIŞ SAATLERİ */}
              <div
                className="
              mt-6 rounded-2xl
              border border-[var(--color-stone-100)]
              bg-gradient-to-b from-[var(--color-sand-50)]/70 to-white
              shadow-[0_10px_28px_-20px_rgba(11,31,58,0.18)]
              px-5 py-5
            "
              >
                <span className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--color-stone-400)]">
                  <span
                    aria-hidden="true"
                    className="inline-block w-3 h-px bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
                  />
                  {dict.villa.checkInOutTitle}
                </span>

                <div className="mt-4 flex items-center">
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ED7926]/10 text-[#ED7926]">
                      <Clock size={16} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-stone-400)]">
                        {dict.villa.checkInLabel}
                      </p>
                      <p className="font-display text-[21px] md:text-[22px] leading-tight text-[var(--color-stone-900)] tabular-nums">
                        16:00
                      </p>
                    </div>
                  </div>

                  <span
                    aria-hidden="true"
                    className="mx-4 h-10 w-px shrink-0 bg-[var(--color-stone-100)]"
                  />

                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0973BA]/10 text-[#0973BA]">
                      <Clock size={16} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-stone-400)]">
                        {dict.villa.checkOutLabel}
                      </p>
                      <p className="font-display text-[21px] md:text-[22px] leading-tight text-[var(--color-stone-900)] tabular-nums">
                        10:00
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 🛡️ "Nerede?" — konum kartı (harita modal içinde). */}
              <div
                className="
              mt-6 rounded-2xl
              border border-[var(--color-stone-100)]
              bg-white
              shadow-[0_10px_28px_-20px_rgba(11,31,58,0.18)]
              px-5 py-5
            "
              >
                <VillaMapModal
                  mapType={villa.map_type}
                  latitude={villa.latitude}
                  longitude={villa.longitude}
                  mapEmbed={villa.map_embed}
                  villaTitle={villaTitle}
                  locale={locale}
                />
              </div>
            </aside>
          </div>
        </div>

        {/* 🛡️ MOBILE STICKY CTA — yalnız <lg viewport. */}
        <MobileBookingCta
          targetId={bookingSidebarId}
          locale={locale}
          phoneHref={ctaPhoneHref}
          whatsappHref={ctaWhatsappHref}
        />
      </div>

      {/* 🛡️ FULL-WIDTH — Misafir Yorumları'ndan SONRA, Footer'dan ÖNCE. */}
      <SimilarVillasSection
        villaId={villa.id}
        locationId={villa.location_id ?? null}
        locale={locale}
      />
    </>
  );
}
