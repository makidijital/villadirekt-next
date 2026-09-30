import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatTRY } from "@/lib/format";

import { addMonths, startOfMonth } from "../_helpers/date-math";

/* ===============================================================
   🛡️ FAZ 3 — PricingCalendarNav (PURE PRESENTATIONAL)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde inline render edilen
   nav bar (L569-610) BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL:
     - 3 buton: ◄ (prev) / Bugün / ► (next).
     - prev/next handler: `setAnchorMonth((m) => addMonths(m, -1/+1))`
     - Bugün handler: `setAnchorMonth(startOfMonth(new Date()))`
     - Price chip yalnız `pricesCount > 0` ise render edilir.
     - `formatTRY` (lib/format) min – max display.
     - Tailwind class sırası AYNEN (admin-icon-btn + custom px/py).
=============================================================== */

export default function PricingCalendarNav({
  setAnchorMonth,
  pricesCount,
  minPrice,
  maxPrice,
}: {
  setAnchorMonth: React.Dispatch<React.SetStateAction<Date>>;
  pricesCount: number;
  minPrice: number;
  maxPrice: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setAnchorMonth((m) => addMonths(m, -1))
          }
          className="admin-icon-btn"
          aria-label="Önceki ay"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() =>
            setAnchorMonth(startOfMonth(new Date()))
          }
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] transition"
        >
          Bugün
        </button>
        <button
          type="button"
          onClick={() => setAnchorMonth((m) => addMonths(m, 1))}
          className="admin-icon-btn"
          aria-label="Sonraki ay"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {pricesCount > 0 && (
        <span className="text-[11px] text-[var(--color-stone-500)] tabular-nums">
          {formatTRY(minPrice)}
          <span className="text-[var(--color-stone-300)] mx-1">
            –
          </span>
          {formatTRY(maxPrice)}
        </span>
      )}
    </div>
  );
}
