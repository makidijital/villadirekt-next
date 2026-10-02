"use client";

/* ===============================================================
   🛡️ ReviewsCarousel — "Guest Stories" editorial testimonial rail
   ===============================================================
   ÖNCEKİ TASARIM: klasik 3/2/1 sütun beyaz kart carousel'i (Embla).
   YENİ TASARIM: tek seferde TEK büyük "aktif" yorum, editorial
   tipografi + dekoratif büyük tırnak işareti; diğer misafirler
   altta minimal bir "story rail" (isim navigasyonu) olarak
   listelenir; aktif konum ince turuncu→mavi bir progress çizgisiyle
   gösterilir. Klasik "3 beyaz kart yan yana" + ağır border/shadow
   yapısı KALDIRILDI.

   KORUNAN (veri/mantık — DOKUNULMADI):
     - CarouselReview tipi ve tüm alanları (id/rating/comment/
       guest_name/created_at/villaTitle/villaCover) — HomepageReviewsSection
       tarafından aynen üretilip geçiliyor.
     - Embla carousel altyapısı (mevcut proje bağımlılığı; yeni
       dependency eklenmedi) — artık tek-slide (basis-full) modunda,
       isim rail'i + swipe (mobil native drag) ile senkron.
     - Yorum metni uzun ise "Devamını oku" genişletme davranışı
       (isLong / expanded state) AYNEN korundu — sadece stil.
     - Misafir avatarı (initials) — Avatar() fonksiyonu AYNEN.
     - Villa küçük görseli (villaCover) + fallback baş harfi — AYNEN,
       yalnızca konum/boyutu meta satırına taşındı.
     - Puan gösterimi (yıldız + sayı) — AYNEN, sadece minimal
       yerleşim.

   DEĞİŞEN (yalnız UX/etkileşim, açıkça istenen yön):
     - Agresif otomatik kayan autoplay KALDIRILDI (brief: "sürekli
       otomatik kayan agresif carousel yapma") — gezinme artık
       kullanıcı kontrolünde: isim rail'ine tıklama, swipe (mobil)
       veya klavye/tab ile rail butonları.
     - Sağ/sol ok butonları kaldırıldı; yerine isim rail'i + ince
       progress çizgisi geldi (brief'teki "story rail" alternatifi).
     - GÜNCEL: alttaki isim rail'i (misafir isim butonları) KALDIRILDI.
       Gezinme Embla sürükleme/swipe ile; ince progress çizgisi ve
       select/reInit senkronu AYNEN duruyor.

   prefers-reduced-motion: tüm geçişler zaten kısa/hafif (renk,
   width, opacity) — motion-reduce:transition-none ile tamamen
   durağan hale gelir, layout/behavior etkilenmez.
=============================================================== */

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Star } from "lucide-react";

import { formatDateForLocale } from "@/lib/date-format";
/* 🛡️ PHASE 11 P0 — görünür buton metinleri + accessibility metinleri
   locale'e göre. Veri/mantık (Embla, expanded state, CarouselReview)
   DEĞİŞMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export type CarouselReview = {
  id: string;
  rating: number;
  comment: string;
  guest_name: string;
  created_at: string | null;
  /** Yorum yapılan villanın adı + cover URL (mevcut review datasından;
   *  yeni fetch yok). cover_image zaten resolve edilmiş absolute URL. */
  villaTitle: string;
  villaCover: string | null;
};

type Props = {
  reviews: CarouselReview[];
};

export default function ReviewsCarousel({
  reviews,
  locale = DEFAULT_LOCALE,
}: Props & { locale?: Locale }) {
  const canNavigate = reviews.length > 1;

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: canNavigate,
    align: "start",
    /* "auto" → görünen kart sayısı kadar sayfa sayfa kayar (lg 3, md 2,
       mobil 1). Böylece lg'de her sayfanın ORTA kartı hep 3n+2. sırada
       kalır → hafif staggered offset tutarlı. */
    slidesToScroll: "auto",
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  /* slidesToScroll "auto" → snap (sayfa) sayısı breakpoint'e göre değişir;
     progress bunu baz alır (reInit'te güncellenir). */
  const [snapCount, setSnapCount] = useState(reviews.length);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setSnapCount(emblaApi.scrollSnapList().length || 1);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const total = Math.max(1, snapCount);

  return (
    <div>
      {/* VIEWPORT — tek aktif yorum, tam genişlik editorial kompozisyon */}
      {/* VIEWPORT — pt/pb: hover lift + orta kart offset'i + gölge
          kırpılmasın. Mobil 1 / tablet 2 / desktop 3 kart; Embla gutter
          deseni (negatif margin + slide padding). */}
      <div className="overflow-hidden -mx-2 px-2 pt-2 pb-6" ref={emblaRef}>
        <div className="flex -ml-5 md:-ml-6 lg:-ml-7">
          {reviews.map((r, i) => (
            <div
              key={r.id}
              className={
                "shrink-0 grow-0 basis-full md:basis-1/2 lg:basis-1/3 pl-5 md:pl-6 lg:pl-7 " +
                /* Desktop'ta orta kart 10px aşağıda; mobil/tablet hizalı. */
                (i % 3 === 1 ? "lg:translate-y-[10px]" : "")
              }
            >
              <ActiveTestimonial review={r} locale={locale} variant={i % 3} />
            </div>
          ))}
        </div>
      </div>

      {canNavigate && total > 1 && (
        <>
          {/* PROGRESS — ince turuncu→mavi çizgi; aktif konumu gösterir */}
          <div
            aria-hidden="true"
            className="mt-6 md:mt-8 mx-auto h-[2px] w-full max-w-[240px] bg-[#EADFCC] rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-brand transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${((selectedIndex + 1) / total) * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ===============================================================
   ActiveTestimonial — sıcak krem testimonial kartı:
   üstte yıldızlar + büyük dekoratif tırnak, ortada yorum (ana içerik),
   altta avatar + isim (+ tarih) + varsa villa. Veri/expanded mantığı
   AYNEN; `variant` yalnız küçük görsel farklılık (yüzey/tırnak tonu).
   =============================================================== */
const CARD_VARIANTS = [
  { surface: "bg-[#FFFDF8]", quote: "text-brand/20" },
  { surface: "bg-white", quote: "text-brand/35" },
  { surface: "bg-[#FFFAF1]", quote: "text-brand/25" },
] as const;

function ActiveTestimonial({
  review,
  locale = DEFAULT_LOCALE,
  variant = 0,
}: {
  review: CarouselReview;
  locale?: Locale;
  variant?: number;
}) {
  const dict = getDictionary(locale).home.reviews;
  const [expanded, setExpanded] = useState(false);
  const rating = Math.max(0, Math.min(5, Math.round(review.rating)));
  const comment = (review.comment || "").trim();
  const isLong = comment.length > 320;
  const v = CARD_VARIANTS[variant % CARD_VARIANTS.length];

  return (
    <article
      className={
        "group relative h-full flex flex-col rounded-[26px] border border-[#EEE3D1] p-6 md:p-7 " +
        v.surface +
        " shadow-[0_14px_34px_-26px_rgba(80,55,20,0.35)] " +
        "hover:-translate-y-1 hover:shadow-[0_22px_44px_-26px_rgba(80,55,20,0.45)] " +
        "transition-[transform,box-shadow] duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      }
    >
      {/* ÜST — yıldızlar (puan AYNEN) + dekoratif büyük tırnak */}
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex items-center gap-0.5 pt-1"
          aria-label={`${rating} / 5 puan`}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              size={15}
              strokeWidth={1.5}
              aria-hidden
              className={i < rating ? "text-accent" : "text-[#E6DCCB]"}
              fill="currentColor"
            />
          ))}
        </span>
        <span
          aria-hidden="true"
          className={"font-display text-[72px] leading-[0.7] -mt-1 select-none " + v.quote}
        >
          &ldquo;
        </span>
      </div>

      {/* ORTA — yorum metni (kartın ana içeriği) */}
      <blockquote
        className="mt-3 text-[15px] leading-[1.75] text-[var(--color-stone-700)]"
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: 6,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {comment}
      </blockquote>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="
            mt-2 self-start text-[12.5px] font-medium
            text-brand hover:text-brand
            transition-colors motion-reduce:transition-none
            focus:outline-none focus-visible:underline
          "
          aria-expanded={expanded}
        >
          {expanded ? dict.readLess : dict.readMore}
        </button>
      )}

      {/* ALT — avatar + isim (+ tarih), varsa villa bilgisi */}
      <div className="mt-auto pt-6">
        <div className="pt-5 border-t border-[#EEE3D1] flex items-center gap-3 min-w-0">
          <Avatar name={review.guest_name} />
          <div className="min-w-0">
            <p className="font-display font-semibold text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
              {review.guest_name}
            </p>
            <div className="mt-0.5 flex items-center gap-2 min-w-0 text-[12px] text-[var(--color-stone-500)]">
              {review.created_at && (
                <span className="tabular-nums shrink-0">
                  {formatDateForLocale(review.created_at, locale)}
                </span>
              )}
              {review.created_at && review.villaTitle && (
                <span aria-hidden="true" className="text-[#D9CCB6]">·</span>
              )}
              {review.villaTitle && (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="relative shrink-0 w-5 h-5 overflow-hidden rounded-full bg-[var(--color-sand-100)]">
                    {review.villaCover ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={review.villaCover}
                        alt={review.villaTitle}
                        loading="lazy"
                        className="w-full h-full object-cover object-center"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center select-none font-display text-[9px] text-[var(--color-stone-300)]">
                        {(review.villaTitle?.[0] || "·").toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="truncate">{review.villaTitle}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Avatar({ name }: { name: string }) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/);
  const initials =
    parts.length === 0 || parts[0] === ""
      ? "·"
      : parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

  return (
    <span
      className="
        w-10 h-10 rounded-full shrink-0
        bg-[#F3EADB]
        border border-[#EADFCC]
        flex items-center justify-center
        font-display font-semibold text-[14px] text-brand
        tracking-[-0.01em]
      "
      aria-hidden
    >
      {initials}
    </span>
  );
}
