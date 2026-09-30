import { sameDay } from "./date-math";

import type { RangeBoundary } from "../_types/pricing-calendar";

/* ===============================================================
   🛡️ FAZ 2 — RANGE PREDICATES (PURE)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde inline pure helper'ların
   BYTE-IDENTICAL kopyası (L227-256):
     - isInRange
     - isRangeBoundary

   ⚠️ KESIN KURAL:
     - getTime() comparison; min/max swap içeride (drag forward/backward).
     - inclusive interval (`>=` ve `<=`).
     - boundary classification: "start" | "end" | "both" | null.
     - sameDay comparator korunur.
=============================================================== */

export const isInRange = (
  d: Date,
  from: Date | null,
  to: Date | null
): boolean => {
  if (!from || !to) return false;
  const t = d.getTime();
  const a = Math.min(from.getTime(), to.getTime());
  const b = Math.max(from.getTime(), to.getTime());
  return t >= a && t <= b;
};

export const isRangeBoundary = (
  d: Date,
  from: Date | null,
  to: Date | null
): RangeBoundary => {
  if (!from || !to) return null;
  const isStart = sameDay(
    d,
    from.getTime() <= to.getTime() ? from : to
  );
  const isEnd = sameDay(
    d,
    from.getTime() <= to.getTime() ? to : from
  );
  if (isStart && isEnd) return "both";
  if (isStart) return "start";
  if (isEnd) return "end";
  return null;
};
