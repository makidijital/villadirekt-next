import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

import {
  getCachedVillaTypes,
  getCachedCategoryCovers,
} from "@/lib/cache.helpers";
import {
  getCategoryCoverPublicUrl,
  appendAssetVersion,
} from "@/lib/storage.helpers";

/* ===============================================================
   🛡️ CATEGORY SHOWCASE — homepage premium editorial grid
   ===============================================================
   Önceki version küçük chip-strip idi; bu version cover_image
   (migration 010) destekli premium image-card grid.

   DATA (mevcut helper'lar reuse):
     getCachedVillaTypes()      → [{id, name, slug, cover_image}]
                                  (tag: taxonomy, TTL 1sa)
     getCachedCategoryCovers()  → { [typeId]: { coverImageUrl, villaCount } }
                                  (tag: villas+taxonomy, TTL 10dk)
     Tek round-trip; N+1 yok. Cache hit'te 0 DB hit.

   IMAGE SOURCE PRIORITY (3-tier):
     1. type.cover_image (admin upload, getCategoryCoverPublicUrl)
     2. covers[typeId].coverImageUrl (mevcut: ilk villa image fallback)
     3. soft placeholder (serif initial)

   FILTRE:
     count > 0 (aktif + deleted_at IS NULL villa içeren kategoriler).

   CLICK:
     /arama?villa-turleri=<slug | id>
     (mevcut URL contract; slug resolver server'da UUID'ye normalize eder)

   PERFORMANS:
     - Server component, SSR'da bir kere
     - next/image: WebP/AVIF auto-format, responsive srcSet, lazy load
     - sizes attribute: mobile ~78vw, tablet 1/2 col, desktop 1/4 col
     - Bundle: zero client JS
   =============================================================== */

type Item = {
  id: string;
  slug: string | null;
  name: string;
  count: number;
  coverUrl: string | null;
  /* 🛡️ Migration 061 — homepage slider kürasyon. Yalnız explicit false
     gizler; undefined/null (migration öncesi) → görünür. */
  show_on_homepage: boolean;
};

export default async function CategoryCollection() {
  const [types, covers] = await Promise.all([
    getCachedVillaTypes(),
    getCachedCategoryCovers(),
  ]);

  if (!types?.length) return null;

  const items: Item[] = types
    .map((t) => {
      const tid = String(t.id);
      const rawSlug = (t as { slug?: string | null }).slug;
      const slug =
        typeof rawSlug === "string" && rawSlug.trim().length > 0
          ? rawSlug.trim()
          : null;

      /* 3-tier image priority: admin upload → villa fallback → null.
         🛡️ adminCover deterministik path'e overwrite edilir → URL
         değişmez → CDN stale. cover_v (taxonomy cache build token) ile
         `?v=` cache-bust: upload → revalidateTaxonomy → rebuild → yeni
         token → anında fresh. */
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
        name: String(t.name || "").trim(),
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
      aria-label="Kategoriler"
      className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-4 md:pb-10"
    >
      <div className="max-w-[1280px] mx-auto">
        {/* 🛡️ FAZ 39H — Refined editorial header.
           Daha kompakt + daha modern hierarchy:
             - Eyebrow "KOLEKSİYONLAR" tracking-tight uppercase coral
             - Title 2-line; eski 72px → 40px lg (daha okunabilir)
             - Subtitle ayrı paragraf (stone-500 max-w-md)
             - CTA luxury ghost pill (coral hover) */}
        <div className="text-center mb-8 md:mb-12">
          {/* 🛡️ FAZ 39M — Normalized section title scale. */}
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            Villa tiplerine göz atın
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md mx-auto">
            Yüzlerce seçenek arasından size en uygun villayı kolayca bulun.
          </p>
        </div>

        {/* COMPACT GRID — horizontal villa-type kartları (carousel kaldırıldı).
            Desktop 3 kolon (içerik 2 satıra akar) · tablet 2 · mobile 1. */}
        <ul
          role="list"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 md:gap-4"
        >
          {items.map((item) => (
            <li key={item.id}>
              <CategoryCard item={item} />
            </li>
          ))}
        </ul>

        {/* 🛡️ CTA — grid altında, tüm ekranlarda centered (header'dan taşındı). */}
        <div className="mt-9 md:mt-10 flex justify-center">
          <Link
            href="/arama"
            className="
              group inline-flex items-center gap-2
              px-4 py-2 rounded-full
              border border-[var(--color-stone-200)]
              text-[12.5px] font-medium tracking-[0.02em]
              text-[var(--color-stone-700)]
              hover:border-[var(--brand-coral)] hover:text-[var(--color-stone-900)]
              hover:bg-[var(--brand-coral-tint)]
              transition-colors motion-reduce:transition-none
            "
          >
            <span>Tüm kategoriler</span>
            <ArrowUpRight
              size={13}
              className="text-[var(--color-stone-500)] group-hover:text-[var(--brand-coral)]"
              aria-hidden
              strokeWidth={1.75}
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ===============================================================
   CategoryCard — premium image-card (cover + overlay + title)
=============================================================== */
function CategoryCard({
  item,
  className = "",
}: {
  item: Item;
  className?: string;
}) {
  /* SEO-friendly URL: slug öncelikli, fallback UUID. */
  const token = item.slug || item.id;
  const href = `/arama?villa-turleri=${encodeURIComponent(token)}`;
  const initial = (item.name?.[0] || "·").toUpperCase();

  return (
    <Link
      href={href}
      className={
        "group flex items-center gap-3.5 p-2.5 rounded-xl bg-white border border-[var(--color-stone-100)] shadow-[0_6px_18px_-14px_rgba(11,31,58,0.20)] hover:shadow-[0_14px_30px_-18px_rgba(11,31,58,0.30)] hover:-translate-y-[2px] hover:border-[var(--color-stone-200)] transition-[transform,box-shadow,border-color] duration-300 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
        className
      }
    >
      {/* SOL — küçük thumbnail (fixed small, rounded-lg) */}
      <div className="relative shrink-0 w-16 h-16 overflow-hidden rounded-lg bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)]">
        {item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt={item.name}
            fill
            sizes="64px"
            className="object-cover object-center transition-transform duration-[700ms] ease-out group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          /* SOFT PLACEHOLDER — serif initial */
          <span className="absolute inset-0 flex items-center justify-center select-none font-display text-[24px] leading-none text-[var(--color-stone-300)]">
            {initial}
          </span>
        )}
      </div>

      {/* SAĞ — kategori adı (bold, dikey ortalı) — yalnızca isim */}
      <h3 className="min-w-0 flex-1 font-display text-[15px] md:text-[16px] font-medium leading-[1.2] tracking-[-0.01em] text-[var(--color-stone-900)] line-clamp-2">
        {item.name}
      </h3>
    </Link>
  );
}
