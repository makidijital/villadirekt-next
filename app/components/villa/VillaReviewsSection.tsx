"use client";

/* ===============================================================
   🛡️ FAZ 33 — VILLA REVIEWS SECTION (public)
   ===============================================================
   Villa detay sayfasındaki guest yorum bölümü.

   PROPS:
     - villaId          → form submission target
     - reviews          → approved review listesi (cached, server-side)
     - stats            → { count, average } (cached, server-side)

   RENDER:
     1) HEADER — eyebrow + "Misafir Yorumları" + avg rating + count
     2) FEATURED CARD (varsa) — premium öne çıkan yorum
     3) REVIEW LIST — diğer yorumlar
     4) FORM — name + stars + comment + submit

   FORM:
     - Client-side validation (min 2 name / min 10 comment / 1..5 star)
     - Submit: createVillaReview server-callable service
     - Success: "Yorumunuz inceleme sonrası yayınlanacaktır." inline
     - Error: kırmızı inline message
     - Loading state submit button'da

   DESIGN:
     - rounded-2xl, soft shadow on hover
     - warm neutral palette (sand/stone/champagne)
     - elegant Star icons (lucide)
     - premium spacing
     - NO ecommerce review widget feel
   =============================================================== */

import { useMemo, useState } from "react";
import {
  Star,
  ShieldCheck,
  Quote,
  Sparkles,
  MessageSquarePlus,
  ChevronDown,
} from "lucide-react";

/* 🛡️ Migration VR-B1 — client boundary: runtime villa-review.service
   (server-only native repo'ya repoint edildi) yerine server action. Böylece
   service + native repo client bundle'a sızmaz. Call-site alias ile değişmez.
   Type'lar service'ten type-only (erase edilir → taint yok). */
import { createVillaReviewAction as createVillaReview } from "@/app/services/villa-review.action";
import type {
  VillaReviewPublic,
  VillaReviewStats,
} from "@/app/services/villa-review.service";
/* 🛡️ PHASE 10G — `formatDateForLocale(x, "tr")` çıktısı `formatDateTr(x)`
   ile BİREBİR AYNIDIR (lib/date-format.ts — aynı toIstanbulDate + aynı
   MONTHS_TR_SHORT). `locale` OPSİYONEL, default "tr" → TR çıktısı
   DEĞİŞMEZ. Yorum verisi/onay akışı/server action DOKUNULMADI. */
import { formatDateForLocale } from "@/lib/date-format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

const MIN_NAME_LEN = 2;
const MIN_COMMENT_LEN = 10;
const MAX_COMMENT_LEN = 1500;

export default function VillaReviewsSection({
  villaId,
  reviews,
  stats,
  locale,
}: {
  villaId: string;
  reviews: VillaReviewPublic[];
  stats: VillaReviewStats;
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const effectiveLocale: Locale = locale ?? "tr";
  /* Featured review header'ın altında yer alır; diğerleri liste içinde. */
  const { featured, rest } = useMemo(() => {
    const featuredIdx = reviews.findIndex((r) => r.is_featured);
    if (featuredIdx === -1) {
      return { featured: null as VillaReviewPublic | null, rest: reviews };
    }
    return {
      featured: reviews[featuredIdx],
      rest: reviews.filter((_, i) => i !== featuredIdx),
    };
  }, [reviews]);

  return (
    <section className="space-y-8">
      {/* ════════════════════════════════════════════════════
          HEADER
          ════════════════════════════════════════════════════ */}
      <header>
        <p className="eyebrow mb-3 flex items-center gap-2">
          <Star size={11} /> {dict.reviews.eyebrow}
        </p>
        <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
          {dict.reviews.title}
        </h2>

        {stats.count > 0 ? (
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="inline-flex items-baseline gap-2">
              <span
                className="font-display text-[32px] md:text-[40px] text-[var(--color-stone-900)] tracking-[-0.02em] tabular-nums"
              >
                {stats.average.toFixed(1)}
              </span>
              <span className="text-[var(--color-stone-500)] text-sm">
                {dict.reviews.outOfFive}
              </span>
            </div>
            <StarRow value={stats.average} size={16} locale={locale} />
            <span className="text-[13.5px] text-[var(--color-stone-500)] tabular-nums">
              {formatDictionaryString(dict.reviews.countLabel, {
                n: stats.count,
              })}
            </span>
          </div>
        ) : (
          <p className="text-[var(--color-stone-500)] mt-4 text-sm">
            {dict.reviews.empty}
          </p>
        )}
      </header>

      {/* ════════════════════════════════════════════════════
          FEATURED REVIEW (varsa)
          ════════════════════════════════════════════════════ */}
      {featured && (
        <article
          className="
            relative rounded-2xl
            bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
            p-6 md:p-8
            shadow-soft
          "
        >
          <span
            className="
              absolute top-4 right-4
              inline-flex items-center gap-1.5
              text-[10.5px] tracking-[0.18em] uppercase font-medium
              text-[var(--color-champagne-700)]
            "
            aria-label={dict.reviews.featuredAriaLabel}
          >
            <Sparkles size={11} />
            {dict.reviews.featuredBadge}
          </span>
          <Quote
            size={28}
            className="text-[var(--color-champagne-500)] opacity-50"
            aria-hidden
          />
          <p
            className="
              mt-3 text-[16px] md:text-[17px] leading-[1.75]
              text-[var(--color-stone-700)] italic
              whitespace-pre-line
            "
          >
            {featured.comment}
          </p>
          <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Avatar name={featured.guest_name} />
              <div>
                <p className="font-display text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em]">
                  {featured.guest_name}
                </p>
                {featured.created_at && (
                  <p className="text-[11.5px] text-[var(--color-stone-400)] mt-0.5 tabular-nums">
                    {formatDateForLocale(featured.created_at, effectiveLocale)}
                  </p>
                )}
              </div>
            </div>
            <StarRow value={featured.rating} size={14} locale={locale} />
          </div>
        </article>
      )}

      {/* ════════════════════════════════════════════════════
          REVIEW LIST
          ════════════════════════════════════════════════════ */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rest.map((r) => (
            <ReviewCard key={r.id} review={r} locale={locale} />
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          FORM — accordion (default kapalı)
          ════════════════════════════════════════════════════
          UX: form default kapalı; "Yorum Yap" CTA görünür.
          Tıklayınca form expand olur, tekrar tıklayınca toggle.
          Submit logic / form state / API / validation YALNIZ
          ReviewForm içinde — accordion sadece visibility layer'ı. */}
      <ReviewFormAccordion villaId={villaId} locale={locale} />
    </section>
  );
}

/* ===============================================================
   📝 REVIEW FORM ACCORDION — visibility wrapper
   ===============================================================
   Default kapalı: premium CTA pill ("Yorum Yap").
   Açık: aynı CTA "Formu Kapat" olur; form altında render edilir.

   Submit / state / API / validation logic DOKUNULMADI — wrapper
   yalnız mount/unmount kontrolü yapar. Form içindeki tüm state
   (name, rating, comment, status) ReviewForm component'ine
   ait — accordion remount'ta state sıfırlanır (ekstra kontrol
   gerekmez; mevcut UX kabulü).
   =============================================================== */
function ReviewFormAccordion({
  villaId,
  locale,
}: {
  villaId: string;
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="
          group inline-flex items-center gap-2.5
          rounded-full border border-[var(--color-stone-200)]
          bg-white px-5 py-2.5
          text-[13.5px] font-medium text-[var(--color-stone-800)]
          shadow-soft
          hover:border-[var(--color-champagne-300)]
          hover:text-[var(--color-stone-900)]
          transition-colors motion-reduce:transition-none
          focus:outline-none focus-visible:ring-2
          focus-visible:ring-[var(--color-champagne-300)]
        "
      >
        <MessageSquarePlus
          size={14}
          className="text-[var(--color-champagne-600)]"
          aria-hidden
        />
        {isOpen ? dict.reviews.formClose : dict.reviews.formOpen}
        <ChevronDown
          size={14}
          aria-hidden
          className={
            "text-[var(--color-stone-400)] transition-transform duration-200 motion-reduce:transition-none " +
            (isOpen ? "rotate-180" : "rotate-0")
          }
        />
      </button>
      {isOpen && <ReviewForm villaId={villaId} locale={locale} />}
    </div>
  );
}

/* ===============================================================
   AVATAR — guest name initials
   ===============================================================
   "İlhan Demir" → "İD". Sand/champagne ring; premium hospitality
   hissi (avatar foto YOK; veri tutulmuyor). */
function Avatar({ name }: { name: string }) {
  const initials = useMemo(() => {
    const parts = String(name || "")
      .trim()
      .split(/\s+/);
    if (parts.length === 0) return "·";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);

  return (
    <span
      className="
        w-10 h-10 rounded-full
        bg-[var(--color-sand-100)]
        border border-[var(--color-stone-100)]
        flex items-center justify-center
        font-display text-[14px] text-[var(--color-champagne-700)]
        tracking-[-0.01em]
      "
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ===============================================================
   REVIEW CARD — list item
   =============================================================== */
function ReviewCard({
  review,
  locale,
}: {
  review: VillaReviewPublic;
  locale?: Locale;
}) {
  const effectiveLocale: Locale = locale ?? "tr";
  return (
    <article
      className="
        rounded-2xl bg-white border border-[var(--color-stone-100)]
        p-5 md:p-6
        hover:border-[var(--color-champagne-300)]
        hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
        transition-colors motion-reduce:transition-none
        flex flex-col gap-3
      "
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={review.guest_name} />
          <div className="min-w-0">
            <p className="font-display text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
              {review.guest_name}
            </p>
            {review.created_at && (
              <p className="text-[11.5px] text-[var(--color-stone-400)] mt-0.5 tabular-nums">
                {formatDateForLocale(review.created_at, effectiveLocale)}
              </p>
            )}
          </div>
        </div>
        <StarRow value={review.rating} size={13} locale={locale} />
      </div>

      <p
        className="
          text-[14.5px] text-[var(--color-stone-700)]
          leading-[1.7] whitespace-pre-line
        "
      >
        {review.comment}
      </p>
    </article>
  );
}

/* ===============================================================
   STAR ROW — display
   =============================================================== */
function StarRow({
  value,
  size = 13,
  locale,
}: {
  value: number;
  size?: number;
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const rounded = Math.round(value);
  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-500"
      aria-label={formatDictionaryString(dict.reviews.ratingAriaLabel, {
        value: value.toFixed(1),
      })}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= rounded ? "currentColor" : "none"}
          className={
            i <= rounded ? "" : "text-[var(--color-stone-300)]"
          }
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

/* ===============================================================
   STAR PICKER — form input
   ===============================================================
   1..5 yıldız; hover preview. ARIA: radiogroup.
=============================================================== */
function StarPicker({
  value,
  onChange,
  disabled,
  locale,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const [hover, setHover] = useState<number | null>(null);
  const displayed = hover ?? value;

  return (
    <div
      role="radiogroup"
      aria-label={dict.reviews.ratingPickerAriaLabel}
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= displayed;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            disabled={disabled}
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            className={
              "p-1 rounded-md transition-colors motion-reduce:transition-none " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-300)] " +
              "disabled:opacity-50 disabled:cursor-not-allowed " +
              (filled ? "text-amber-500" : "text-[var(--color-stone-300)]")
            }
            aria-label={formatDictionaryString(dict.reviews.starAriaLabel, {
              n: i,
            })}
          >
            <Star size={22} fill={filled ? "currentColor" : "none"} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

/* ===============================================================
   REVIEW FORM
   ===============================================================
   Inline status feedback (toast yok — public toast provider yok).
   Submit success sonrası form resetlenir.
=============================================================== */
type FormStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function ReviewForm({
  villaId,
  locale,
}: {
  villaId: string;
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  const trimmedName = name.trim();
  const trimmedComment = comment.trim();

  const isLoading = status.kind === "loading";
  const isReady =
    trimmedName.length >= MIN_NAME_LEN &&
    trimmedComment.length >= MIN_COMMENT_LEN &&
    rating >= 1 &&
    rating <= 5 &&
    !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setStatus({ kind: "loading" });
    const res = await createVillaReview({
      villa_id: villaId,
      guest_name: trimmedName,
      rating,
      comment: trimmedComment,
    });

    if (!res.ok) {
      /* 🛡️ PUBLIC ÇOKLU DİL — servis TR validation/hata metni döndürür;
         EN/DE kullanıcısına ham sunucu metni BASILMAZ. Diğer public
         formlarla (`reservation` / `contact` / `offer`) AYNI desen:
         dictionary'den locale-aware generic mesaj. Servis contract'ı,
         `res.error` alanı ve iş mantığı DEĞİŞMEDİ. */
      setStatus({ kind: "error", message: dict.reviews.errorGeneric });
      return;
    }

    setStatus({ kind: "success" });
    /* Form reset — başarılı kayıt sonrası. */
    setName("");
    setComment("");
    setRating(5);
  };

  return (
    <div
      className="
        rounded-2xl bg-white border border-[var(--color-stone-100)]
        p-6 md:p-8 shadow-soft
      "
    >
      <div className="flex items-start gap-3 mb-5">
        <span
          className="
            w-10 h-10 rounded-full
            bg-[var(--color-sand-100)] border border-[var(--color-stone-100)]
            flex items-center justify-center
            text-[var(--color-champagne-700)]
          "
          aria-hidden
        >
          <Quote size={16} />
        </span>
        <div>
          <h3 className="font-display text-[18px] md:text-[20px] text-[var(--color-stone-900)] tracking-[-0.015em]">
            {dict.reviews.formTitle}
          </h3>
          <p className="text-[12.5px] text-[var(--color-stone-500)] mt-1">
            {dict.reviews.formSubtitle}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* NAME */}
        <div>
          <label
            htmlFor="review-name"
            className="block text-[12px] tracking-[0.04em] uppercase font-medium text-[var(--color-stone-500)] mb-1.5"
          >
            {dict.reviews.nameLabel}
          </label>
          <input
            id="review-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
            maxLength={80}
            placeholder={dict.reviews.namePlaceholder}
            className="
              w-full
              rounded-xl border border-[var(--color-stone-200)]
              bg-white
              px-4 py-2.5 text-[14.5px] text-[var(--color-stone-900)]
              placeholder:text-[var(--color-stone-400)]
              focus:outline-none focus:border-[var(--color-champagne-400)]
              focus:ring-2 focus:ring-[var(--color-champagne-200)]
              transition-colors motion-reduce:transition-none
              disabled:opacity-60
            "
          />
        </div>

        {/* RATING */}
        <div>
          <p className="block text-[12px] tracking-[0.04em] uppercase font-medium text-[var(--color-stone-500)] mb-1.5">
            {dict.reviews.ratingLabel}
          </p>
          <StarPicker
            value={rating}
            onChange={setRating}
            disabled={isLoading}
            locale={locale}
          />
        </div>

        {/* COMMENT */}
        <div>
          <label
            htmlFor="review-comment"
            className="block text-[12px] tracking-[0.04em] uppercase font-medium text-[var(--color-stone-500)] mb-1.5"
          >
            {dict.reviews.commentLabel}
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isLoading}
            rows={5}
            maxLength={MAX_COMMENT_LEN}
            placeholder={dict.reviews.commentPlaceholder}
            className="
              w-full
              rounded-xl border border-[var(--color-stone-200)]
              bg-white
              px-4 py-3 text-[14.5px] text-[var(--color-stone-700)]
              placeholder:text-[var(--color-stone-400)]
              leading-[1.7]
              focus:outline-none focus:border-[var(--color-champagne-400)]
              focus:ring-2 focus:ring-[var(--color-champagne-200)]
              transition-colors motion-reduce:transition-none
              disabled:opacity-60
              resize-y min-h-[120px]
            "
          />
          <div className="flex justify-between items-center mt-1.5 text-[11px] text-[var(--color-stone-400)] tabular-nums">
            <span>
              {formatDictionaryString(dict.reviews.minChars, {
                n: MIN_COMMENT_LEN,
              })}
            </span>
            <span>
              {trimmedComment.length} / {MAX_COMMENT_LEN}
            </span>
          </div>
        </div>

        {/* STATUS */}
        {status.kind === "success" && (
          <div
            role="status"
            className="
              flex items-center gap-2.5
              rounded-xl border border-emerald-200 bg-emerald-50
              px-4 py-3 text-[13.5px] text-emerald-800
            "
          >
            <ShieldCheck size={15} aria-hidden />
            <span>
              {dict.reviews.successMessage}
            </span>
          </div>
        )}
        {status.kind === "error" && (
          <div
            role="alert"
            className="
              rounded-xl border border-red-200 bg-red-50
              px-4 py-3 text-[13.5px] text-red-800
            "
          >
            {status.message}
          </div>
        )}

        {/* SUBMIT */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isReady}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? dict.reviews.submitting : dict.reviews.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
