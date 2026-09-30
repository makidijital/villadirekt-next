import { parseLocalDate, formatLocalDate, dayKey } from "./date-math";

import type { PricingCanvasRange } from "../_types/pricing-calendar";

/* ===============================================================
   🛡️ FAZ 2 — RANGE MATH (PURE)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde top-level tanımlı:
     - buildDayPriceMap (L145-159)
     - applyRangeUpsert (L176-211)
     - applyRangeDelete (L212-220)

   ⚠️ KESIN KURAL — applyRangeUpsert (en kritik):
     Mevcut range'leri yeni range ile split/merge eder. Algorithm:
       1. Loop through existing ranges
       2. Eğer existing range yeni range ile overlap YOK ise: olduğu
          gibi result'a push
       3. Sol overlap varsa (rStart < newStart): leftEnd = newStart-1;
          eğer leftEnd >= rStart → result.push({...r, end_date: leftEnd})
       4. Sağ overlap varsa (rEnd > newEnd): rightStart = newEnd+1;
          eğer rightStart <= rEnd → result.push({...r, start_date: rightStart})
       5. Yeni range'i son'a push
       6. result.sort by start_date.localeCompare
     Alan sırası AYNEN. Date arithmetic AYNEN (setDate ile -1/+1).

   ⚠️ KESIN KURAL — applyRangeDelete:
     `existing.filter(r => r.end_date < fromStr || r.start_date > toStr)`
     — overlap'i olan tüm range'ler komplet düşer (partial split YOK).
     Eski davranış aynen.

   ⚠️ KESIN KURAL — buildDayPriceMap:
     Map<dayKey, range>. start..end inclusive iter. `parseLocalDate`
     ile gün bazlı; `setDate(getDate()+1)` increment.
=============================================================== */

export function buildDayPriceMap(
  prices: PricingCanvasRange[]
): Map<string, PricingCanvasRange> {
  const map = new Map<string, PricingCanvasRange>();
  for (const p of prices) {
    let cur = parseLocalDate(p.start_date);
    const end = parseLocalDate(p.end_date);
    while (cur <= end) {
      map.set(dayKey(cur), p);
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}

export function applyRangeUpsert(
  existing: PricingCanvasRange[],
  newRange: PricingCanvasRange
): PricingCanvasRange[] {
  const result: PricingCanvasRange[] = [];
  const newStart = parseLocalDate(newRange.start_date);
  const newEnd = parseLocalDate(newRange.end_date);
  for (const r of existing) {
    const rStart = parseLocalDate(r.start_date);
    const rEnd = parseLocalDate(r.end_date);
    if (rEnd < newStart || rStart > newEnd) {
      result.push(r);
      continue;
    }
    if (rStart < newStart) {
      const leftEnd = new Date(newStart);
      leftEnd.setDate(leftEnd.getDate() - 1);
      if (leftEnd >= rStart) {
        result.push({ ...r, end_date: formatLocalDate(leftEnd) });
      }
    }
    if (rEnd > newEnd) {
      const rightStart = new Date(newEnd);
      rightStart.setDate(rightStart.getDate() + 1);
      if (rightStart <= rEnd) {
        result.push({
          ...r,
          start_date: formatLocalDate(rightStart),
        });
      }
    }
  }
  result.push(newRange);
  result.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return result;
}

export function applyRangeDelete(
  existing: PricingCanvasRange[],
  fromStr: string,
  toStr: string
): PricingCanvasRange[] {
  return existing.filter(
    (r) => r.end_date < fromStr || r.start_date > toStr
  );
}
