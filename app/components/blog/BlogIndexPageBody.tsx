import Link from "next/link";
import Image from "next/image";
import { CalendarDays, ArrowUpRight } from "lucide-react";

import { getBlogPosts } from "@/app/services/blog.service";
import { resolveAssetUrl } from "@/lib/storage.helpers";
import { versionedAssetUrl } from "@/lib/storage/site-asset-version";
import { getSiteAssetVersions } from "@/lib/storage/site-asset-version.server";
import PageHero from "@/app/components/ui/PageHero";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`blog` namespace); yazı başlığı/özeti `blog_post_translations`'tan
   (migration 089) TEK batch sorgu ile gelir (N+1 YOK, TR'de sorgu YOK).
   Yayın filtresi (is_active + published_at DESC), slug/URL contract'ı
   ve kart tasarımı DEĞİŞTİRİLMEDİ. */
import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { resolveBlogListContent } from "@/lib/i18n/get-blog-translation.server";

/* ===============================================================
   🛡️ BLOG INDEX GÖVDESİ — /blog · /en/blog · /de/blog
   ===============================================================
   TR/EN/DE ORTAK gövde; route dosyaları ince sarmalayıcıdır.
   Villa/rezervasyon/fiyat sistemlerine dokunmaz.
   =============================================================== */

/* 🛡️ TR ÇIKTISI BİREBİR: biçim seçenekleri (day numeric · month long ·
   year numeric) ve `new Date(iso)` parse'ı sayfanın eski `formatDate`
   fonksiyonundan AYNEN alındı; yalnız sabit "tr-TR" etiketi MEVCUT
   `LOCALE_BCP47` haritasından gelir → tr için sonuç DEĞİŞMEZ. */
function formatPublishedAt(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(LOCALE_BCP47[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogIndexPageBody({
  locale = DEFAULT_LOCALE,
}: {
  /* 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale?: Locale;
} = {}) {
  const dict = getDictionary(locale).blog;
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;

  const posts = await getBlogPosts();
  const translated = await resolveBlogListContent(posts, locale);
  /* 🛡️ Kapak `?v=<R2 ETag>` versiyonları — `blog/<slug>.webp` aynı
     path'e overwrite edildiği için URL görsel değişince değişmeli. */
  const coverVersions = await getSiteAssetVersions(
    posts.map((p) => p.cover_image)
  );

  return (
    <>
      <PageHero
        breadcrumb={[
          { name: dict.breadcrumbHome, href: localePrefix || "/" },
          { name: dict.breadcrumbBlog },
        ]}
        eyebrow={dict.eyebrow}
        title={dict.heroTitle}
        description={dict.heroDescription}
      />
    <main className="px-5 md:px-10 lg:px-16 pt-8 md:pt-12 pb-12 md:pb-20">
      <div className="max-w-6xl mx-auto">

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-stone-200)] bg-white p-10 text-center text-[var(--color-stone-500)]">
            {dict.listEmpty}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {posts.map((post) => {
              const cover = versionedAssetUrl(
                resolveAssetUrl(post.cover_image),
                coverVersions,
                post.cover_image
              );
              const content = translated.get(post.id);
              const title = content?.title || post.title;
              const excerpt = content?.excerpt ?? post.excerpt;
              return (
                <Link
                  key={post.id}
                  href={`${localePrefix}/blog/${post.slug}`}
                  className="group flex flex-col rounded-2xl border border-[var(--color-stone-100)] bg-white overflow-hidden hover:border-[var(--color-stone-200)] hover:shadow-[0_12px_30px_-18px_rgb(27_26_23/0.18)] transition-all motion-reduce:transition-none"
                >
                  <div className="relative aspect-[16/10] bg-[var(--color-sand-50)] overflow-hidden">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={title}
                        fill
                        sizes="(max-width:768px) 100vw, 33vw"
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-500 motion-reduce:transition-none"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[var(--color-stone-300)] font-display text-3xl">
                        {title?.[0]?.toUpperCase() || "·"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 p-5">
                    {post.category && (
                      <span className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--brand-coral)] mb-2">
                        {post.category}
                      </span>
                    )}
                    <h2 className="font-display font-medium text-[18px] text-[var(--color-stone-900)] leading-snug tracking-[-0.01em]">
                      {title}
                    </h2>
                    {excerpt && (
                      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-stone-500)] line-clamp-3">
                        {excerpt}
                      </p>
                    )}
                    <div className="mt-4 pt-3 border-t border-[var(--color-stone-100)] flex items-center justify-between text-[12px] text-[var(--color-stone-400)]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={13} />
                        {formatPublishedAt(post.published_at, locale)}
                      </span>
                      <ArrowUpRight
                        size={15}
                        className="text-[var(--color-stone-300)] group-hover:text-[var(--brand-coral)] transition-colors"
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
    </>
  );
}
