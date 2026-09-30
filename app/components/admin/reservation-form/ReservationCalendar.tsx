"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { getDayStyle } from "@/lib/calendar.engine";
import { formatLocalDate } from "@/lib/date-format";
import type { ExternalEventDetail } from "@/lib/external-calendar.admin.types";
/* 🛡️ FAZ 28 — calculateNights reuse (lib/price.engine).
   BookingSidebar, PricingCalendarCanvas (Faz 27), VillaCard,
   /arama, reservation create — tüm yüzeyler aynı helper'ı
   kullanıyor; harici rezervasyon takvimi de aynı matematiğe
   bağlandı (eski inclusive day count `+1` bug fix). */
import { calculateNights, type DiscountRange } from "@/lib/price.engine";
/* 🛡️ GECELİK FİYAT GÖSTERİMİ — PUBLIC villa detay takvimiyle AYNI
   pure fonksiyonlar üzerinden (lib/price.engine). Yeni motor YOK. */
import { formatCurrency } from "@/lib/currency";
import {
  buildDayPriceMap,
  type DayPriceRange,
} from "./_helpers/dayPriceMap";

/* ===============================================================
   🔥 ReservationCalendar — shared custom calendar
   ===============================================================
   ⚠️ react-day-picker tamamen replace edilmiş, fully custom
   render katmanı. ManualReservationForm'daki drag-select
   pattern'inin shared versiyonu.

   Reservation engine'e ait HİÇBİR helper / query / state burada
   YENİDEN YAZILMADI:
     - getDayStyle çıktıları AYNEN (red/yellow/transparent
       half-day gradient string'leri byte-identical)
     - modifier arrayleri AYNEN getDayStyle'a beslenir
     - fullyBlockedDates set'i = [...blocked, ...(checkin ∩ checkout)]
       (varsa) MINUS excludeDisabledDates → edit page'de
       "kendi rezervasyonun tarihleri blocked sayılmaz"
       semantiğini birebir korur.
     - getValidEndDate parent'larda kalır; bu component sadece
       drag boyunca topladığı raw (from, to) ve fullyBlockedDates
       set'ini emit eder. Her parent kendi end-clamp semantiğini
       (create = clamp, edit = raw) koruyor.
     - DB EXCLUDE constraint compatibility'sine dokunulmadı.
   =============================================================== */

/* ---------------------------------------------
   🔥 GRID MATH
   - Pzt başlangıçlı 7-col, 6 satır (42 cell).
   - Önceki/sonraki ay kuyruğu muted gösterilir.
   - Pure date math; reservation logic'e dokunmaz.
---------------------------------------------- */
type GridCell = {
  date: Date;
  inMonth: boolean;
};

function buildMonthGrid(viewMonth: Date): GridCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const firstDow = (first.getDay() + 6) % 7;
  const lastDow = (last.getDay() + 6) % 7;

  const cells: GridCell[] = [];

  for (let i = firstDow; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    cells.push({ date: d, inMonth: false });
  }
  for (let day = 1; day <= last.getDate(); day++) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  const trailing = 6 - lastDow;
  for (let i = 1; i <= trailing; i++) {
    cells.push({ date: new Date(year, month + 1, i), inMonth: false });
  }
  while (cells.length < 42) {
    const tail = cells[cells.length - 1].date;
    const next = new Date(
      tail.getFullYear(),
      tail.getMonth(),
      tail.getDate() + 1
    );
    cells.push({ date: next, inMonth: false });
  }
  return cells.slice(0, 42);
}

const WEEKDAY_HEADERS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const sameDay = (a: Date, b: Date) =>
  a.toDateString() === b.toDateString();

const isInRange = (
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

const isRangeBoundary = (
  d: Date,
  from: Date | null,
  to: Date | null
): "start" | "end" | "both" | null => {
  if (!from || !to) return null;
  const lower = from.getTime() <= to.getTime() ? from : to;
  const upper = from.getTime() <= to.getTime() ? to : from;
  const isStart = sameDay(d, lower);
  const isEnd = sameDay(d, upper);
  if (isStart && isEnd) return "both";
  if (isStart) return "start";
  if (isEnd) return "end";
  return null;
};

export type ReservationCalendarProps = {
  /** Committed selection (parent state) */
  startDate: Date | null;
  endDate: Date | null;

  /** Fresh-selection flag — true = ignore committed range visually */
  freshSelection: boolean;
  setFreshSelection: (v: boolean) => void;

  /** Visible anchor month (parent controls) */
  currentMonth: Date;
  setCurrentMonth: (m: Date | ((prev: Date) => Date)) => void;

  /** Reservation engine arrays — getDayStyle args, AYNEN. */
  blockedDates: Date[];
  checkinDates: Date[];
  checkoutDates: Date[];
  pendingCheckinDates: Date[];
  pendingCheckoutDates: Date[];
  pendingMiddleDates: Date[];

  /** EDIT mode: bu tarihler "fully blocked" sayılmaz (kendi
   *  rezervasyonun tarihleri). create/manual'de [] geçilir.
   *  Pre-existing .neq("id", id) + currentReservationDates
   *  semantiğini korur. */
  excludeDisabledDates?: Date[];

  /** Drag finalize callback. Parent decides end-clamp semantics:
   *    - create / manual: setEndDate(getValidEndDate(from, to, fb))
   *    - edit: setEndDate(to)  ← pre-existing davranış
   */
  onSelectRange: (
    from: Date,
    to: Date,
    fullyBlockedDates: Date[]
  ) => void;

  /** Range chip (selected → display) göster.
   *  - manual form: true (kendi UI'sında trigger yok)
   *  - create/edit popover: false (page'in kendi triggerLabel'i var) */
  showRangeChip?: boolean;

  /** Compact mode (popover'da kullanılır) — biraz daha sıkı padding */
  compact?: boolean;

  /** Yan yana gösterilecek ay sayısı. Default 3 (backward-compat —
   *  tüm mevcut kullanım yerleri aynen kalır). Yalnız manual-reservations
   *  ekle/düzenle formu 6 geçer; dış grid 2xl breakpoint'inde 6 kolona
   *  çıkar, daha küçük ekranlarda satıra sarar (horizontal overflow yok). */
  monthCount?: number;

  /** Reset key — parent'ın calendarKey'i (manual form gibi).
   *  Değişince component remount ve drag state temizlenir. */
  resetKey?: number;

  /* 🛡️ FAZ 56H-D — EXTERNAL iCAL ARRAYS (admin-only, additive)
     Parent authenticated client'la fetchExternalCalendarArraysForVillaAdmin
     çağırır ve buraya pass eder. Engine bu arrayleri AYRI parametre
     olarak alır → violet render (lowest priority; confirmed/pending
     üzerine yazmaz).
     - externalCheckinDates / externalCheckoutDates / externalMiddleDates:
       Engine'in mevcut reservation engine arrayleriyle birebir aynı
       semantic — `getDayStyle` aynı half-day/full gradient mantığını
       violet renkte uygular.
     - externalDetailByDate: "YYYY-MM-DD" → source_name/summary tooltip
       için map. Boş object → tooltip yok (backward-compat).
     - Default boş → component eski davranışta. */
  externalCheckinDates?: Date[];
  externalCheckoutDates?: Date[];
  externalMiddleDates?: Date[];
  externalDetailByDate?: Record<string, ExternalEventDetail>;

  /* 🛡️ GECELİK FİYAT GÖSTERİMİ (additive, OPSİYONEL)
     Verilmezse hücre render'ı ESKİSİYLE BİREBİR AYNI kalır →
     manual-reservations formu ve villa seçilmemiş durum ETKİLENMEZ.
     - prices     : villa_prices satırları (sayfada zaten mevcut)
     - discounts  : villa_discounts → DiscountRange[] (aynı fetch'ten)
     - rates      : /api/exchange-rates (sayfada zaten mevcut)
     - priceCurrency: admin görüntüleme para birimi (mevcut davranış "TRY")
     Fiyat/indirim hesabı bu component'te YAPILMAZ; `buildDayPriceMap`
     price.engine'in pure fonksiyonlarını çağırır. */
  prices?: DayPriceRange[] | null;
  discounts?: DiscountRange[] | null;
  rates?: Record<string, number>;
  priceCurrency?: string;
};

export default function ReservationCalendar({
  startDate,
  endDate,
  freshSelection,
  setFreshSelection,
  currentMonth,
  setCurrentMonth,
  blockedDates,
  checkinDates,
  checkoutDates,
  pendingCheckinDates,
  pendingCheckoutDates,
  pendingMiddleDates,
  excludeDisabledDates = [],
  onSelectRange,
  showRangeChip = true,
  compact = false,
  monthCount = 3,
  resetKey = 0,
  externalCheckinDates = [],
  externalCheckoutDates = [],
  externalMiddleDates = [],
  externalDetailByDate = {},
  prices = null,
  discounts = null,
  rates = { TRY: 1 },
  priceCurrency = "TRY",
}: ReservationCalendarProps) {
  /* ---------------------------------------------
     🔥 DRAG STATE — PricingCanvas patternine birebir.
     dragFrom / dragTo: drag boyunca uçlar
     draggingRef: re-render tetiklemeden flag
  ---------------------------------------------- */
  const [dragFrom, setDragFrom] = useState<Date | null>(null);
  const [dragTo, setDragTo] = useState<Date | null>(null);
  const draggingRef = useRef<boolean>(false);
  /* 📱 Tap-to-range (mobil/touch): 1. dokunuş anchor, 2. dokunuş bitiş.
     Anchor'ı REF'te tutuyoruz → hızlı ardışık tap'lerde stale-closure yok
     (state async; ref senkron okunur). Desktop mouse drag'i ETKİLEMEZ. */
  const tapAnchorRef = useRef<Date | null>(null);
  /* Touch tap tespiti — dokunuş başlangıç konumu; touchend'de hareket
     eşiğiyle scroll'u tap'tan ayırır (kaydırma yanlışlıkla gün seçmesin). */
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  /* ---------------------------------------------
     🔥 fullyBlockedDates — half-open `[)` semantic
     = [...blocked, ...(checkin ∩ checkout)] MINUS excludeDisabledDates
     Edit page kendi tarihlerini muaf tutar; create/manual'de
     excludeDisabledDates = [] olur (default).

     🛡️ FAZ 56H-D-FIX2 — CROSS-SOURCE INTERACTION GUARD
     Render katmanı (calendar.engine.ts) cross-source kombinasyonları
     (XCO+CI / CO+XCI / XCO+PCI / PCO+XCI) için half-day split gradient
     üretmeye DEVAM eder — visual parity korunur. Ancak admin
     drag-select / click-select açısından bu birleşim günleri
     SELECTABLE OLMAMALI: yeni rezervasyon o güne başlayamaz veya bitemez,
     çünkü iki kaynak aynı günü paylaşıyor → yarıların hiçbirisi yeni
     bir bookable yarı değil.

     Canonical kural (user spec):
       • isXM → disabled (full-day external block)
       • isXCI + ANY reservation source (CI/CO/blocked/PCI/PCO/PM) → disabled
       • isXCO + ANY reservation source (CI/CO/blocked/PCI/PCO/PM) → disabled
       • isXCI ∩ isXCO same-day (externalOverlap) → disabled
     Adjacent rule preserved: SAF external CI veya CO günü (reservation
     overlap yok) → selectable. "external 08→12, no reservation → 12
     selectable" senaryosu KORUNUR.

     Bespoke disabled mantığı YOK — sadece set extension. Cell'in
     mevcut `disabled = fullyBlockedDates.some(...)` check'i beginDrag /
     extendDrag / onTouchMove / cursor:not-allowed / click-ignore'u
     otomatik tetikler.
  ---------------------------------------------- */
  const fullyBlockedDates = useMemo(() => {
    /* Confirmed same-day intersection (CI ∩ CO existing). */
    const overlap = checkinDates.filter((c) =>
      checkoutDates.some((co) => sameDay(c, co))
    );
    /* 🛡️ FAZ 56H-D — External same-day intersection (XCI ∩ XCO). */
    const externalOverlap = externalCheckinDates.filter((c) =>
      externalCheckoutDates.some((co) => sameDay(c, co))
    );

    /* 🛡️ FAZ 56H-D-FIX2 — Cross-source overlap set.
       External CI/CO günleri, ANY reservation/manual/pending source
       ile aynı günde çakışıyorsa block edilir. O(N) set lookup. */
    const reservationKeySet = new Set<string>();
    for (const d of blockedDates) reservationKeySet.add(formatLocalDate(d));
    for (const d of checkinDates) reservationKeySet.add(formatLocalDate(d));
    for (const d of checkoutDates) reservationKeySet.add(formatLocalDate(d));
    for (const d of pendingMiddleDates) reservationKeySet.add(formatLocalDate(d));
    for (const d of pendingCheckinDates) reservationKeySet.add(formatLocalDate(d));
    for (const d of pendingCheckoutDates) reservationKeySet.add(formatLocalDate(d));

    const externalCrossSourceOverlap: Date[] = [];
    for (const d of externalCheckinDates) {
      if (reservationKeySet.has(formatLocalDate(d))) {
        externalCrossSourceOverlap.push(d);
      }
    }
    for (const d of externalCheckoutDates) {
      if (reservationKeySet.has(formatLocalDate(d))) {
        externalCrossSourceOverlap.push(d);
      }
    }

    const merged = [
      ...blockedDates,
      ...overlap,
      /* External middle days fully block selection. */
      ...externalMiddleDates,
      /* External XCI ∩ XCO same-day fully blocks. */
      ...externalOverlap,
      /* External CI/CO ↔ reservation/manual/pending overlap fully blocks. */
      ...externalCrossSourceOverlap,
    ];
    if (excludeDisabledDates.length === 0) return merged;
    return merged.filter(
      (d) => !excludeDisabledDates.some((e) => sameDay(e, d))
    );
  }, [
    blockedDates,
    checkinDates,
    checkoutDates,
    pendingCheckinDates,
    pendingCheckoutDates,
    pendingMiddleDates,
    excludeDisabledDates,
    externalCheckinDates,
    externalCheckoutDates,
    externalMiddleDates,
  ]);

  /* ---------------------------------------------
     🔥 GLOBAL MOUSEUP — drag finalize → onSelectRange
     Parent end-clamp semantiğini belirler.
  ---------------------------------------------- */
  useEffect(() => {
    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (dragFrom && dragTo) {
        const a = dragFrom.getTime() <= dragTo.getTime();
        const from = a ? dragFrom : dragTo;
        const to = a ? dragTo : dragFrom;
        onSelectRange(from, to, fullyBlockedDates);
      }
      setDragFrom(null);
      setDragTo(null);
    };
    /* Yalnız DESKTOP mouse-drag finalize. Touch artık drag DEĞİL, tap-to-range
       (aşağıda onCellTap) → global touchend finalize KALDIRILDI. */
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mouseup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragFrom, dragTo, fullyBlockedDates]);

  /* resetKey değişince drag state temizle */
  useEffect(() => {
    setDragFrom(null);
    setDragTo(null);
    draggingRef.current = false;
    tapAnchorRef.current = null;
  }, [resetKey]);

  const beginDrag = (date: Date, disabled: boolean) => {
    if (disabled) return;
    draggingRef.current = true;
    setDragFrom(date);
    setDragTo(date);
    // Mouse etkileşimi başlarsa bekleyen tap anchor'ı sıfırla (hibrit cihaz).
    tapAnchorRef.current = null;
    if (freshSelection) setFreshSelection(false);
  };

  const extendDrag = (date: Date, disabled: boolean) => {
    if (!draggingRef.current || disabled) return;
    setDragTo(date);
  };

  /* ---------------------------------------------
     📱 TAP-TO-RANGE (mobil/touch) — drag ZORUNLU DEĞİL.
     1. dokunuş → anchor (tek gün highlight, onSelectRange ÇAĞRILMAZ).
     2. dokunuş → mevcut swap + `onSelectRange(from, to, fullyBlockedDates)`
        sözleşmesi AYNEN (yeni tarih hesabı yok). Aynı güne 2 kez → tek gün.
     Disabled/blocked gün → no-op (caller `disabled` geçirir; bypass yok).
     Anchor REF'te → state-async closure sorunu yok. draggingRef KULLANILMAZ
     → global mouseup tetiklenmez, mouse yolu ile çakışmaz. */
  const onCellTap = (date: Date, disabled: boolean) => {
    if (disabled) return;
    draggingRef.current = false;
    if (freshSelection) setFreshSelection(false);
    const anchor = tapAnchorRef.current;
    if (!anchor) {
      tapAnchorRef.current = date;
      setDragFrom(date);
      setDragTo(date); // bekleyen başlangıç highlight'ı (drag ile aynı görsel)
    } else {
      const a = anchor.getTime() <= date.getTime();
      const from = a ? anchor : date;
      const to = a ? date : anchor;
      tapAnchorRef.current = null;
      setDragFrom(null);
      setDragTo(null);
      onSelectRange(from, to, fullyBlockedDates);
    }
  };

  const visibleMonths = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    /* monthCount kadar ardışık ay (default 3 → eski davranışla
       byte-identical: [m, m+1, m+2]). */
    return Array.from(
      { length: Math.max(1, monthCount) },
      (_, i) => new Date(y, m + i, 1)
    );
  }, [currentMonth, monthCount]);

  /* 🛡️ Dış grid kolon tavanı — default (≤3 ay) AYNEN korunur.
     Yalnız 6+ ay istendiğinde 2xl breakpoint'inde 6 kolon eklenir;
     xl ve altında 3'erli satıra sarar → küçük ekranda overflow yok. */
  const monthGridColsClass =
    monthCount >= 6
      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
      : monthCount === 5
        ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
        : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  /* 🛡️ GÜNLÜK FİYAT HARİTASI — hücre başına DB/API sorgusu YOK.
     Görünür tüm günler TEK seferde hesaplanır; `prices`/`discounts`/
     `rates` değişmedikçe yeniden çalışmaz. Fiyat verilmemişse boş
     Map döner → render eski haliyle kalır. */
  const dayPriceMap = useMemo(() => {
    if (!prices || prices.length === 0) return new Map();
    const days: Date[] = [];
    for (const vm of visibleMonths) {
      for (const cell of buildMonthGrid(vm)) {
        if (cell.inMonth) days.push(cell.date);
      }
    }
    return buildDayPriceMap(days, prices, discounts, priceCurrency, rates);
  }, [visibleMonths, prices, discounts, priceCurrency, rates]);

  const hasPrices = dayPriceMap.size > 0;

  const todayKey = new Date().toDateString();

  return (
    <div
      className={`mr-calendar-premium select-none ${
        compact ? "p-2" : ""
      }`}
    >
      {/* Premium nav header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setCurrentMonth(
                (m: Date) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
              )
            }
            className="admin-icon-btn"
            aria-label="Önceki ay"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              const t = new Date();
              setCurrentMonth(new Date(t.getFullYear(), t.getMonth(), 1));
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] transition"
          >
            Bugün
          </button>
          <button
            type="button"
            onClick={() =>
              setCurrentMonth(
                (m: Date) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
              )
            }
            className="admin-icon-btn"
            aria-label="Sonraki ay"
          >
            <ChevronRight size={16} />
          </button>
          <h3 className="font-display text-sm text-[var(--color-stone-900)] tracking-[-0.015em] ml-2 capitalize">
            {visibleMonths[0].toLocaleDateString("tr-TR", { month: "short" })}
            <span className="text-[var(--color-stone-400)] mx-1">→</span>
            {visibleMonths[visibleMonths.length - 1].toLocaleDateString(
              "tr-TR",
              {
                month: "short",
                year: "numeric",
              }
            )}
          </h3>
        </div>

        {/* Legend */}
        <div className="hidden md:flex items-center gap-3 text-[11px] text-[var(--color-stone-500)] flex-wrap">
          <LegendSwatch
            label="Dolu (Onaylı/Manuel)"
            style={{ background: "rgba(239,68,68,0.4)" }}
          />
          <LegendSwatch
            label="Beklemede"
            style={{ background: "#facc15" }}
          />
          <LegendSwatch
            label="iCal"
            style={{ background: "rgba(139,92,246,0.62)" }}
          />
          <LegendSwatch
            label="Boş"
            style={{
              background: "white",
              border: "1px solid var(--color-sand-200)",
            }}
          />
        </div>
      </div>

      {/* Hint */}
      <p className="text-[11px] text-[var(--color-stone-500)] mb-2">
        <Sparkles
          size={11}
          className="inline mr-1 -mt-0.5 text-[var(--color-champagne-600)]"
        />
        Tarih aralığı için hücreyi tıklayıp basılı tutarak sürükle.
        Tek günlük seçim için tek tıkla.
      </p>

      {/* Multi-month grid — Desktop 3 / Tablet 2 / Mobile 1 */}
      <div className={`grid ${monthGridColsClass} gap-3 md:gap-4`}>
        {/* 🛡️ React 19 react-hooks/refs: bu .map içinde draggingRef.current
           okunuyor → "ref accessed during render" uyarısı. Legacy drag-select
           pattern; ref render-time okunmazsa highlight kayar. Block disable
           çünkü ihlal .map block'unun tamamına yayılı. Refactor not'u
           react-hooks/exhaustive-deps yorumunda işaretli (ref → state derive
           veya useSyncExternalStore). */}
        {/* eslint-disable react-hooks/refs */}
        {visibleMonths.map((viewMonth, monthIdx) => {
          const monthCells = buildMonthGrid(viewMonth);
          return (
            <div
              key={`${viewMonth.getFullYear()}-${viewMonth.getMonth()}`}
              className="rounded-xl border border-[var(--color-sand-100)] bg-white/40 px-2 py-2.5"
            >
              <div className="px-1 mb-1.5">
                <span className="font-display text-[12px] font-semibold text-[var(--color-stone-800)] tracking-[-0.01em] capitalize">
                  {viewMonth.toLocaleDateString("tr-TR", { month: "long" })}
                  {monthIdx === visibleMonths.length - 1 && (
                    <span className="text-[var(--color-stone-400)] font-normal ml-1">
                      {viewMonth.getFullYear()}
                    </span>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-7 gap-0.5 px-0.5 mb-1">
                {WEEKDAY_HEADERS.map((w) => (
                  <div
                    key={w}
                    className="text-center text-[9px] font-bold tracking-[0.14em] uppercase text-[var(--color-stone-400)] py-1"
                  >
                    {w[0]}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 px-0.5">
                {monthCells.map((cell, i) => {
                  const date = cell.date;
                  const dateKey = formatLocalDate(date);

                  if (!cell.inMonth) {
                    return (
                      <div
                        key={`${i}-${dateKey}`}
                        className="aspect-square flex items-center justify-center text-[10px] text-[var(--color-stone-300)] select-none"
                        aria-hidden
                      >
                        {date.getDate()}
                      </div>
                    );
                  }

                  /* getDayStyle çıktısı (renkler) ASLA değişmez —
                     red/yellow/transparent gradient string'leri aynen.
                     🛡️ FAZ 56H-D: external arrays AYRI param olarak
                     geçer; engine priority: confirmed > pending >
                     external. Same-day overlap'ta yukarıdaki check
                     sırası önce match eder → violet hiç görünmez
                     (duplicate render yok). */
                  const { bg, color } = getDayStyle({
                    date,
                    blockedDates,
                    checkinDates,
                    checkoutDates,
                    pendingCheckinDates,
                    pendingCheckoutDates,
                    pendingMiddleDates,
                    externalCheckinDates,
                    externalCheckoutDates,
                    externalMiddleDates,
                  });

                  /* 🛡️ FAZ 56H-D — Cell external durumu (tooltip + badge).
                     External flag: hücre external array'lerden birinde mi?
                     Tooltip + badge YALNIZ yüksek-priority bir source
                     yoksa görünür (confirmed/pending/manual ezilirse
                     iCAL bilgisi yanıltıcı olur). */
                  const isInExternal =
                    externalMiddleDates.some((d) => sameDay(d, date)) ||
                    externalCheckinDates.some((d) => sameDay(d, date)) ||
                    externalCheckoutDates.some((d) => sameDay(d, date));
                  const isInHigherPriority =
                    blockedDates.some((d) => sameDay(d, date)) ||
                    checkinDates.some((d) => sameDay(d, date)) ||
                    checkoutDates.some((d) => sameDay(d, date)) ||
                    pendingMiddleDates.some((d) => sameDay(d, date)) ||
                    pendingCheckinDates.some((d) => sameDay(d, date)) ||
                    pendingCheckoutDates.some((d) => sameDay(d, date));
                  const showExternalChrome =
                    isInExternal && !isInHigherPriority;
                  const externalDetail = showExternalChrome
                    ? externalDetailByDate[dateKey] ?? null
                    : null;
                  const cellTitle = externalDetail
                    ? `${externalDetail.source_name} · ${externalDetail.start_date} → ${externalDetail.end_date}${
                        externalDetail.summary
                          ? " · " + externalDetail.summary
                          : ""
                      }`
                    : undefined;

                  const disabled = fullyBlockedDates.some((d) =>
                    sameDay(d, date)
                  );

                  /* 📱 Bekleyen tap anchor'ı (1. dokunuş, 2. dokunuş beklenirken)
                     de drag ile AYNI görsel state'i kullanır → ilk seçilen gün
                     highlight olur. draggingRef.current okuması zaten render'da
                     yapılıyor; aynı desen. */
                  const pendingTapAnchor = tapAnchorRef.current !== null;
                  const showDragVisual =
                    draggingRef.current || pendingTapAnchor;
                  const activeFrom = showDragVisual
                    ? dragFrom
                    : freshSelection
                      ? null
                      : startDate;
                  const activeTo = showDragVisual
                    ? dragTo
                    : freshSelection
                      ? null
                      : endDate;
                  const inRange = isInRange(date, activeFrom, activeTo);
                  const boundary = isRangeBoundary(
                    date,
                    activeFrom,
                    activeTo
                  );
                  const isDraggingNow = draggingRef.current;
                  const isToday = date.toDateString() === todayKey;

                  /* ---------------------------------------------
                     🔥 SELECTION OVERLAY — gradient'i ASLA ezmez
                     Layer architecture (alttan üste):
                       1. gradient base  → getDayStyle(bg) AYNEN
                       2. selection tint → semi-transparent
                                           champagne overlay
                                           (sadece inRange'de)
                       3. number layer   → tarih sayısı (her zaman
                                           üstte, pointer-events:none)
                     getDayStyle çıktısı bytewise korunur; tint
                     pointer-events:none olduğu için drag handler'lar
                     aksamaz.
                  ---------------------------------------------- */
                  /* ---------------------------------------------
                     🔥 SELECTION VISUALS — start ve end EŞİT güçte
                     görünür.

                     Sorun: 0.70 tint, rgba(239,68,68,0.4) red half-day
                     gradient'i karşısında zayıf kalıyordu. Sebep
                     görsel: red, champagne-gold'a göre çok daha
                     "loud" bir renk; eşit alpha'da bile dikkat çeker.
                     Bu yüzden CI cell'inin (transparent | red 0.4)
                     red yarısı, selected hissini eziyordu.

                     Çözüm: boundary için iki katmanlı selection
                       Layer 2a: full-cell soft tint (mevcut)
                       Layer 2b: inner "pill" fill — boundary'de
                                 inset:2px champagne 0.95 alpha
                                 (gradient'i ezmez; cell kenarında
                                 2px boşluk bırakır → orada gradient
                                 hint olarak hâlâ görünür)
                       + Layer 2b'de subtle inset white ring (0.4 alpha)
                         → "selected pill" hissi

                     Sonuç:
                       - cell merkezinde solid champagne pill (gold
                         dominant)
                       - cell kenarında 2px gradient şeridi görünür
                         (half-day hint korunur)
                       - start ve end IDENTICAL render — gradient yönü
                         farketmez, pill her durumda dominant
                  ---------------------------------------------- */
                  const cellStyle: CSSProperties = {
                    outline: inRange
                      ? boundary
                        ? "2px solid var(--color-champagne-500, #c89b3c)"
                        : "1px solid rgba(200,155,60,0.4)"
                      : "1px solid transparent",
                    outlineOffset: -1,
                    boxShadow:
                      inRange && boundary
                        ? "0 8px 22px -10px rgba(200, 155, 60, 0.55)"
                        : undefined,
                    transform:
                      inRange && boundary ? "scale(1.06)" : undefined,
                    transition:
                      "outline 0.12s ease, box-shadow 0.18s ease, transform 0.12s ease, background 0.18s ease",
                    cursor: disabled ? "not-allowed" : "pointer",
                    zIndex: inRange && boundary ? 2 : 1,
                  };

                  const gradientStyle: CSSProperties = {
                    background: bg,
                    opacity: disabled ? 0.32 : 1,
                  };

                  /* Layer 2a — full-cell soft tint */
                  const tintStyle: CSSProperties | null = inRange
                    ? {
                        background: boundary
                          ? "rgba(200, 155, 60, 0.45)"
                          : "rgba(200, 155, 60, 0.20)",
                        pointerEvents: "none",
                      }
                    : null;

                  /* Layer 2b — inner "pill" (sadece boundary'de).
                     inset:2px → cell kenarında gradient'in 2px'lik
                     görünmesine izin verir (half-day hint korunur).
                     0.95 alpha + inset white ring → "selected pill"
                     görsel hissi. */
                  const pillStyle: CSSProperties | null =
                    inRange && boundary
                      ? {
                          background: "rgba(200, 155, 60, 0.95)",
                          boxShadow:
                            "inset 0 0 0 1px rgba(255,255,255,0.45)",
                          pointerEvents: "none",
                        }
                      : null;

                  return (
                    <div
                      key={`${i}-${dateKey}`}
                      data-date={dateKey}
                      className="aspect-square relative rounded-md mr-cell-hover"
                      style={cellStyle}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        beginDrag(date, disabled);
                      }}
                      onMouseEnter={() => extendDrag(date, disabled)}
                      onTouchStart={(e) => {
                        // 📱 Tap-to-range: yalnız başlangıç konumunu kaydet;
                        //    drag başlatma YOK (uzun aralıkta sürükleme zorunluluğu kalktı).
                        const t = e.touches[0];
                        touchStartRef.current = t
                          ? { x: t.clientX, y: t.clientY }
                          : null;
                      }}
                      onTouchEnd={(e) => {
                        const start = touchStartRef.current;
                        touchStartRef.current = null;
                        if (!start) return;
                        const t = e.changedTouches[0];
                        // ~10px'ten fazla hareket → scroll/drag, tap DEĞİL → yok say.
                        if (
                          t &&
                          (Math.abs(t.clientX - start.x) > 10 ||
                            Math.abs(t.clientY - start.y) > 10)
                        ) {
                          return;
                        }
                        // 🛡️ Sentetik mouse/click emülasyonunu engelle → aynı dokunuş
                        //    onMouseDown/onClick olarak İKİNCİ kez işlenmez (double-fire yok).
                        e.preventDefault();
                        onCellTap(date, disabled);
                      }}
                      aria-disabled={disabled}
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      title={cellTitle}
                    >
                      {/* Layer 1: gradient base — getDayStyle output AYNEN */}
                      <div
                        className="absolute inset-0 rounded-md overflow-hidden"
                        style={gradientStyle}
                        aria-hidden
                      />

                      {/* Layer 2a: selection tint overlay
                          (full cell, soft fill) */}
                      {tintStyle && (
                        <div
                          className="absolute inset-0 rounded-md"
                          style={tintStyle}
                          aria-hidden
                        />
                      )}

                      {/* Layer 2b: boundary "pill" — start ve end
                          cell'lerine "selected pill" hissi verir.
                          inset:2px → cell kenarında gradient'in 2px
                          şeridi görünmeye devam eder (half-day hint
                          KORUNUR). pointerEvents:none → drag/click
                          handler'lar outer'a iletilir. */}
                      {pillStyle && (
                        <div
                          className="absolute inset-[2px] rounded-[5px]"
                          style={pillStyle}
                          aria-hidden
                        />
                      )}

                      {/* 🛡️ FAZ 56H-D — Layer 2c: iCAL badge.
                          Yalnız external-only günlerde görünür (yukarıdaki
                          showExternalChrome guard); confirmed/pending/manual
                          ezilirse hiç render edilmez. Top-right köşede
                          küçük violet pill; pointer-events:none drag
                          handler'lara müdahale etmez. */}
                      {showExternalChrome && (
                        <div
                          className="absolute top-0.5 right-0.5 rounded-full bg-violet-600 text-white text-[7px] font-bold tracking-wider px-1 leading-[10px] uppercase select-none"
                          style={{
                            pointerEvents: "none",
                            lineHeight: "10px",
                          }}
                          aria-hidden
                        >
                          iCAL
                        </div>
                      )}

                      {/* Layer 3: number (+ opsiyonel gecelik fiyat).
                          Click'ler outer'a iletilsin diye
                          pointer-events:none. Renk getDayStyle'dan AYNEN.

                          🛡️ FİYAT: yalnız `prices` verildiğinde ve o gün
                          için fiyat VARSA gösterilir. `hasPrices` false
                          iken bu blok ESKİ HALİYLE (tek satır, ortalanmış
                          rakam) render edilir → mevcut kullanım yerleri
                          ve hücre boyutu (aspect-square) DEĞİŞMEZ. */}
                      <div
                        className={
                          "absolute inset-0 flex flex-col items-center justify-center text-[11px] select-none" +
                          (hasPrices ? " leading-none gap-[1px]" : "")
                        }
                        style={{
                          color,
                          pointerEvents: "none",
                          fontWeight: boundary ? 700 : 500,
                        }}
                      >
                        <span
                          className={
                            isToday && !boundary
                              ? "ring-1 ring-[var(--color-champagne-500,#c89b3c)] rounded-md px-1 leading-none font-bold"
                              : ""
                          }
                        >
                          {date.getDate()}
                        </span>

                        {/* 🛡️ GECELİK FİYAT — PUBLIC villa detay takvimiyle
                            AYNI gösterim: indirim varsa ÜZERİ ÇİZİLİ normal
                            fiyat + altında indirimli fiyat; indirim yoksa
                            tek satır normal fiyat. Tutarlar
                            `buildDayPriceMap` → price.engine'den gelir;
                            burada hesap YAPILMAZ. Bloklu günde fiyat
                            basılmaz (public `!isBlocked` kuralının aynısı).
                            `formatCurrency` public ile AYNI fonksiyon. */}
                        {(() => {
                          if (!hasPrices || disabled) return null;
                          const dp = dayPriceMap.get(dateKey);
                          if (!dp) return null;
                          return dp.discounted !== null ? (
                            <>
                              <span
                                className="text-[7px] font-medium tabular-nums line-through"
                                style={{
                                  color: "#dc2626",
                                  opacity: 0.55,
                                  letterSpacing: "0.02em",
                                }}
                              >
                                {formatCurrency(dp.price, priceCurrency, "tr")}
                              </span>
                              <span
                                className="text-[8px] font-semibold tabular-nums"
                                style={{
                                  opacity: 0.85,
                                  letterSpacing: "0.02em",
                                }}
                              >
                                {formatCurrency(
                                  dp.discounted,
                                  priceCurrency,
                                  "tr"
                                )}
                              </span>
                            </>
                          ) : (
                            <span
                              className="text-[8px] font-medium tabular-nums"
                              style={{
                                opacity: 0.65,
                                letterSpacing: "0.02em",
                              }}
                            >
                              {formatCurrency(dp.price, priceCurrency, "tr")}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* eslint-enable react-hooks/refs */}
      </div>

      {/* Optional range chip */}
      {showRangeChip && startDate && endDate && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-[var(--color-stone-800)]">
            <Calendar
              size={14}
              className="text-[var(--color-champagne-600)]"
            />
            <span className="font-medium">
              {startDate.toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
              })}
            </span>
            <span className="text-[var(--color-stone-400)]">→</span>
            <span className="font-medium">
              {endDate.toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
          {/* 🛡️ FAZ 28 — Night-based hesap (reservation matematiği parity).
             Eski: `Math.round((to-from)/day) + 1` → INCLUSIVE day count
               (15 Haz → 22 Haz = 8 gün, yanlış — booking 7 gece bekler)
             Yeni: `calculateNights` helper (lib/price.engine).
             BookingSidebar, PricingCalendarCanvas (Faz 27), VillaCard,
             /arama, reservation create — birebir aynı hesap.
             0 gece durumda gate (>0) ile gizlenir. */}
          {(() => {
            const nights = calculateNights(
              formatLocalDate(startDate),
              formatLocalDate(endDate)
            );
            if (nights <= 0) return null;
            return (
              <span className="text-[11px] tabular-nums text-[var(--color-stone-500)]">
                <Sparkles size={11} className="inline mr-1 -mt-0.5" />
                {nights} gece
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function LegendSwatch({
  label,
  style,
}: {
  label: string;
  style: React.CSSProperties;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded-md" style={style} />
      {label}
    </span>
  );
}
