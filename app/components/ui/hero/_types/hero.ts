/* ===============================================================
   🛡️ FAZ 1 — HERO TYPES (extracted from Hero.tsx)
   ===============================================================
   Eski `app/components/ui/Hero.tsx` içinde inline tanımlı tipler
   bu dosyaya BYTE-IDENTICAL taşındı. Sub-component'lerin tek
   noktadan import etmesi için.
   =============================================================== */

/* ---------------- FILTER OPTION (search panel internal) ----------------
   Eski Hero.tsx içinde `type FilterOption = ...` olarak inline
   tanımlıydı. categoryOptions + regionOptions state'lerini typeladığı
   shape. */
export type FilterOption = {
  id: string;
  name: string;
  slug?: string | null;
  /** Migration 050 — Hero bölge dropdown'ı yalnız grup köklerini
      (name === filter_group_name) göstermek için kullanır. */
  filter_group_name?: string | null;
};

/* ---------------- HERO REVIEW STATS (prop) ----------------
   Eski Hero.tsx içinde `export type HeroReviewStats` olarak
   tanımlıydı. page.tsx server tarafında getCachedGlobalReviewStats
   ile çekilir; count===0 ise card render edilmez (fake yok). */
export type HeroReviewStats = {
  count: number;
  average: number;
};

/* ---------------- TRUST TONE PALETTE ----------------
   3 yumuşak pastel ton (Aman/Six Senses service pillar).
   Eski Hero.tsx içinde `type TrustTone` ve `TRUST_TONE_CLASSES`
   record'u inline tanımlıydı. */
export type TrustTone = "coral" | "emerald" | "sky";

export const TRUST_TONE_CLASSES: Record<
  TrustTone,
  {
    surface: string; /* kart bg + border + hover border */
    iconBox: string; /* circular icon container bg + ring */
    iconText: string; /* icon color */
    hoverShadow: string;
  }
> = {
  coral: {
    surface:
      "bg-[#fff5ef] border-[#fde0d0] hover:border-[#f9b89a]",
    iconBox: "bg-[#ffe0d0] ring-1 ring-inset ring-[#f9b89a]",
    iconText: "text-[#c84a20]",
    hoverShadow:
      "hover:shadow-[0_22px_44px_-22px_rgba(255,101,63,0.30)]",
  },
  emerald: {
    surface:
      "bg-[#effaf3] border-[#cdebd9] hover:border-[#92d4ab]",
    iconBox: "bg-[#d9f0e3] ring-1 ring-inset ring-[#92d4ab]",
    iconText: "text-[#1f7a4d]",
    hoverShadow:
      "hover:shadow-[0_22px_44px_-22px_rgba(34,131,86,0.28)]",
  },
  sky: {
    surface:
      "bg-[#f0f7fb] border-[#d2e6f1] hover:border-[#9cc7e0]",
    iconBox: "bg-[#dbecf6] ring-1 ring-inset ring-[#9cc7e0]",
    iconText: "text-[#1d6492]",
    hoverShadow:
      "hover:shadow-[0_22px_44px_-22px_rgba(28,103,150,0.28)]",
  },
};
