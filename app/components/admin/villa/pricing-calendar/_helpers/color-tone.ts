import type { ColorTone } from "../_types/pricing-calendar";

/* ===============================================================
   🛡️ FAZ 2 — priceColorTone (PURE)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde inline pure helper'ın
   BYTE-IDENTICAL kopyası (L162-174).

   3 threshold (33/67 percentile):
     - max <= min → mid tone (default)
     - ratio < 0.34 → light blue
     - 0.34 ≤ ratio < 0.67 → indigo
     - ratio ≥ 0.67 → warm amber

   ⚠️ KESIN KURAL — Hex codes BYTE-IDENTICAL:
     - #eef4ff / #1e3a8a (default + mid)
     - #f0f9ff / #0c4a6e (low)
     - #fff5e6 / #9a3412 (high)
=============================================================== */

export function priceColorTone(
  price: number,
  min: number,
  max: number
): ColorTone {
  if (max <= min) {
    return { bg: "#eef4ff", text: "#1e3a8a" };
  }
  const ratio = (price - min) / (max - min);
  if (ratio < 0.34) return { bg: "#f0f9ff", text: "#0c4a6e" };
  if (ratio < 0.67) return { bg: "#eef4ff", text: "#1e3a8a" };
  return { bg: "#fff5e6", text: "#9a3412" };
}
