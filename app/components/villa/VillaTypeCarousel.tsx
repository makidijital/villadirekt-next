import Link from "next/link";
import Image from "next/image";

import {
  getCachedVillaTypes,
  getCachedCategoryCovers,
} from "@/lib/cache.helpers";
import {
  getCategoryCoverPublicUrl,
  appendAssetVersion,
} from "@/lib/storage.helpers";

import HorizontalCarousel from "./HorizontalCarousel";
/* 🛡️ PHASE 11 — villa tipi ADLARI mevcut `villa_type_translations`
   altyapısıyla çevrilir: `getVillaTypeNamesByLocale` (Phase 10H, TEK
   batch sorgu) + `resolveTaxonomyName` (saf fallback). Yeni helper
   YAZILMADI. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import { categoryLinkHref } from "@/lib/taxonomy-landing";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ VILLA TYPE CAROUSEL — homepage "Villa Tiplerini Keşfedin"
   ===============================================================
   Yerleşim: "Sizin için seçtiklerimiz" (VillaList) bölümünün HEMEN
   ÜSTÜNDE (bkz. app/(public)/page.tsx). CategoryCollection'dan
   (Hero altı "Villa tiplerine göz atın" grid section) TAMAMEN AYRI,
   ek bir premium carousel section — mevcut CategoryCollection /
   VillaList'e SIFIR dokunuş.

   VERİ (audit sonucu — CategoryCollection ile BİREBİR aynı, mevcut
   cached helper'lar reuse edilir, yeni DB sorgusu YOK):
     getCachedVillaTypes()      → villa_types (sort_order ASC, tag
                                  "taxonomy", TTL 1sa)
     getCachedCategoryCovers()  → { [typeId]: { coverImageUrl,
                                  villaCount } } — 2-step join
                                  (villa_type_relations + villa,
                                  WHERE is_active=true AND
                                  deleted_at IS NULL), tag
                                  "villas"+"taxonomy", TTL 10dk.
     Tek Promise.all round-trip; N+1 YOK. Villa sayısı gerçek
     PostgreSQL verisinden (taslak/silinmiş villa sayılmaz —
     repository filtresi zaten is_active+deleted_at IS NULL uyguluyor).

   GÖRSEL: type.cover_image (admin upload) → yoksa covers[typeId]
     .coverImageUrl (o tipteki ilk/kapak villa görseli, aynı cover
     seçim kuralı: is_cover öncelik → sort_order ASC). Storage/CDN
     URL üretimi getCategoryCoverPublicUrl (lib/storage.helpers,
     mevcut public bucket resolver) — yeni görsel/fake URL YOK.

   SIRALAMA: villa_types.sort_order ASC (repository
     findAllBySortOrder) — hardcode liste YOK.

   FİLTRE: count > 0 (aktif villa içeren tipler) + show_on_homepage
     !== false (migration 061 — mevcut homepage küratörlük alanı,
     CategoryCollection ile aynı kural; migration öncesi undefined →
     görünür, deploy-safe).

   LINK: /arama?villa-turleri=<slug|id> — proje genelinde canonical
     URL/param (CategoryCollection, Footer, menu-resolver, FilterSidebar
     ile birebir aynı contract). Yeni URL formatı icat edilmedi.

   CAROUSEL: HorizontalCarousel (app/components/villa/HorizontalCarousel.tsx)
     — projede zaten var olan generic native CSS scroll-snap client
     component (CategoryCollection/LocationCollection için yazılmış
     paylaşılan altyapı). Yeni dependency/kütüphane eklenmedi. Desktop:
     showArrows — ok yalnızca gerçek overflow + ilgili yönde scroll
     mümkünse görünür/aktif (component'in kendi edge-detection'ı).
     Mobile: native touch swipe + snap-x snap-mandatory, sonraki kartın
     bir kısmı görünür (kart genişliği viewport'un tamamını kaplamıyor).

   TASARIM: marka renkleri (#ED7926 turuncu / #0973BA mavi) SADECE
     villa sayısı badge'inde (gradient pill) — CategoryCard/LocationCard
     ile aynı premium editorial dil (rounded corner, kaliteli shadow,
     hover'da görsel zoom + kart lift), TopBar shimmer KULLANILMADI.
     prefers-reduced-motion → tüm hover transform/scale kapanır.

   DOKUNULMAYAN: Hero, HeroSearchPanel, Header, TopBar, arama sistemi,
     admin panel, DB migration, storage config, R2, env, authentication,
     reservation sistemi, CategoryCollection, VillaList ("Sizin için
     seçtiklerimiz") — hiçbiri değişmedi.
   =============================================================== */

type Item = {
  id: string;
  slug: string | null;
  name: string;
  count: number;
  coverUrl: string | null;
  /* Migration 061 — homepage gösterim küratörlüğü. Yalnız explicit
     false gizler; undefined/null (migration öncesi) → görünür. */
  show_on_homepage: boolean;
};

export default async function VillaTypeCarousel({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const dict = getDictionary(locale).home.villaTypes;
  const carouselDict = getDictionary(locale).home.carousel;
  const [types, covers] = await Promise.all([
    getCachedVillaTypes(),
    getCachedCategoryCovers(),
  ]);

  if (!types?.length) return null;

  /* 🛡️ PHASE 11 — TEK batch sorgu (N+1 YOK). TR'de HİÇ çağrılmaz →
     sorgu sayısı ve çıktı BİREBİR eskisi gibi kalır. */
  const nameByLocale =
    locale === DEFAULT_LOCALE
      ? {}
      : await getVillaTypeNamesByLocale(types.map((t) => String(t.id))).catch(
          () => ({})
        );

  const items: Item[] = types
    .map((t) => {
      const tid = String(t.id);
      const rawSlug = (t as { slug?: string | null }).slug;
      const slug =
        typeof rawSlug === "string" && rawSlug.trim().length > 0
          ? rawSlug.trim()
          : null;

      /* 3-tier image priority: admin upload → villa fallback → null.
         cover_v (taxonomy cache build token) ile `?v=` cache-bust —
         CategoryCollection ile birebir aynı mekanizma. */
      const adminCover = appendAssetVersion(
        getCategoryCoverPublicUrl(
          (t as { cover_image?: string | null }).cover_image
        ),
        (t as { cover_v?: number }).cover_v
      );
      const fallbackCover = covers[tid]?.coverImageUrl ?? null;
      const coverUrl = adminCover || fallbackCover;

      return {
        id: tid,
        slug,
        /* Çeviri varsa o, yoksa canonical TR adı (resolveTaxonomyName). */
        name: resolveTaxonomyName(
          String(t.name || "").trim(),
          nameByLocale[tid],
          locale
        ).trim(),
        count: covers[tid]?.villaCount ?? 0,
        coverUrl,
        show_on_homepage:
          (t as { show_on_homepage?: boolean | null }).show_on_homepage !==
          false,
      };
    })
    .filter(
      (item) =>
        item.count > 0 && item.name.length > 0 && item.show_on_homepage
    );

  if (!items.length) return null;

  return (
    <section
      aria-label={dict.sectionAriaLabel}
      className="px-5 md:px-10 lg:px-16 pt-10 md:pt-14 pb-2 md:pb-4"
    >
      <div className="site-container">
        <div className="text-center mb-7 md:mb-10">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            {dict.title}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md mx-auto">
            {dict.subtitle}
          </p>
        </div>

        <HorizontalCarousel
          showArrows
          ariaLabel={dict.carouselAriaLabel}
          prevLabel={carouselDict.previous}
          nextLabel={carouselDict.next}
          className="pb-1"
        >
          <ul role="list" className="flex flex-nowrap min-w-max gap-3.5 md:gap-4">
            {items.map((item) => (
              <li
                key={item.id}
                className="snap-start shrink-0 w-[78vw] max-w-[280px] sm:w-[300px] md:w-[240px] lg:w-[252px]"
              >
                <VillaTypeCard item={item} countBadge={dict.countBadge} locale={locale} />
              </li>
            ))}
          </ul>
        </HorizontalCarousel>
      </div>
    </section>
  );
}

/* ===============================================================
   VillaTypeCard — premium editorial görsel + gradient count badge
=============================================================== */
function VillaTypeCard({
  item,
  countBadge,
  locale,
}: {
  item: Item;
  /** `home.villaTypes.countBadge` — template: {count} */
  countBadge: string;
  /** 🛡️ NAVIGATION LOCALE PERSISTENCE — kart linkinin prefix'i. */
  locale: Locale;
}) {
  /* 🛡️ SEO landing — slug varsa `/villa-turleri/<slug>`; slug yoksa
     ESKİ `/arama?villa-turleri=<uuid>` (lib/taxonomy-landing).
     🛡️ NAVIGATION LOCALE PERSISTENCE — link aktif locale'i taşır. */
  const href = localeHref(
    categoryLinkHref({ id: item.id, slug: item.slug }),
    locale
  );
  const initial = (item.name?.[0] || "·").toUpperCase();
  const countLabel = formatDictionaryString(countBadge, { count: item.count });

  return (
    <Link
      href={href}
      className="
        group block w-full
        rounded-[18px] overflow-hidden
        bg-white border border-[var(--color-stone-100)]
        shadow-[0_14px_34px_-22px_rgba(0,0,0,0.28)]
        hover:shadow-[0_26px_54px_-24px_rgba(0,0,0,0.36)]
        hover:-translate-y-[3px]
        transition-[transform,box-shadow] duration-500
        motion-reduce:transition-none motion-reduce:hover:translate-y-0
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2
      "
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-sand-100)] ">
        {item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt={item.name}
            fill
            sizes="(max-width: 768px) 78vw, (max-width: 1024px) 240px, 252px"
            className="object-cover object-center transition-transform duration-[900ms] ease-out group-hover:scale-[1.08] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          /* SOFT PLACEHOLDER — serif initial (CategoryCollection paterni) */
          <span className="absolute inset-0 flex items-center justify-center select-none font-display text-[40px] leading-none text-[var(--color-stone-300)]">
            {initial}
          </span>
        )}


        {/* Villa sayısı — gerçek DB verisi (item.count), gradient pill badge */}
        <span
          className="
            absolute top-3 right-3
            inline-flex items-center rounded-full
            px-2.5 py-1
            text-[10.5px] font-semibold tracking-[0.02em] text-white
            bg-brand
            shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--color-brand)_50%,transparent)]
          "
        >
          {countLabel}
        </span>
      </div>

      <div className="px-4 py-3.5 border-t border-[var(--color-stone-100)]">
        <h3 className="font-display text-[15px] md:text-[16px] font-medium leading-[1.2] tracking-[-0.01em] text-[var(--color-stone-900)] line-clamp-1 group-hover:text-brand transition-colors duration-300 motion-reduce:transition-none">
          {item.name}
        </h3>
      </div>
    </Link>
  );
}
