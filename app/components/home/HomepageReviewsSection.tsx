import { getCachedHomepageReviews } from "@/lib/cache.helpers";
import ReviewsCarousel, {
  type CarouselReview,
} from "./ReviewsCarousel";
/* 🛡️ PHASE 11 — yalnız section başlıkları çevrilir. Yorum METNİ ve
   misafir adı KULLANICI ÜRETİMİDİR; villa adı özel isimdir → çevrilmez. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ HOMEPAGE REVIEWS SECTION — sabit yükseklikli premium carousel
   ===============================================================
   PROBLEM (eski): grid 3/2/1 — yorum sayısı arttıkça kartlar alt
   alta uzuyor, homepage büyüyordu.
   ÇÖZÜM: yorumlar Embla carousel içinde döner; 5 de olsa 500 de
   olsa section yüksekliği sabit.

   KORUNDU:
     - Veri kaynağı: getCachedHomepageReviews (approved-only,
       featured-first) — DOKUNULMADI.
     - Review + puan sistemi — DOKUNULMADI.
   DEĞİŞEN: yalnız UI (server header + trust band + client carousel).

   TRUST BAND: gerçek global istatistik (getCachedGlobalReviewStats)
     → "X.X/5 Ortalama · YYY Doğrulanmış Misafir Yorumu".

   EMPTY STATE: reviews.length === 0 → null (CLS yok).
=============================================================== */

export default async function HomepageReviewsSection({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const dict = getDictionary(locale).home.reviews;
  const reviews = await getCachedHomepageReviews().catch(() => []);

  if (!reviews || reviews.length === 0) return null;

  /* Carousel slim shape'e map (veri kaynağı aynen). Villa adı + cover
     mevcut review datasından eklenir — yeni fetch YOK. */
  const carouselReviews: CarouselReview[] = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    guest_name: r.guest_name,
    created_at: r.created_at ?? null,
    villaTitle: r.villa.title ?? "",
    villaCover: r.villa.cover_image ?? null,
  }));

  return (
    <section
      id="misafir-deneyimleri"
      aria-label={dict.sectionAriaLabel}
      className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-12 md:pb-16"
    >
      <div className="max-w-[1280px] mx-auto">
        {/* HEADER — editorial: mikro çizgi + uppercase mikro-etiket +
               sol hizali başlık. Metinler (h2/p) BİREBİR aynı, sadece
               sunum "guest stories" diline uyacak şekilde yeniden
               düzenlendi. */}
        <div className="mb-10 md:mb-14 max-w-xl">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-stone-400)]">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-px bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
            />
            {dict.eyebrow}
          </span>
          <h2 className="mt-4 font-display font-medium text-[28px] md:text-[36px] text-[var(--color-stone-900)] leading-[1.08] tracking-[-0.02em]">
            {dict.title}
          </h2>
          <p className="mt-3 text-[14.5px] md:text-[15px] leading-relaxed text-[var(--color-stone-500)]">
            {dict.subtitle}
          </p>
        </div>

        {/* CAROUSEL — client island (Embla) */}
        <ReviewsCarousel reviews={carouselReviews} locale={locale} />
      </div>
    </section>
  );
}
