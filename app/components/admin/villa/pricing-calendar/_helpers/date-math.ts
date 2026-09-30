import {
  formatLocalDate as sharedFormatLocalDate,
  parseLocalDate as sharedParseLocalDate,
} from "@/lib/date-format";

/* ===============================================================
   🛡️ FAZ 2 — DATE MATH (PURE)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` top-level helper'larının
   BYTE-IDENTICAL kopyası (L94-124).

   ⚠️ KESIN KURAL:
     - formatLocalDate / parseLocalDate `lib/date-format` TEK
       source-of-truth aliases — aynen.
     - weekdayIndexMonStart: `(d.getDay() + 6) % 7` (Mon=0).
     - buildMonthGrid: 42-cell fixed (6 satır × 7 sütun),
       firstCell = monthStart - firstWeekday gün; Date copy +
       setDate(getDate()+1) increment AYNEN.
   =============================================================== */

export const formatLocalDate = sharedFormatLocalDate;
export const parseLocalDate = sharedParseLocalDate;

export const startOfMonth = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), 1);

export const addMonths = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

export const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const dayKey = (d: Date): string => formatLocalDate(d);

export function weekdayIndexMonStart(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = weekdayIndexMonStart(monthStart);
  const firstCell = new Date(monthStart);
  firstCell.setDate(monthStart.getDate() - firstWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(firstCell);
    d.setDate(firstCell.getDate() + i);
    cells.push(d);
  }
  return cells;
}

/* ===============================================================
   🛡️ TR LOCALE LABELS — module-level const arrays
=============================================================== */

export const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export const WEEKDAY_TR = [
  "Pzt",
  "Sal",
  "Çar",
  "Per",
  "Cum",
  "Cmt",
  "Paz",
];
