"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
import { getDayStyle } from "@/lib/calendar.engine";
import { formatLocalDate } from "@/lib/date-format";
import {
  fetchAndExpandVillaAvailability,
  type VillaAvailabilityArrays,
} from "@/lib/villa-availability.helper";
import type { PriceRange } from "@/lib/villa-row.types";
/* 🛡️ Günlük indirimli fiyat GÖSTERİMİ için — `PriceList.tsx` ile AYNI
   iki pure fonksiyon. Yeni indirim formülü YAZILMADI. */
import {
  getActiveDiscount,
  applyDiscountToDailyPrice,
  type DiscountRange,
} from "@/lib/price.engine";
import {
  externalStringsToDateArrays,
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";
/* 🛡️ PHASE 10B — locale-aware UI stringleri (hafta günü baş harfleri,
   ay adı, prev/next aria-label). `locale` opsiyonel, default "tr" —
   mevcut TR call-site'ı (kiralik-villa/[slug]/page.tsx) hiç değişmeden
   byte-identical render eder. Availability fetch / `getDayStyle`
   çağrısına ve renk kontratına DOKUNULMADI. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { LOCALE_BCP47, type Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ AvailabilityInlineCalendar — PUBLIC VILLA DETAY TAKVİMİ
   ===============================================================
   FAZ 10: Admin reservation calendar'ın premium UX'ine yaklaştırıldı.

   READ-ONLY: Bu component yalnız görselleştirme. Tarih seçimi
   BookingSidebar'ın işi; oraya HİÇBİR şekilde dokunulmuyor.

   ─────────────────────────────────────────────────────────────
   ADMIN'DEN ALINAN UI PATTERN'LERİ (BYTE-IDENTICAL render):
     - Multi-month grid (1/2/3 col responsive)
     - Premium nav header (prev / today / next + range label)
     - Legend (Onaylı / Beklemede / Müsait)
     - Custom Pzt-Paz 7×6 grid
     - Today highlight
     - `getDayStyle` color contract (red half-day, yellow pending)

   ─────────────────────────────────────────────────────────────
   PUBLIC-SPESİFİK FEATURELAR (KORUNDU):
     - Cell altında günlük fiyat (currency context aware)
     - Read-only — click/drag/touch handler YOK
     - `aria-disabled` semantic; tabindex=-1

   ─────────────────────────────────────────────────────────────
   KAYNAK SOURCE-OF-TRUTH:
     - Block / checkin / checkout / pending arrays:
         lib/villa-availability.helper (shared, pure)
     - Color rendering:
         lib/calendar.engine > getDayStyle (BookingSidebar ile aynı)
     - Status allow-list:
         pending + confirmed (Faz 2B contract)

   ─────────────────────────────────────────────────────────────
   BUNDLE ETKİSİ:
     - DROP: react-day-picker, date-fns/locale/tr (BookingSidebar
       hala bunları kullandığı için /kiralik-villa/[slug] chunk
       boyutu identical kalır; standalone kullanımda ~35 KB
       tasarruf — gelecekteki sayfalar için).
     - ADD: 4 lucide ikon (~2 KB, tree-shakeable).

   ─────────────────────────────────────────────────────────────
   COUPLING:
     BookingSidebar: SIFIR. Hiçbir state/prop paylaşımı yok.
     ReservationCalendar (admin): SIFIR. Admin component buradan
     import edilmiyor; yalnız UI pattern'i ilham alındı.
     calendar.engine: AYNEN reuse (getDayStyle).
   =============================================================== */

type GridCell = { date: Date; inMonth: boolean };

/* ---------------------------------------------------------------
   🔥 buildMonthGrid — Pzt başlangıçlı 7×6 (42 cell) grid
   ---------------------------------------------------------------
   Admin'in `buildMonthGrid` ile BYTE-IDENTICAL date math; o tarafa
   coupling YOK (kendi local helper'ımız).
*/
function buildMonthGrid(viewMonth: Date): GridCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const firstDow = (first.getDay() + 6) % 7;
  const lastDow = (last.getDay() + 6) % 7;

  const cells: GridCell[] = [];

  for (let i = firstDow; i > 0; i--) {
    cells.push({ date: new Date(year, month, 1 - i), inMonth: false });
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
    cells.push({
      date: new Date(tail.getFullYear(), tail.getMonth(), tail.getDate() + 1),
      inMonth: false,
    });
  }
  return cells.slice(0, 42);
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/* Tablet/desktop responsive: 1 / 2 / 3 ay aynı anda. */
type VisibleMonthsCount = 1 | 2 | 3;

function getVisibleMonths(anchor: Date, count: VisibleMonthsCount): Date[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  return Array.from({ length: count }, (_, i) => new Date(y, m + i, 1));
}

/* ===============================================================
   COMPONENT
   =============================================================== */

type Props = {
  villaId: string;
  /** Price ranges — VillaPriceEmbed shape; villa detail
   *  `getVillaPrices` çıktısı buraya geçer. Faz 9 hardening:
   *  `Price[]` → `PriceRange[]`. */
  prices: PriceRange[];
  /** 🛡️ FAZ 56H-B — External iCal block date strings (server-fetched).
   *  Mevcut reservation/manual array'leriyle MERGE edilir; engine
   *  aynı kırmızı render uygular. Public kullanıcı kaynak ayrımı
   *  GÖRMEZ — "iCal" badge yok, source_name yok. Default empty
   *  → backward-compat. */
  externalBlocks?: ExternalCalendarStringArrays;
  /** 🛡️ ADDITIVE — public villa_discounts kayıtları (villa detay
   *  sayfasında `getVillaDiscounts` ile ZATEN çekiliyor). Verilmezse
   *  (örn. özel link sayfası) takvim MEVCUT tek-fiyat görünümünde
   *  kalır — DOM birebir eski hali. Yeni veri kaynağı OLUŞTURULMADI. */
  discounts?: DiscountRange[];
  /* 🛡️ PHASE 10B — opsiyonel, default "tr". */
  locale?: Locale;
};

export default function AvailabilityInlineCalendar({
  villaId,
  prices,
  externalBlocks = EMPTY_EXTERNAL_STRING_ARRAYS,
  discounts,
  locale,
}: Props) {
  const { currency, rates } = useCurrency();
  const dict = getDictionary(locale);
  const bcp47 = LOCALE_BCP47[locale ?? "tr"];

  /* Availability arrays — shared helper'dan gelir. Boş başlangıç
     hızlı render; useEffect sonrası real data. */
  const [availability, setAvailability] = useState<VillaAvailabilityArrays>({
    blockedDates: [],
    checkinDates: [],
    checkoutDates: [],
    pendingCheckinDates: [],
    pendingCheckoutDates: [],
    pendingMiddleDates: [],
    manualBlockedDates: [],
    manualCheckinDates: [],
    manualCheckoutDates: [],
  });

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  /* Fetch on mount / villa change. cancelled flag → component
     unmount sırasında setState yarış koşulu önler (Faz 2A pattern). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchAndExpandVillaAvailability(villaId);
      if (cancelled) return;
      setAvailability(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [villaId]);

  /* `getDayStyle` admin ile aynı kontratı bekliyor: confirmed +
     manual hepsi birleşik "blocked/checkin/checkout" arraylerinde.
     Mevcut public mantığı korunuyor: confirmed + manual merge.
     🛡️ FAZ 56H-B — external iCal block date'leri de aynı array'lere
     enjekte edilir (3. source). Public render → kırmızı, kaynak
     ayrımı görünmez. Memoization: `availability` veya
     `externalBlocks` referansı değişirse rebuild. */
  const merged = useMemo(() => {
    const a = availability;
    const ext = externalStringsToDateArrays(externalBlocks);
    return {
      blockedDates: [
        ...a.blockedDates,
        ...a.manualBlockedDates,
        ...ext.externalMiddleDates,
      ],
      checkinDates: [
        ...a.checkinDates,
        ...a.manualCheckinDates,
        ...ext.externalCheckinDates,
      ],
      checkoutDates: [
        ...a.checkoutDates,
        ...a.manualCheckoutDates,
        ...ext.externalCheckoutDates,
      ],
      pendingCheckinDates: a.pendingCheckinDates,
      pendingCheckoutDates: a.pendingCheckoutDates,
      pendingMiddleDates: a.pendingMiddleDates,
    };
  }, [availability, externalBlocks]);

  /* ---------------------------------------------------------------
     🔥 Günlük fiyat — currency context'e göre çevrilmiş + formatted.
     Davranış byte-identical (eski getPriceForDate inline).
     `formatLocalDate` → LOCAL gün, UTC drift yok.
  --------------------------------------------------------------- */
  const getPriceForDate = (date: Date): string | null => {
    const target = formatLocalDate(date);
    const found = prices?.find(
      (p) => target >= p.start_date && target <= p.end_date
    );
    if (!found) return null;
    const converted = convertPrice(
      Number(found.price || 0),
      found.currency || "TRY",
      currency,
      rates
    );
    return formatCurrency(converted, currency, locale ?? "tr");
  };

  /* ---------------------------------------------------------------
     🛡️ Günlük İNDİRİMLİ fiyat — SALT GÖSTERİM.
     Yukarıdaki `getPriceForDate` (indirimsiz) DEĞİŞTİRİLMEDİ; bu onun
     indirimli ikizidir ve `PriceList.tsx` ile BİREBİR AYNI iki pure
     fonksiyonu kullanır (getActiveDiscount → applyDiscountToDailyPrice).
     `discounts` yoksa veya o gün indirim aktif değilse null döner →
     hücre MEVCUT tek-fiyat görünümünde kalır.
  --------------------------------------------------------------- */
  const getDiscountedPriceForDate = (date: Date): string | null => {
    if (!discounts || discounts.length === 0) return null;
    const target = formatLocalDate(date);
    const found = prices?.find(
      (p) => target >= p.start_date && target <= p.end_date
    );
    if (!found) return null;

    const activeDiscount = getActiveDiscount(date, discounts);
    if (!activeDiscount) return null;

    const converted = convertPrice(
      Number(found.price || 0),
      found.currency || "TRY",
      currency,
      rates
    );
    const discounted = applyDiscountToDailyPrice(
      {
        converted,
        original: Number(found.price || 0),
        original_currency: found.currency || "TRY",
      },
      activeDiscount,
      currency,
      rates
    );
    /* Sahte indirim koruması (PriceList `isDiscounted` kuralı). */
    if (!(discounted.converted < converted)) return null;
    return formatCurrency(discounted.converted, currency, locale ?? "tr");
  };

  /* Responsive month count — admin pattern'iyle aynı: 1/2/3 col.
     3. ay CSS ile yalnız lg+ görünür (bkz. grid className + kart
     className aşağıda); mobil/tablet önceki 2-aylık görünümü aynen
     korur. */
  const visibleMonths = useMemo(
    () => getVisibleMonths(currentMonth, 3),
    [currentMonth]
  );
  const todayKey = new Date().toDateString();

  return (
    <div className="select-none">
      {/* ─────────────────────────────────────────────
          Minimal floating nav — yalnız sol/sağ ok (sağa yaslı).
          Eski header bar YOK; sadece ay gezinme.
          ───────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 mb-3">
        <button
          type="button"
          onClick={() =>
            setCurrentMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
            )
          }
          className="w-9 h-9 rounded-full bg-white border border-[var(--color-stone-100)] shadow-[0_4px_12px_-6px_rgba(11,31,58,0.2)] flex items-center justify-center text-[var(--color-stone-800)] hover:-translate-y-0.5 hover:border-[var(--color-stone-200)] hover:shadow-[0_8px_18px_-8px_rgba(11,31,58,0.25)] transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          aria-label={dict.availability.prevMonth}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() =>
            setCurrentMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
            )
          }
          className="w-9 h-9 rounded-full bg-white border border-[var(--color-stone-100)] shadow-[0_4px_12px_-6px_rgba(11,31,58,0.2)] flex items-center justify-center text-[var(--color-stone-800)] hover:-translate-y-0.5 hover:border-[var(--color-stone-200)] hover:shadow-[0_8px_18px_-8px_rgba(11,31,58,0.25)] transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          aria-label={dict.availability.nextMonth}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ─────────────────────────────────────────────
          Multi-month grid — mobile 1 col / tablet 2 col / desktop (lg+) 3 col
          ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {visibleMonths.map((viewMonth, monthIdx) => {
          const cells = buildMonthGrid(viewMonth);
          return (
            <div
              key={`${viewMonth.getFullYear()}-${viewMonth.getMonth()}`}
              className={
                (monthIdx === 2 ? "hidden lg:block " : "") +
                "rounded-2xl border border-[var(--color-stone-100)] bg-white px-3 py-3.5 md:px-4 md:py-4 shadow-[0_6px_18px_-14px_rgba(11,31,58,0.15)]"
              }
            >
              <div className="px-1 mb-1.5">
                <span className="font-display text-[12px] font-semibold text-[var(--color-stone-800)] tracking-[-0.01em] capitalize">
                  {viewMonth.toLocaleDateString(bcp47, { month: "long" })}
                  <span className="text-[var(--color-stone-400)] font-normal ml-1">
                    {viewMonth.getFullYear()}
                  </span>
                </span>
              </div>

              <div className="grid grid-cols-7 gap-0.5 px-0.5 mb-1">
                {dict.availability.weekdayShort.map((w) => (
                  <div
                    key={w}
                    className="text-center text-[9px] font-bold tracking-[0.14em] uppercase text-[var(--color-stone-400)] py-1"
                  >
                    {w[0]}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 px-0.5">
                {cells.map((cell, i) => {
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

                  /* getDayStyle: BookingSidebar ve admin ile AYNI
                     color contract (red half-day, yellow pending,
                     gradient seams). */
                  const { bg, color } = getDayStyle({
                    date,
                    blockedDates: merged.blockedDates,
                    checkinDates: merged.checkinDates,
                    checkoutDates: merged.checkoutDates,
                    pendingCheckinDates: merged.pendingCheckinDates,
                    pendingCheckoutDates: merged.pendingCheckoutDates,
                    pendingMiddleDates: merged.pendingMiddleDates,
                  });

                  const isBlocked = merged.blockedDates.some((d) =>
                    sameDay(d, date)
                  );
                  const isToday = date.toDateString() === todayKey;
                  const price = !isBlocked ? getPriceForDate(date) : null;
                  const discountedPrice = !isBlocked
                    ? getDiscountedPriceForDate(date)
                    : null;

                  const cellStyle: CSSProperties = {
                    cursor: "default",
                  };
                  const gradientStyle: CSSProperties = {
                    background: bg,
                  };

                  return (
                    <div
                      key={`${i}-${dateKey}`}
                      className="aspect-square relative rounded-md"
                      style={cellStyle}
                      aria-disabled
                      role="presentation"
                    >
                      {/* Layer 1: gradient base — getDayStyle aynen */}
                      <div
                        className="absolute inset-0 rounded-md overflow-hidden"
                        style={gradientStyle}
                        aria-hidden
                      />

                      {/* Layer 2: number + price stack */}
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center text-[11px] select-none"
                        style={{
                          color,
                          pointerEvents: "none",
                          fontWeight: 600,
                          lineHeight: 1,
                        }}
                      >
                        <span
                          className={
                            isToday
                              ? "ring-1 ring-[var(--color-champagne-500,#c89b3c)] rounded-md px-1 leading-none font-bold"
                              : ""
                          }
                          style={{ fontSize: 11 }}
                        >
                          {date.getDate()}
                        </span>
                        {price && discountedPrice ? (
                          /* 🛡️ İNDİRİMLİ GÜN — üstü çizili normal fiyat +
                             indirimli fiyat (villa detay sezon listesiyle
                             AYNI gösterim dili). */
                          <span
                            className="mt-0.5 flex flex-col items-center text-[var(--color-stone-700)]"
                            style={{ lineHeight: 1 }}
                          >
                            <span
                              style={{
                                fontSize: 7,
                                /* 🛡️ SALT RENK (bu tur) — üstü çizili ESKİ
                                   fiyat kırmızı (#dc2626); BookingCalendar
                                   ile AYNI ton. Parent span'in stone-700
                                   class'ını YALNIZ bu element için ezer.
                                   İndirimli fiyat ve indirimsiz gün
                                   görünümü DEĞİŞMEDİ. */
                                color: "#dc2626",
                                opacity: 0.6,
                                fontWeight: 500,
                                textDecoration: "line-through",
                              }}
                            >
                              {price}
                            </span>
                            <span
                              style={{
                                fontSize: 8,
                                opacity: 0.95,
                                fontWeight: 600,
                              }}
                            >
                              {discountedPrice}
                            </span>
                          </span>
                        ) : price ? (
                          /* MEVCUT DAVRANIŞ — BYTE-IDENTICAL. */
                          <span
                            className="mt-0.5 text-[var(--color-stone-700)]"
                            style={{
                              fontSize: 8,
                              opacity: 0.85,
                              fontWeight: 500,
                            }}
                          >
                            {price}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
