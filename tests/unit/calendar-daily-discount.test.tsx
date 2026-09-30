/* ===============================================================
   🛡️ PUBLIC TAKVİMLERDE GÜNLÜK İNDİRİMLİ FİYAT GÖSTERİMİ
   ===============================================================
   İndirimli günde hücre: üstü çizili normal fiyat + indirimli fiyat.
   İndirim yoksa hücre MEVCUT tek-fiyat görünümünde kalır.

   Değerler price.engine'in ZATEN export ettiği iki pure fonksiyondan
   gelir (`getActiveDiscount` → `applyDiscountToDailyPrice`) —
   `PriceList.tsx` (villa detay sezon listesi) ile AYNI desen. Yeni
   indirim formülü YAZILMADI; bu test onu kaynak seviyesinde de kilitler.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getActiveDiscount,
  applyDiscountToDailyPrice,
  type DiscountRange,
} from "@/lib/price.engine";

vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: { TRY: 1 } }),
}));

/* AvailabilityInlineCalendar kendi availability fetch'ini yapar —
   network YOK; boş diziler (hiçbir gün bloklu değil). */
const availabilityMock = vi.fn(async () => ({
  blockedDates: [] as Date[],
  checkinDates: [] as Date[],
  checkoutDates: [] as Date[],
  pendingCheckinDates: [] as Date[],
  pendingCheckoutDates: [] as Date[],
  pendingMiddleDates: [] as Date[],
  manualBlockedDates: [] as Date[],
  manualCheckinDates: [] as Date[],
  manualCheckoutDates: [] as Date[],
}));
vi.mock("@/lib/villa-availability.helper", () => ({
  fetchAndExpandVillaAvailability: () => availabilityMock(),
}));

import BookingCalendar from "@/app/components/villa/booking/BookingCalendar";
import AvailabilityInlineCalendar from "@/app/components/villa/AvailabilityInlineCalendar";
import type { UseBookingEngineReturn } from "@/app/components/villa/booking/useBookingEngine";

/* ---------------- fixtures ---------------- */
const YEAR = 2026;
const MONTH_IDX = 9; /* Ekim */
const MONTH = new Date(YEAR, MONTH_IDX, 1);

const NIGHTLY = 10000;
const PRICES = [
  {
    price: NIGHTLY,
    currency: "TRY",
    start_date: "2026-10-01",
    end_date: "2026-10-31",
  },
];

/** 08–12 Ekim arası %20 indirim (diğer günler indirimsiz). */
const DISCOUNTS: DiscountRange[] = [
  {
    start_date: "2026-10-08",
    end_date: "2026-10-12",
    discount_type: "percent",
    discount_value: 20,
    currency: null,
  },
];

/** %0 indirim → indirimli = normal (sahte indirim senaryosu). */
const ZERO_DISCOUNT: DiscountRange[] = [
  {
    start_date: "2026-10-08",
    end_date: "2026-10-12",
    discount_type: "percent",
    discount_value: 0,
    currency: null,
  },
];

/* ---------------- BookingCalendar için minimal engine stub ----------
   Takvim PURE UI'dır; yalnız aşağıdaki alanları tüketir. Fiyat
   fonksiyonları GERÇEK price.engine çağrılarıyla beslenir — test
   kendi indirim formülünü YAZMAZ. */
function makeEngine(discounts: DiscountRange[] | null): UseBookingEngineReturn {
  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const findPrice = (date: Date) => {
    const target = formatDate(date);
    return PRICES.find(
      (p) => target >= p.start_date && target <= p.end_date
    );
  };

  const getPriceForDate = (date: Date) => {
    const found = findPrice(date);
    return found ? found.price : null;
  };

  const getDiscountedPriceForDate = (date: Date) => {
    const found = findPrice(date);
    if (!found) return null;
    const active = getActiveDiscount(date, discounts);
    if (!active) return null;
    const discounted = applyDiscountToDailyPrice(
      {
        converted: found.price,
        original: found.price,
        original_currency: "TRY",
      },
      active,
      "TRY",
      { TRY: 1 }
    );
    return discounted.converted < found.price ? discounted.converted : null;
  };

  return {
    startDate: null,
    endDate: null,
    setStartDate: vi.fn(),
    setEndDate: vi.fn(),
    mergedBlockedDates: [new Date(YEAR, MONTH_IDX, 20)],
    mergedCheckinDates: [],
    mergedCheckoutDates: [],
    pendingCheckinDates: [],
    pendingCheckoutDates: [],
    pendingMiddleDates: [],
    today: new Date(YEAR, MONTH_IDX, 1),
    isIntersection: () => false,
    hasConflict: () => false,
    getPriceForDate,
    getDiscountedPriceForDate,
  } as unknown as UseBookingEngineReturn;
}

function renderBookingCalendar(discounts: DiscountRange[] | null) {
  return render(
    <BookingCalendar
      engine={makeEngine(discounts)}
      currentMonth={MONTH}
      onCurrentMonthChange={vi.fn()}
    />
  );
}

/** Gün hücresinin metni (gün numarası + fiyat(lar) yapışık). */
function dayCellText(container: HTMLElement, day: number): string {
  const cells = Array.from(container.querySelectorAll('[role="gridcell"]'));
  const pattern = new RegExp(`^${day}(₺|$)`);
  const match = cells.find((el) => pattern.test(el.textContent || ""));
  return match?.textContent || "";
}

function struckTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("*"))
    .filter((el) => {
      const style = (el as HTMLElement).style;
      return (
        style?.textDecoration === "line-through" ||
        el.className.toString().includes("line-through")
      );
    })
    .map((el) => el.textContent || "");
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ===============================================================
   A) BookingCalendar (villa detay sidebar + /arama modali)
   =============================================================== */
describe("A) BookingCalendar — günlük indirim gösterimi", () => {
  it("1) indirimsiz gün → TEK fiyat (mevcut görünüm)", () => {
    const { container } = renderBookingCalendar(null);
    expect(dayCellText(container, 5)).toBe("5₺10.000");
    expect(struckTexts(container)).toHaveLength(0);
  });

  it("2) %20 indirimli gün → üstü çizili ₺10.000 + ₺8.000", () => {
    const { container } = renderBookingCalendar(DISCOUNTS);
    const text = dayCellText(container, 9);
    expect(text).toContain("₺10.000");
    expect(text).toContain("₺8.000");
    expect(struckTexts(container).join(" ")).toContain("₺10.000");
  });

  it("3) indirimli = normal ise üstü çizili GÖSTERİLMEZ (sahte indirim yok)", () => {
    const { container } = renderBookingCalendar(ZERO_DISCOUNT);
    expect(dayCellText(container, 9)).toBe("9₺10.000");
    expect(struckTexts(container)).toHaveLength(0);
  });

  it("4) aynı ayda indirimli ve indirimsiz günler AYRI AYRI doğru", () => {
    const { container } = renderBookingCalendar(DISCOUNTS);
    /* 8–12 indirimli, 13 indirimsiz. */
    expect(dayCellText(container, 8)).toContain("₺8.000");
    expect(dayCellText(container, 12)).toContain("₺8.000");
    expect(dayCellText(container, 13)).toBe("13₺10.000");
  });

  it("5) bloklu günün görünümü DEĞİŞMEDİ (fiyat yok)", () => {
    const { container } = renderBookingCalendar(DISCOUNTS);
    expect(dayCellText(container, 20)).toBe("20");
  });

  it("6) tarih seçme davranışı DEĞİŞMEDİ (gün tıklaması engine'e gider)", () => {
    const engine = makeEngine(DISCOUNTS);
    const { container } = render(
      <BookingCalendar
        engine={engine}
        currentMonth={MONTH}
        onCurrentMonthChange={vi.fn()}
      />
    );
    const cells = Array.from(container.querySelectorAll('[role="gridcell"]'));
    const day9 = cells.find((el) => /^9₺/.test(el.textContent || ""));
    fireEvent.click(day9!);
    expect(engine.setStartDate).toHaveBeenCalled();
  });
});

/* ===============================================================
   B) AvailabilityInlineCalendar (villa detay gövdesi)
   =============================================================== */
describe("B) AvailabilityInlineCalendar — günlük indirim gösterimi", () => {
  /* Inline takvim MEVCUT ayı (gerçek "bugün") render eder → fixture'lar
     geniş aralıklı ve çalışma ayına göre türetilir. */
  const NOW = new Date();
  const CUR_Y = NOW.getFullYear();
  const CUR_M = String(NOW.getMonth() + 1).padStart(2, "0");
  const WIDE_PRICES = [
    {
      price: NIGHTLY,
      currency: "TRY",
      start_date: "2020-01-01",
      end_date: "2035-12-31",
    },
  ];
  /* Yalnız bu ayın 1–5'i indirimli → kalan günler indirimsiz kalır. */
  const PARTIAL_DISCOUNT: DiscountRange[] = [
    {
      start_date: `${CUR_Y}-${CUR_M}-01`,
      end_date: `${CUR_Y}-${CUR_M}-05`,
      discount_type: "percent",
      discount_value: 20,
      currency: null,
    },
  ];
  const WIDE_ZERO_DISCOUNT: DiscountRange[] = [
    {
      start_date: "2020-01-01",
      end_date: "2035-12-31",
      discount_type: "percent",
      discount_value: 0,
      currency: null,
    },
  ];

  async function renderInline(discounts?: DiscountRange[]) {
    const r = render(
      <AvailabilityInlineCalendar
        villaId="v1"
        prices={WIDE_PRICES}
        discounts={discounts}
      />
    );
    await waitFor(() => expect(availabilityMock).toHaveBeenCalled());
    return r;
  }

  it("7) `discounts` verilmezse MEVCUT tek-fiyat görünümü (DOM aynı)", async () => {
    const { container } = await renderInline();
    expect(container.textContent).toContain("₺10.000");
    expect(struckTexts(container)).toHaveLength(0);
  });

  it("8) indirimli günlerde üstü çizili normal + indirimli fiyat", async () => {
    const { container } = await renderInline(PARTIAL_DISCOUNT);
    const struck = struckTexts(container).join(" ");
    expect(struck).toContain("₺10.000");
    expect(container.textContent).toContain("₺8.000");
  });

  it("9) indirimsiz günler TEK fiyat olarak kalır", async () => {
    const { container } = await renderInline(PARTIAL_DISCOUNT);
    /* Yalnız ayın 1–5'i indirimli; kalan günler tek fiyat. */
    const struckCount = struckTexts(container).length;
    const allPrices = (container.textContent || "").match(/₺10\.000/g) || [];
    expect(allPrices.length).toBeGreaterThan(struckCount);
  });

  it("10) sahte indirim (fiyat eşit) → üstü çizili YOK", async () => {
    const { container } = await renderInline(WIDE_ZERO_DISCOUNT);
    expect(struckTexts(container)).toHaveLength(0);
  });
});

/* ===============================================================
   C) KAYNAK KİLİDİ — motor ve kapsam
   =============================================================== */
describe("C) kaynak kilidi", () => {
  const read = (rel: string) =>
    readFileSync(join(process.cwd(), rel), "utf-8");
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("11) takvimler MEVCUT price.engine fonksiyonlarını kullanır, yeni formül YOK", () => {
    const engine = codeOnly(
      read("app/components/villa/booking/useBookingEngine.ts")
    );
    const inline = codeOnly(
      read("app/components/villa/AvailabilityInlineCalendar.tsx")
    );
    for (const src of [engine, inline]) {
      expect(src).toMatch(/getActiveDiscount\(/);
      expect(src).toMatch(/applyDiscountToDailyPrice\(/);
      /* Elde yazılmış indirim aritmetiği yok. */
      expect(src).not.toMatch(/discount_value\s*\/\s*100/);
      expect(src).not.toMatch(/\*\s*\(1\s*-\s*/);
    }
  });

  it("12) `calculateGrandTotal` çağrı sayısı ARTMADI (takvimlerde yok)", () => {
    const calendar = codeOnly(
      read("app/components/villa/booking/BookingCalendar.tsx")
    );
    const inline = codeOnly(
      read("app/components/villa/AvailabilityInlineCalendar.tsx")
    );
    expect(calendar).not.toMatch(/calculateGrandTotal\(/);
    expect(inline).not.toMatch(/calculateGrandTotal\(/);
    const engine = codeOnly(
      read("app/components/villa/booking/useBookingEngine.ts")
    );
    /* Engine'de calculateGrandTotal TEK çağrı (mevcut hesap). */
    expect((engine.match(/calculateGrandTotal\(/g) || []).length).toBe(1);
  });

  it("13) price.engine.ts'e DOKUNULMADI (imza + discount default)", () => {
    const src = read("lib/price.engine.ts");
    expect(src).toMatch(/discounts = null,/);
    expect(src).toMatch(/export const applyDiscountToDailyPrice/);
  });

  it("14) admin takvimlerine indirim gösterimi SIZMADI", () => {
    for (const rel of [
      "app/components/admin/reservation-form/ReservationCalendar.tsx",
    ]) {
      expect(codeOnly(read(rel))).not.toMatch(/applyDiscountToDailyPrice/);
    }
  });
});
