import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { HeroContent } from "@/lib/hero.helpers";

/* ===============================================================
   🛡️ FAZ 3 — HeroCopy (PURE PRESENTATIONAL)
   ===============================================================
   Eski Hero.tsx > LEFT column'un (L258-395) BYTE-IDENTICAL kopyası:
     - Eyebrow (coral indicator + animate-ping)
     - Editorial serif title (2-line split)
     - Script italic accent line ("Tatilin en özel hali.")
     - Body subtitle
     - Primary + Secondary CTA row (FAZ 39B enforced CTA pair)

   ⚠️ KESIN KURAL:
     - titleLines = hero.title.split("\n") AYNEN (eski hero.title.split
       parent'ta yapılıyordu; bu component kendi içinde aynı pattern).
     - 2 CTA URL fallback chain (hero.primaryCta?.href || "/arama",
       hero.secondaryCta?.href || "/iletisim") AYNEN.
     - 2 CTA text fallback chain ("Villaları keşfet", "Bize ulaşın") AYNEN.
     - Tailwind class sırası BYTE-IDENTICAL.
     - animate-ping coral dot konumu (eyebrow span içinde) korunur.
     - motion-reduce: transition-none aynen.
   =============================================================== */

export default function HeroCopy({ hero }: { hero: HeroContent }) {
  const titleLines = hero.title.split("\n");

  return (
    <div className="order-2 lg:order-1 lg:col-span-6">
      {/* Eyebrow — coral, uppercase tracking, coral indicator dot */}
      <p
        className="
          text-[11px] tracking-[0.32em] uppercase font-medium
          inline-flex items-center gap-3
          text-[var(--brand-coral)]
        "
      >
        <span
          aria-hidden="true"
          className="
            relative inline-flex w-1.5 h-1.5 rounded-full
            bg-[var(--brand-coral)]
          "
        >
          <span
            aria-hidden="true"
            className="
              absolute inset-0 rounded-full bg-[var(--brand-coral)]
              animate-ping opacity-60
            "
          />
        </span>
        {hero.badge}
      </p>

      {/* Editorial serif title — daha dramatic scale, daha sıkı leading */}
      <h1
        className="
          font-display
          text-[44px] sm:text-[60px] md:text-[76px] lg:text-[88px]
          leading-[0.98] tracking-[-0.03em]
          text-[var(--color-stone-900)]
          mt-6 md:mt-8
        "
      >
        {titleLines.map((line, i) => (
          <span
            key={i}
            className={i === 0 ? "block" : "block text-[var(--color-stone-400)]"}
          >
            {line}
          </span>
        ))}
      </h1>

      {/* Script italic accent — premium signature line.
         Subtle underline accent: küçük coral line, luxury
         magazine signature feel. */}
      <div className="mt-6 md:mt-7 inline-flex items-center gap-3">
        <span
          aria-hidden="true"
          className="hidden md:inline-block w-10 h-px bg-[var(--brand-coral)]/40"
        />
        <p
          className="
            font-display italic
            text-[28px] md:text-[36px] lg:text-[42px]
            tracking-[-0.012em]
            text-[var(--brand-coral)]
            leading-none
          "
        >
          Tatilin en özel hali.
        </p>
      </div>

      {/* Body subtitle */}
      <p className="text-[15px] md:text-[16.5px] leading-[1.75] text-[var(--color-stone-500)] mt-7 md:mt-9 max-w-xl whitespace-pre-line">
        {hero.subtitle}
      </p>

      {/* ════════════════════════════════════════════════════
          🛡️ FAZ 39B — ENFORCED PRIMARY/SECONDARY CTA ROW
          ════════════════════════════════════════════════════
          Daima görünür luxury concierge CTA pair.
            - Primary: coral filled with elevated shadow + hover
              micro-lift (translate-y-[-1px])
            - Secondary: ghost border + arrow + hover coral tint
          Admin-configurable CTAs (hero.primaryCta /
          hero.secondaryCta) varsa onlar override eder; yoksa
          her zaman bu çift görünür → "CTA enerjisi" garantili.
          ──────────────────────────────────────────────────── */}
      <div className="mt-9 md:mt-11 flex flex-wrap items-center gap-3">
        <Link
          href={hero.primaryCta?.href || "/arama"}
          className="
            group inline-flex items-center gap-2
            px-6 py-3 rounded-full
            bg-[var(--brand-coral)] text-white
            text-[13.5px] font-medium tracking-[0.02em]
            shadow-[0_18px_36px_-14px_rgba(255,101,63,0.55),0_4px_12px_-6px_rgba(255,101,63,0.35)]
            hover:bg-[var(--brand-coral-deep)]
            hover:shadow-[0_22px_44px_-14px_rgba(255,101,63,0.62),0_6px_16px_-6px_rgba(255,101,63,0.45)]
            hover:-translate-y-[1px]
            transition-[transform,box-shadow,background-color] duration-300
            motion-reduce:transition-none motion-reduce:hover:translate-y-0
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--brand-coral)]/40
          "
        >
          {hero.primaryCta?.text || "Villaları keşfet"}
          <ArrowUpRight
            size={15}
            className="
              transition-transform duration-300
              motion-reduce:transition-none
              group-hover:translate-x-[1px] group-hover:-translate-y-[1px]
            "
            aria-hidden
          />
        </Link>
        <Link
          href={hero.secondaryCta?.href || "/iletisim"}
          className="
            group inline-flex items-center gap-2
            px-5 py-3 rounded-full
            border border-[var(--color-stone-200)]
            text-[var(--color-stone-700)]
            text-[13.5px] font-medium tracking-[0.02em]
            hover:border-[var(--brand-coral)] hover:text-[var(--color-stone-900)]
            hover:bg-[var(--brand-coral-tint)]
            hover:-translate-y-[1px]
            transition-[transform,border-color,color,background-color] duration-300
            motion-reduce:transition-none motion-reduce:hover:translate-y-0
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--brand-coral)]/30
          "
        >
          {hero.secondaryCta?.text || "Bize ulaşın"}
        </Link>
      </div>

      {/* 🛡️ FAZ 39D — Feature pills kaldırıldı (Waves / Sailboat /
         Sparkles). Hero copy + CTA stack artık aşağıya doğru daha
         minimal akıyor; trust strip altta. */}
    </div>
  );
}
