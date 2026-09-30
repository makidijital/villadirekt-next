import { Star, ArrowUpRight } from "lucide-react";

import type { HeroReviewStats } from "../_types/hero";

/* ===============================================================
   🛡️ FAZ 3 — HeroReviewCard (PURE PRESENTATIONAL)
   ===============================================================
   Eski Hero.tsx > floating review card (L500-562) BYTE-IDENTICAL
   kopyası. FAZ 39F — real-data overlay; count===0 → render YOK.

   ⚠️ KESIN KURAL:
     - `reviewStats && reviewStats.count > 0` guard AYNEN (caller-side
       conditional bu component'in dışında DEĞİL; ↓ buradadır).
     - `aria-label` template string aynen.
     - `reviewStats.average.toFixed(1)` aynen.
     - `Star size={15} fill="currentColor" strokeWidth={1.5}` aynen.
     - "hidden sm:inline-flex" responsive class aynen.
     - "absolute -bottom-5 left-5 md:left-7" konum aynen.
     - Glassmorphism class'ları (white/70 + backdrop-blur-2xl +
       ring-white/50) AYNEN.
   =============================================================== */

export default function HeroReviewCard({
  reviewStats,
}: {
  reviewStats: HeroReviewStats | null | undefined;
}) {
  if (!reviewStats || reviewStats.count <= 0) return null;

  return (
    <a
      href="#misafir-deneyimleri"
      aria-label={`Misafir puanı ${reviewStats.average.toFixed(
        1
      )} / 5, ${reviewStats.count} gerçek yorum — tüm yorumları gör`}
      className="
        group
        hidden sm:inline-flex
        absolute -bottom-5 left-5 md:left-7
        items-center gap-3
        rounded-2xl
        bg-white/70 backdrop-blur-2xl backdrop-saturate-150
        ring-1 ring-inset ring-white/50
        border border-white/30
        px-4 py-3
        shadow-[0_18px_36px_-18px_rgba(27,26,23,0.18)]
        hover:bg-white/82 hover:-translate-y-[1px]
        hover:shadow-[0_22px_44px_-18px_rgba(27,26,23,0.22)]
        transition-[transform,background-color,box-shadow] duration-300
        motion-reduce:transition-none motion-reduce:hover:translate-y-0
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--brand-coral)]/40
      "
    >
      <span
        className="
          w-9 h-9 rounded-xl
          bg-amber-50/90 border border-amber-100/80
          flex items-center justify-center
          text-amber-500
        "
        aria-hidden
      >
        <Star size={15} fill="currentColor" strokeWidth={1.5} />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
          Misafir Puanı
        </p>
        <p className="font-display text-[16px] text-[var(--color-stone-900)] tracking-[-0.01em] tabular-nums leading-tight">
          {reviewStats.average.toFixed(1)}
          <span className="text-[12.5px] text-[var(--color-stone-500)] font-sans ml-1.5 tracking-normal tabular-nums">
            / 5 · {reviewStats.count} gerçek yorum
          </span>
        </p>
      </div>
      {/* Minimal CTA — Tüm yorumları gör (anchor) */}
      <span
        className="
          ml-1 inline-flex items-center justify-center
          w-7 h-7 rounded-full
          text-[var(--color-stone-700)]
          group-hover:text-[var(--brand-coral)]
          group-hover:bg-[var(--brand-coral-tint)]
          transition-colors motion-reduce:transition-none
        "
        aria-hidden
      >
        <ArrowUpRight size={14} strokeWidth={1.75} />
      </span>
    </a>
  );
}
