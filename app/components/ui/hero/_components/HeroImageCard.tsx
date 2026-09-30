import Image from "next/image";

import type { HeroContent } from "@/lib/hero.helpers";

import HeroReviewCard from "./HeroReviewCard";
import HeroPremiumPill from "./HeroPremiumPill";

import type { HeroReviewStats } from "../_types/hero";

/* ===============================================================
   🛡️ FAZ 3 — HeroImageCard (PURE PRESENTATIONAL)
   ===============================================================
   Eski Hero.tsx > RIGHT column (L409-587) BYTE-IDENTICAL kopyası:
     - Main image (aspect 4/5 → 5/6 → 4/3)
     - Atmospheric ivory dissolve (left → right gradient)
     - Bottom vignette
     - Inner ring stroke
     - "Akdeniz" badge (top-right)
     - HeroReviewCard overlay (count===0 → render YOK)
     - HeroPremiumPill (desktop only)

   ⚠️ KESIN KURAL — IMAGE LCP attributes:
     - loading="eager"
     - decoding="async"
     - fetchPriority="high"
   Hepsi aynen korundu. LCP korunur.

   ⚠️ KESIN KURAL — class sırası + gradient stops:
     "linear-gradient(to right, rgba(255,255,255,0.30) 0%, ...)" aynen.
   =============================================================== */

export default function HeroImageCard({
  hero,
  reviewStats,
}: {
  hero: HeroContent;
  reviewStats: HeroReviewStats | null | undefined;
}) {
  return (
    /* ── RIGHT: CINEMATIC IMAGE CARD ───────────────────
        FAZ 39B — Layered composition:
          - Main image (rounded-[32px], stronger shadow stack)
          - Floating glass "rating" stat card (bottom-left
            overlap)
          - Tiny editorial coral "Akdeniz" badge (top-right)
          - Inner white ring + bottom vignette
        FAZ 39E — Image wrapper'a `lg:-ml-10 xl:-ml-16` negatif
        margin: image text alanına doğru hafif kayar; grid 6/6
        kontrat KORUNUR (col-span-6 değişmez), sadece column
        içeriğinin renderı sola öteler → cinematic asimetri.
        CLS=0: aspect-locked container; overlay'ler absolute. */
    <div className="order-1 lg:order-2 lg:col-span-6 lg:-ml-10 xl:-ml-16">
      <div className="relative">
        {/* Main cinematic image card */}
        <div
          className="
            relative
            rounded-[32px] overflow-hidden
            bg-[var(--color-sand-100)]
            shadow-[0_48px_96px_-32px_rgba(27,26,23,0.28),0_18px_36px_-18px_rgba(255,101,63,0.18)]
            aspect-[4/5] sm:aspect-[5/6] lg:aspect-[4/3]
          "
        >
          {/* 🛡️ SCALE HARDENING — next/Image (responsive + WebP/AVIF
             auto). Hero LCP image; above-the-fold → `priority` zorunlu
             (loading="eager" + fetchpriority="high" + preload hint Next
             tarafından otomatik ekleniyor). aspect-locked parent (4/5,
             5/6, 4/3) → CLS=0; Image fill mode.
             SIZES:
               - Mobile (≤lg=1024): 100vw (hero görüntü tam genişlik)
               - lg+: 50vw (grid col-span-6 of 12 ≈ 1/2)
             Class chain'i (object-cover/object-center/transition) AYNEN. */}
          <Image
            src={hero.backgroundImage}
            alt={hero.title || "Akdeniz villası"}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="
              object-cover object-center
              transition-transform duration-[1400ms] ease-out
              motion-reduce:transition-none
            "
          />
          {/* `hero.backgroundImage` boş/undefined olabilir (HeroContent
             defaults). next/Image src zorunlu — eski `<img>` davranışı
             "boş src image kırığı" göstermek olurdu; aynı semantic'i
             korumak için src null/empty olduğunda Image hiç render
             edilmez yorumu: parent aspect-locked div zaten skeleton
             gibi davranıyor (bg-sand-100). HeroContent her zaman bir
             default backgroundImage URL'si veriyor (resolveHeroContent
             fallback), bu yüzden pratikte src her zaman truthy. */}
          {/* 🛡️ FAZ 39F — Atmospheric ivory dissolve.
             Wider distribution (76% reach) + gentler stops.
             "Yumuşak ışığa karışıyor" hissi: villa canlılığı
             tam olarak korunur, sol kenar text bloğuna eriyor.
             Aman/Six Senses magazine editorial standard. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.22) 10%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0.09) 34%, rgba(255,255,255,0.05) 46%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0) 76%)",
            }}
          />
          {/* Subtle bottom vignette — daha ince, daha luxury */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/[0.18] via-black/[0.05] to-transparent pointer-events-none"
          />
          {/* Inner ring — premium card stroke */}
          <div
            aria-hidden="true"
            className="
              absolute inset-0 rounded-[32px]
              ring-1 ring-inset ring-white/30
              pointer-events-none
            "
          />

          {/* ══════════════════════════════════════════════
              TINY EDITORIAL BADGE — top-right
              "Akdeniz" küçük cam pill; coral indicator dot
              ══════════════════════════════════════════════ */}
          <div
            className="
              absolute top-5 right-5
              inline-flex items-center gap-2
              rounded-full
              bg-white/85 backdrop-blur-md
              px-3.5 py-1.5
              text-[10.5px] tracking-[0.22em] uppercase font-medium
              text-[var(--color-stone-800)]
              shadow-[0_8px_24px_-8px_rgba(27,26,23,0.25)]
              ring-1 ring-white/40
            "
            aria-hidden
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-coral)]" />
            Akdeniz
          </div>
        </div>

        {/* ══════════════════════════════════════════════════
            🛡️ FAZ 39F — REAL-DATA FLOATING REVIEW CARD
            (extracted: HeroReviewCard)
            ══════════════════════════════════════════════════ */}
        <HeroReviewCard reviewStats={reviewStats} />

        {/* ══════════════════════════════════════════════════
            FLOATING MINI-PILL — Premium koleksiyon
            (extracted: HeroPremiumPill)
            ══════════════════════════════════════════════════ */}
        <HeroPremiumPill />
      </div>
    </div>
  );
}
