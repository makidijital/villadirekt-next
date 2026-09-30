import { useMemo } from "react";

import {
  buildMonthGrid,
  dayKey,
  MONTH_NAMES_TR,
  WEEKDAY_TR,
} from "../_helpers/date-math";
import { isInRange, isRangeBoundary } from "../_helpers/range-predicate";

import DayCell from "./DayCell";

import type { PricingCanvasRange } from "../_types/pricing-calendar";

/* 🛡️ İNDİRİM ÖNİZLEMESİ — prop verilmezse (örn. DiscountCalendarCanvas'ın
   tarih-seçim-only kullanımı) boş sabit Map'e düşer; DayCell hiçbir günde
   discountedPrice almaz → davranış BYTE-IDENTICAL kalır. DiscountCalendarCanvas
   BURADAN dokunulmadı, prop'u hiç geçmiyor olsa bile kırılmaz. */
const EMPTY_DAY_DISCOUNTED_PRICE_MAP = new Map<string, number>();

/* ===============================================================
   🛡️ FAZ 3 — MonthBlock (PURE PRESENTATIONAL)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde local function MonthBlock
   (L787-852) BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL:
     - `useMemo(() => buildMonthGrid(monthStart), [monthStart])`
       dep array AYNEN.
     - 42 cell render order AYNEN.
     - monthLabel = `${MONTH_NAMES_TR[idx]} ${year}`
     - weekday header: WEEKDAY_TR.map() — Mon→Paz order.
     - grid-cols-7 gap-1 mb-1 sınıfları aynen.
=============================================================== */

export default function MonthBlock({
  monthStart,
  dayPriceMap,
  dayDiscountedPriceMap = EMPTY_DAY_DISCOUNTED_PRICE_MAP,
  minPrice,
  maxPrice,
  activeFrom,
  activeTo,
  isDraggingNow,
  onCellDown,
  onCellEnter,
  onCellTap,
  compact = false,
}: {
  monthStart: Date;
  dayPriceMap: Map<string, PricingCanvasRange>;
  /** 🛡️ İNDİRİM ÖNİZLEMESİ (UI-only) — dolu olduğu günlerde DayCell
   *  eski fiyatı üstü çizili + yeni fiyatı yeşil gösterir. Opsiyonel;
   *  verilmezse (örn. DiscountCalendarCanvas) boş Map'e düşer →
   *  davranış BYTE-IDENTICAL kalır. */
  dayDiscountedPriceMap?: Map<string, number>;
  minPrice: number;
  maxPrice: number;
  activeFrom: Date | null;
  activeTo: Date | null;
  isDraggingNow: boolean;
  onCellDown: (d: Date) => void;
  onCellEnter: (d: Date) => void;
  /** 📱 Mobil tap-to-range — DayCell touch dokunuşunda çağrılır. Opsiyonel;
   *  verilmezse DayCell yalnız mevcut mouse davranışını sürdürür. */
  onCellTap?: (d: Date) => void;
  /** 5 ay görünümünde kompakt DayCell'leri tetikler. Default false. */
  compact?: boolean;
}) {
  const cells = useMemo(
    () => buildMonthGrid(monthStart),
    [monthStart]
  );
  const monthLabel = `${MONTH_NAMES_TR[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
  const monthIdx = monthStart.getMonth();

  return (
    <div className="min-w-0">
      <h3 className="font-display text-base text-[var(--color-stone-900)] tracking-[-0.015em] mb-2">
        {monthLabel}
      </h3>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_TR.map((w) => (
          <div
            key={w}
            className="text-[9px] tracking-[0.14em] uppercase font-bold text-[var(--color-stone-400)] text-center py-0.5"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const inCurrentMonth = d.getMonth() === monthIdx;
          return (
            <DayCell
              key={i}
              date={d}
              inCurrentMonth={inCurrentMonth}
              priceRange={dayPriceMap.get(dayKey(d)) || null}
              discountedPrice={dayDiscountedPriceMap.get(dayKey(d)) ?? null}
              isInActiveRange={isInRange(d, activeFrom, activeTo)}
              boundary={isRangeBoundary(d, activeFrom, activeTo)}
              isDraggingNow={isDraggingNow}
              minPrice={minPrice}
              maxPrice={maxPrice}
              onCellDown={onCellDown}
              onCellEnter={onCellEnter}
              onCellTap={onCellTap}
              compact={compact}
            />
          );
        })}
      </div>
    </div>
  );
}
