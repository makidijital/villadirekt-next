import { notFound } from "next/navigation";
import Link from "next/link";
import { Heart, Sparkles, ArrowUpRight } from "lucide-react";

import { getSharedFavoritesList } from "@/app/services/shared-favorites.service";
import VillaCard from "@/app/components/villa/VillaCard";
import { formatDateForLocale } from "@/lib/date-format";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`favoritesPage` namespace). Token/share çözümleme
   (`getSharedFavoritesList`), snapshot semantiği ve VillaCard veri
   akışı DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { getVillaBadgesByLocale } from "@/lib/i18n/get-villa-badge-translations.server";

/* ===============================================================
   🛡️ /favoriler/paylas/[token] — ORTAK GÖVDE
   ===============================================================
   `app/(public)/favoriler/paylas/[token]/page.tsx`'in GERÇEK
   gövdesinin TAŞINMIŞ hâlidir (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN) —
   `/en|de/favoriler/paylas/[token]` AYNI gövdeyi render eder.

   Read-only paylaşım görünümü; immutable snapshot mantığı ve
   `notFound()` davranışı BİREBİR korunur.
   =============================================================== */

export default async function SharedFavoritesPageBody({
  params,
  locale = DEFAULT_LOCALE,
}: {
  params: Promise<{ token: string }>;
  locale?: Locale;
}) {
  const dict = getDictionary(locale).favoritesPage;
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const { token } = await params;
  const data = await getSharedFavoritesList(token);
  if (!data) {
    notFound();
  }

  /* 🛡️ Kart rozeti (villa_translations.badge) TEK batch sorguda
     çözülür — `VillaList` / `DiscountCollection` ile AYNI desen,
     N+1 YOK. TR'de sorgu HİÇ atılmaz → TR çıktısı ve maliyeti
     BİREBİR eskisi gibi. Çeviri yoksa canonical rozet gösterilir. */
  const badgeByVillaId = await getVillaBadgesByLocale(
    data.villas.map((v) => v.id),
    locale
  );

  const visibleCount = data.villas.length;
  const totalCount = data.snapshot_count;
  const allStale = totalCount > 0 && visibleCount === 0;

  return (
    <div className="px-5 md:px-10 lg:px-16 pt-28 md:pt-40 pb-24 md:pb-32">
      <div className="max-w-[1280px] mx-auto">
        {/* ════════════════════════════════════════════════════
            HEADER — luxury itinerary banner
            ════════════════════════════════════════════════════ */}
        <header className="mb-10 md:mb-16">
          <div
            className="
              inline-flex items-center gap-2 mb-6
              rounded-full
              px-3.5 py-1.5
              bg-white border border-[var(--color-stone-200)]
              text-[10.5px] tracking-[0.18em] uppercase font-medium
              text-[var(--color-champagne-700)]
              shadow-[0_2px_8px_-4px_rgb(27_26_23/0.1)]
            "
          >
            <Sparkles size={11} aria-hidden />
            {dict.sharedEyebrow}
          </div>

          <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)] flex items-center">
            <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
            {dict.sharedBadge}
          </p>
          <h1 className="font-display text-[44px] md:text-[72px] lg:text-[88px] text-[var(--color-stone-900)] mt-6 leading-[0.98] tracking-[-0.035em] max-w-4xl">
            {dict.sharedTitle}
            <br />
            <span className="text-[var(--color-stone-400)]">
              {dict.sharedTitleAccent}
            </span>
          </h1>
          <p className="text-[14.5px] md:text-[15.5px] leading-[1.65] text-[var(--color-stone-500)] mt-6 max-w-xl">
            {dict.sharedBody}
          </p>

          {/* META STRIP */}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-[var(--color-stone-500)]">
            <span className="inline-flex items-baseline gap-2">
              <span className="font-display text-[20px] text-[var(--color-stone-900)] tracking-[-0.015em] tabular-nums">
                {totalCount}
              </span>
              <span className="text-[11px] tracking-[0.12em] uppercase">
                {dict.sharedVillaUnit}
              </span>
            </span>
            <span className="text-[var(--color-stone-300)]" aria-hidden>
              ·
            </span>
            <span className="tabular-nums">
              {formatDictionaryString(dict.sharedCreatedAt, {
                date: formatDateForLocale(data.created_at, locale),
              })}
            </span>
            {visibleCount < totalCount && (
              <>
                <span className="text-[var(--color-stone-300)]" aria-hidden>
                  ·
                </span>
                <span className="text-[12.5px] text-[var(--color-stone-400)]">
                  {formatDictionaryString(dict.sharedVisibleCount, {
                    visible: visibleCount,
                    total: totalCount,
                  })}
                </span>
              </>
            )}
          </div>
        </header>

        {/* ════════════════════════════════════════════════════
            VILLA GRID — VillaCard reuse
            ════════════════════════════════════════════════════ */}
        {allStale ? (
          <div
            className="
              rounded-3xl bg-white border border-[var(--color-stone-100)]
              px-6 py-12 md:px-10 md:py-16
              text-center
            "
          >
            <h2 className="font-display text-xl md:text-2xl text-[var(--color-stone-900)] tracking-[-0.015em]">
              {dict.sharedEmptyTitle}
            </h2>
            <p className="text-[14px] text-[var(--color-stone-500)] mt-3 max-w-md mx-auto">
              {dict.sharedEmptyBody}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-12 md:gap-y-16">
            {data.villas.map((villa) => (
              <VillaCard
                key={villa.id}
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
                reviewAverage={villa.review_average}
                reviewCount={villa.review_count}
                /* 🛡️ Kart metinleri + detay linki locale-aware. */
                locale={locale}
              />
            ))}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            CTA — "Kendi favorilerini oluştur"
            ════════════════════════════════════════════════════ */}
        <div className="mt-20 md:mt-28">
          <div
            className="
              rounded-3xl bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
              px-6 py-10 md:px-12 md:py-16
              flex flex-col md:flex-row md:items-center md:justify-between gap-6
            "
          >
            <div className="max-w-xl">
              <div
                className="
                  w-11 h-11 rounded-full
                  bg-white border border-[var(--color-stone-100)]
                  flex items-center justify-center
                  text-[var(--color-champagne-700)]
                  shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
                "
                aria-hidden
              >
                <Heart size={16} strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-[24px] md:text-[28px] text-[var(--color-stone-900)] mt-5 tracking-[-0.02em]">
                {dict.sharedCtaTitle}
              </h3>
              <p className="text-[14.5px] text-[var(--color-stone-500)] mt-3 leading-[1.65]">
                {dict.sharedCtaBody}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap shrink-0">
              <Link
                href={`${localePrefix}/kiralik-villalar`}
                className="
                  inline-flex items-center gap-2
                  px-5 py-2.5 rounded-full
                  bg-[var(--color-stone-900)] text-white
                  text-[13px] font-medium tracking-[0.02em]
                  hover:bg-[var(--color-stone-700)]
                  transition-colors motion-reduce:transition-none
                  focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--color-champagne-500)]/40
                "
              >
                {dict.sharedExploreCta}
                <ArrowUpRight size={14} aria-hidden />
              </Link>
              <Link
                href={`${localePrefix}/favoriler`}
                className="
                  inline-flex items-center gap-2
                  px-5 py-2.5 rounded-full
                  border border-[var(--color-stone-200)]
                  text-[13px] font-medium text-[var(--color-stone-700)]
                  hover:border-[var(--color-champagne-500)] hover:text-[var(--color-stone-900)]
                  hover:bg-white
                  transition-colors motion-reduce:transition-none
                  focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--color-champagne-500)]/40
                "
              >
                {dict.sharedFavoritesCta}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
