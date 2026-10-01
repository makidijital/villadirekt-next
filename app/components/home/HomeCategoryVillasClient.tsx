"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import VillaCard from "@/app/components/villa/VillaCard";
import type { PublicVillaCard } from "@/lib/cache.helpers";
import type { Locale } from "@/lib/i18n/config";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";

/* ===============================================================
   🛡️ HOME — KATEGORİYE GÖRE VİLLALAR (client)
   ===============================================================
   Kategori kartları = aynı sayfada sekme gibi çalışır (route/URL
   DEĞİŞMEZ). Villalar server'da hazırlanır (kategori başına ilk 8),
   burada yalnız aktif kategori state'i tutulur → anında geçiş,
   ek istek/loading yok. Kartlar mevcut `VillaCard` (default variant).
   =============================================================== */

export type HomeCategoryItem = {
  id: string;
  name: string;
  count: number;
  coverUrl: string | null;
  /** Kategori landing'i (mevcut categoryLinkHref + localeHref). */
  href: string;
};

type Labels = {
  sectionAriaLabel: string;
  title: string;
  tabsAriaLabel: string;
  /** template: {name} */
  resultsAriaLabel: string;
  empty: string;
  /** template: {name} */
  viewAll: string;
  /** template: {count} */
  countBadge: string;
};

/* VillaList ile aynı grid (1 / sm 2 / lg 4) → aynı `sizes` değeri. */
const CARD_SIZES =
  "(max-width: 640px) 100vw, " +
  "(max-width: 1023px) 50vw, " +
  "(max-width: 1407px) calc(35.3vw - 81px), " +
  "415px";

export default function HomeCategoryVillasClient({
  locale,
  categories,
  villasByCategory,
  badgeByVillaId,
  labels,
}: {
  locale: Locale;
  categories: HomeCategoryItem[];
  villasByCategory: Record<string, PublicVillaCard[]>;
  badgeByVillaId: Record<string, string>;
  labels: Labels;
}) {
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? "");
  const active = categories.find((c) => c.id === activeId) ?? categories[0];
  if (!active) return null;

  const villas = villasByCategory[active.id] ?? [];
  const panelId = "home-category-villas-panel";

  return (
    <section
      aria-label={labels.sectionAriaLabel}
      className="px-5 md:px-10 lg:px-16 pt-10 md:pt-12 pb-6 md:pb-10"
    >
      <div className="site-container">
        <h2 className="text-center font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em] mb-6 md:mb-8">
          {labels.title}
        </h2>

        {/* KATEGORİ KARTLARI — mobil: yatay kaydırma; lg: 6 sütun grid */}
        <div
          role="tablist"
          aria-label={labels.tabsAriaLabel}
          className="-mx-5 px-5 md:mx-0 md:px-0 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:pb-0"
        >
          {categories.map((c) => {
            const isActive = c.id === active.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                onClick={() => setActiveId(c.id)}
                className={
                  "group snap-start shrink-0 w-[42vw] max-w-[180px] sm:w-[180px] lg:w-auto lg:max-w-none " +
                  "text-left rounded-[14px] bg-white border p-1.5 " +
                  "transition-[border-color,box-shadow,transform] duration-300 motion-reduce:transition-none " +
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 " +
                  (isActive
                    ? "border-brand shadow-[0_10px_24px_-14px_color-mix(in_srgb,var(--color-brand)_60%,transparent)]"
                    : "border-[var(--color-stone-200)] hover:border-brand/40 hover:-translate-y-[2px] motion-reduce:hover:translate-y-0")
                }
              >
                <span className="relative block aspect-[16/10] overflow-hidden rounded-[10px] bg-[var(--color-sand-100)]">
                  {c.coverUrl ? (
                    <Image
                      src={c.coverUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 42vw, (max-width: 1024px) 180px, 180px"
                      className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center select-none font-display text-[28px] leading-none text-[var(--color-stone-300)]">
                      {(c.name[0] || "·").toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-between gap-2 px-1.5 pt-2 pb-1">
                  <span
                    className={
                      "font-display text-[13px] font-semibold leading-tight line-clamp-1 " +
                      (isActive ? "text-brand" : "text-[var(--color-stone-900)]")
                    }
                  >
                    {c.name}
                  </span>
                  <span
                    className={
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums " +
                      (isActive
                        ? "bg-brand text-white"
                        : "bg-[var(--color-stone-100)] text-[var(--color-stone-600)]")
                    }
                  >
                    {formatDictionaryString(labels.countBadge, { count: c.count })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* SEÇİLİ KATEGORİNİN İLK 8 VİLLASI */}
        <div
          id={panelId}
          role="tabpanel"
          aria-live="polite"
          aria-label={formatDictionaryString(labels.resultsAriaLabel, {
            name: active.name,
          })}
          className="mt-8 md:mt-10"
        >
          {villas.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 md:gap-x-8 gap-y-10 md:gap-y-12">
              {villas.map((villa) => (
                <VillaCard
                  key={villa.slug || villa.id}
                  id={villa.id}
                  slug={villa.slug}
                  title={villa.title}
                  location={villa.location}
                  price={villa.price}
                  currency={villa.currency || "TRY"}
                  images={villa.images}
                  badge={badgeByVillaId[villa.id] ?? villa.badge}
                  bedrooms={villa.bedrooms || 1}
                  bathrooms={villa.bathrooms || 1}
                  guests={villa.guests || 2}
                  reviewAverage={villa.review_average}
                  reviewCount={villa.review_count}
                  locale={locale}
                  sizes={CARD_SIZES}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-[14px] text-[var(--color-stone-500)]">
              {labels.empty}
            </p>
          )}

          {active.count > villas.length && villas.length > 0 && (
            <div className="mt-9 md:mt-10 flex justify-center">
              <Link
                href={active.href}
                className="group inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--color-stone-200)] text-[12.5px] font-medium tracking-[0.02em] text-[var(--color-stone-700)] hover:border-brand/40 hover:text-brand transition-colors motion-reduce:transition-none"
              >
                <span>
                  {formatDictionaryString(labels.viewAll, { name: active.name })}
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
