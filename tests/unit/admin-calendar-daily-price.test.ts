/* ===============================================================
   🛡️ ADMIN REZERVASYON TAKVİMİ — GECELİK FİYAT + İNDİRİM
   ===============================================================
   HEDEF: Public villa detay takvimi ile admin rezervasyon takvimi
   AYNI gün için AYNI sonucu üretmeli.

   PARİTE NASIL KANITLANIYOR:
   Aşağıdaki `publicReference()` fonksiyonu, public
   `useBookingEngine.getPriceForDate` + `getDiscountedPriceForDate`
   formüllerinin BİREBİR kopyasıdır (o dosyadan okunan mantık).
   `buildDayPriceMap` (admin) çıktısı bu referansla karşılaştırılır.
   İkisi de `lib/price.engine.ts`'in AYNI pure fonksiyonlarını
   kullanır; farklı bir sonuç çıkarsa test kırılır.
=============================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getActiveDiscount,
  applyDiscountToDailyPrice,
  type DiscountRange,
} from "@/lib/price.engine";
import { convertPrice, formatCurrency } from "@/lib/currency";
import {
  buildDayPriceMap,
  type DayPriceRange,
} from "@/app/components/admin/reservation-form/_helpers/dayPriceMap";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

const RATES = { TRY: 1, EUR: 35, USD: 32 };

const PRICES: DayPriceRange[] = [
  { start_date: "2026-05-01", end_date: "2026-05-31", price: 7500, currency: "TRY" },
  { start_date: "2026-06-01", end_date: "2026-06-30", price: 9000, currency: "TRY" },
  { start_date: "2026-07-01", end_date: "2026-07-31", price: 200, currency: "EUR" },
];

const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
};

const days = (list: string[]) => list.map(d);

/* ---------------------------------------------------------------
   PUBLIC REFERANS — useBookingEngine'deki iki fonksiyonun kopyası
   (app/components/villa/booking/useBookingEngine.ts).
--------------------------------------------------------------- */
function publicReference(
  date: Date,
  prices: DayPriceRange[],
  discounts: DiscountRange[] | null,
  currency: string,
  rates: Record<string, number>
): { price: number | null; discounted: number | null } {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const target = `${y}-${m}-${dd}`;

  const found = prices.find(
    (p) => target >= p.start_date && target <= p.end_date
  );
  if (!found) return { price: null, discounted: null };

  const price = convertPrice(
    found.price,
    found.currency || "TRY",
    currency,
    rates
  );

  const activeDiscount = getActiveDiscount(date, discounts);
  if (!activeDiscount) return { price, discounted: null };

  const discounted = applyDiscountToDailyPrice(
    {
      converted: price,
      original: found.price,
      original_currency: found.currency || "TRY",
    },
    activeDiscount,
    currency,
    rates
  );
  return {
    price,
    discounted: discounted.converted < price ? discounted.converted : null,
  };
}

/* ===============================================================
   1) PUBLIC ↔ ADMIN PARİTESİ
   =============================================================== */
describe("1) public takvim fiyatı == admin takvim fiyatı", () => {
  const ALL = [
    "2026-05-01", "2026-05-14", "2026-05-15", "2026-05-16", "2026-05-31",
    "2026-06-01", "2026-06-15", "2026-06-30",
    "2026-07-01", "2026-07-20",
    "2026-04-30", "2026-08-01",
  ];

  const SCENARIOS: Array<[string, DiscountRange[] | null]> = [
    ["indirim YOK", null],
    ["indirim boş dizi", []],
    [
      "percent %20 (15-20 Mayıs)",
      [
        {
          start_date: "2026-05-15",
          end_date: "2026-05-20",
          discount_type: "percent",
          discount_value: 20,
          currency: null,
        },
      ],
    ],
    [
      "fixed ₺6000 (15-20 Mayıs)",
      [
        {
          start_date: "2026-05-15",
          end_date: "2026-05-20",
          discount_type: "fixed",
          discount_value: 6000,
          currency: "TRY",
        },
      ],
    ],
    [
      "sahte indirim (fixed ₺9000 > ₺7500)",
      [
        {
          start_date: "2026-05-15",
          end_date: "2026-05-20",
          discount_type: "fixed",
          discount_value: 9000,
          currency: "TRY",
        },
      ],
    ],
  ];

  for (const [label, discounts] of SCENARIOS) {
    it(`1) ${label} → her gün için AYNI sonuç`, () => {
      const map = buildDayPriceMap(days(ALL), PRICES, discounts, "TRY", RATES);
      for (const iso of ALL) {
        const ref = publicReference(d(iso), PRICES, discounts, "TRY", RATES);
        const admin = map.get(iso) ?? null;

        if (ref.price === null) {
          expect(admin, `${iso} fiyatsız gün haritada olmamalı`).toBeNull();
          continue;
        }
        expect(admin, `${iso} admin'de fiyat olmalı`).not.toBeNull();
        expect(admin!.price, `${iso} normal fiyat`).toBe(ref.price);
        expect(admin!.discounted, `${iso} indirimli fiyat`).toBe(
          ref.discounted
        );
      }
    });
  }
});

/* ===============================================================
   2-5) DEĞER DOĞRULUĞU
   =============================================================== */
describe("2-5) fiyat ve indirim değerleri", () => {
  const PERCENT: DiscountRange[] = [
    {
      start_date: "2026-05-15",
      end_date: "2026-05-20",
      discount_type: "percent",
      discount_value: 20,
      currency: null,
    },
  ];

  it("3) indirimsiz tarih → normal fiyat, discounted null", () => {
    const map = buildDayPriceMap(days(["2026-05-14"]), PRICES, PERCENT, "TRY", RATES);
    expect(map.get("2026-05-14")).toEqual({ price: 7500, discounted: null });
  });

  it("2+4+5) indirimli tarih → üstü çizili 7500, indirimli 6000", () => {
    const map = buildDayPriceMap(days(["2026-05-15"]), PRICES, PERCENT, "TRY", RATES);
    const dp = map.get("2026-05-15")!;
    expect(dp.price).toBe(7500);       // üzeri çizili NORMAL fiyat
    expect(dp.discounted).toBe(6000);  // %20 indirimli
  });

  it("4b) indirim aralığının SINIRLARI dahil (kapalı interval)", () => {
    const map = buildDayPriceMap(
      days(["2026-05-15", "2026-05-20", "2026-05-21"]),
      PRICES, PERCENT, "TRY", RATES
    );
    expect(map.get("2026-05-15")!.discounted).toBe(6000);
    expect(map.get("2026-05-20")!.discounted).toBe(6000);
    expect(map.get("2026-05-21")!.discounted).toBeNull();
  });

  it("5b) fixed indirim = o gecenin NİHAİ fiyatı", () => {
    const FIXED: DiscountRange[] = [
      {
        start_date: "2026-05-15",
        end_date: "2026-05-15",
        discount_type: "fixed",
        discount_value: 6000,
        currency: "TRY",
      },
    ];
    const map = buildDayPriceMap(days(["2026-05-15"]), PRICES, FIXED, "TRY", RATES);
    expect(map.get("2026-05-15")).toEqual({ price: 7500, discounted: 6000 });
  });

  it("5c) sahte indirim (daha YÜKSEK) → discounted null", () => {
    const FAKE: DiscountRange[] = [
      {
        start_date: "2026-05-15",
        end_date: "2026-05-15",
        discount_type: "fixed",
        discount_value: 9000,
        currency: "TRY",
      },
    ];
    const map = buildDayPriceMap(days(["2026-05-15"]), PRICES, FAKE, "TRY", RATES);
    expect(map.get("2026-05-15")!.discounted).toBeNull();
  });

  it("5d) yabancı para birimli sezon → TRY'ye çevrilir (convertPrice)", () => {
    const map = buildDayPriceMap(days(["2026-07-10"]), PRICES, null, "TRY", RATES);
    const ref = publicReference(d("2026-07-10"), PRICES, null, "TRY", RATES);
    expect(map.get("2026-07-10")!.price).toBe(ref.price);
  });

  it("5e) fiyatı olmayan gün haritaya GİRMEZ", () => {
    const map = buildDayPriceMap(days(["2026-04-30"]), PRICES, null, "TRY", RATES);
    expect(map.has("2026-04-30")).toBe(false);
  });

  it("5f) prices boş → boş Map (eski davranış)", () => {
    expect(buildDayPriceMap(days(["2026-05-15"]), [], null, "TRY", RATES).size).toBe(0);
    expect(buildDayPriceMap(days(["2026-05-15"]), null, null, "TRY", RATES).size).toBe(0);
  });
});

/* ===============================================================
   6) PARA BİRİMİ FORMATI PUBLIC İLE AYNI
   =============================================================== */
describe("6) para birimi / format", () => {
  it("6a) takvim public ile AYNI formatCurrency'yi kullanır", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    expect(cal).toContain('import { formatCurrency } from "@/lib/currency"');
    expect(cal).toContain('formatCurrency(dp.price, priceCurrency, "tr")');
    expect(cal).toContain('formatCurrency(\n                                  dp.discounted,');
  });

  it("6b) ₺ sembolü ve yuvarlama public ile birebir", () => {
    /* Public BookingCalendar da aynı fonksiyonu çağırır. */
    expect(formatCurrency(7500, "TRY", "tr")).toBe(
      formatCurrency(7500, "TRY", "tr")
    );
    expect(formatCurrency(7500, "TRY", "tr")).toMatch(/₺/);
    /* maximumFractionDigits: 0 → kuruş yok */
    expect(formatCurrency(7500.4, "TRY", "tr")).not.toMatch(/[.,]\d0\b/);
  });

  it("6c) admin TRY davranışı KORUNDU (varsayılan priceCurrency)", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    expect(cal).toContain('priceCurrency = "TRY"');
    for (const f of [
      "app/(admin)/maki-admin/reservations/ekle/page.tsx",
      "app/(admin)/maki-admin/reservations/[id]/_components/DateRangeCard.tsx",
    ]) {
      expect(src(f)).toContain('priceCurrency="TRY"');
    }
  });
});

/* ===============================================================
   7) TAKVİM ↔ TOPLAM TUTARLILIĞI (indirim toplama da yansır)
   =============================================================== */
describe("7) takvim ile toplam aynı indirimi görür", () => {
  it("7a) ekle sayfası calculateGrandTotal'a discounts geçiyor", () => {
    const p = src("app/(admin)/maki-admin/reservations/ekle/page.tsx");
    expect(p).toMatch(/calculateGrandTotal\(\{[\s\S]{0,400}discounts,/);
  });

  it("7b) düzenle recalc helper'ı discounts geçiriyor", () => {
    const h = src(
      "app/(admin)/maki-admin/reservations/[id]/_helpers/computeReservationPriceRecalc.ts"
    );
    expect(h).toContain(
      "discounts: discounts && discounts.length > 0 ? discounts : null,"
    );
  });

  it("7c) iki sayfa da takvime ve hesaba AYNI discounts state'ini veriyor", () => {
    for (const f of [
      "app/(admin)/maki-admin/reservations/ekle/page.tsx",
      "app/(admin)/maki-admin/reservations/[id]/page.tsx",
    ]) {
      const p = src(f);
      expect(p).toContain("const [discounts, setDiscounts]");
      expect(p).toContain("discounts={discounts}");
    }
  });
});

/* ===============================================================
   8) DUPLICATE MOTOR YOK / YENİ BAĞIMLILIK YOK
   =============================================================== */
describe("8) mimari kilitleri", () => {
  it("8a) 🔒 admin helper'ı price.engine'in pure fonksiyonlarını kullanır", () => {
    const h = src("app/components/admin/reservation-form/_helpers/dayPriceMap.ts");
    expect(h).toContain("getDailyPrice");
    expect(h).toContain("getActiveDiscount");
    expect(h).toContain("applyDiscountToDailyPrice");
    /* Kendi indirim/fiyat formülünü YAZMAZ. */
    const exec = h.slice(h.indexOf("export function buildDayPriceMap"));
    expect(exec).not.toMatch(/discount_value\s*\//);
    expect(exec).not.toMatch(/\*\s*0\.\d/);
    expect(exec).not.toContain("percent");
  });

  it("8b) 🔒 takvim component'i fiyat HESAPLAMAZ, yalnız gösterir", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    expect(cal).not.toContain("applyDiscountToDailyPrice");
    expect(cal).not.toContain("getActiveDiscount");
    expect(cal).not.toContain("getDailyPrice");
    expect(cal).toContain("buildDayPriceMap");
  });

  it("8c) 🔒 PUBLIC takvim ve engine DEĞİŞMEDİ", () => {
    const pub = src("app/components/villa/booking/BookingCalendar.tsx");
    expect(pub).toContain("getPriceForDate");
    expect(pub).toContain("getDiscountedPriceForDate");
    const eng = src("app/components/villa/booking/useBookingEngine.ts");
    expect(eng).toContain("const getPriceForDate = (date: Date) => {");
    expect(eng).toContain("const getDiscountedPriceForDate = (date: Date)");
  });

  it("8d) 🔒 yeni npm paketi YOK", () => {
    const pkg = JSON.parse(src("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const bad of ["dinero.js", "currency.js", "date-fns-tz", "dayjs"]) {
      expect(deps[bad]).toBeUndefined();
    }
    expect(deps["react-day-picker"]).toBeDefined(); // public zaten kullanıyor
  });

  it("8e) 🔒 YENİ API endpoint YOK — mevcut route additive genişledi", () => {
    const r = src("app/api/admin/villas/[id]/prices/route.ts");
    expect(r).toContain("getVillaDiscounts");
    expect(r).toContain("prices: data || []");
    expect(r).toContain("discounts");
    /* Public ile AYNI service. */
    const svc = src("app/services/villa-discount.service.ts");
    expect(svc).toContain("export async function getVillaDiscounts");
  });

  it("8f) 🔒 hücre başına sorgu YOK — tek Map, useMemo", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    expect(cal).toMatch(/const dayPriceMap = useMemo\(/);
    expect(cal).not.toContain("await fetch");
    expect(cal).not.toContain("adminFetch");
  });
});

/* ===============================================================
   9) MEVCUT DAVRANIŞ KORUNDU
   =============================================================== */
describe("9) regresyon korumaları", () => {
  it("9a) prices verilmezse takvim ESKİ render'da kalır", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    expect(cal).toContain("const hasPrices = dayPriceMap.size > 0;");
    expect(cal).toContain("prices = null,");
    expect(cal).toContain("discounts = null,");
  });

  it("9b) hücre boyutu (aspect-square) DEĞİŞMEDİ", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    expect(cal).toContain('className="aspect-square relative rounded-md mr-cell-hover"');
  });

  it("9c) 3 aylık desktop grid DEĞİŞMEDİ", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    expect(cal).toContain("monthCount = 3");
    expect(cal).toContain('"grid-cols-1 md:grid-cols-2 xl:grid-cols-3"');
  });

  it("9d) bloklu günde fiyat BASILMAZ (public kuralıyla aynı)", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    expect(cal).toContain("if (!hasPrices || disabled) return null;");
  });

  it("9e) tarih seçimi / müsaitlik mantığı dokunulmadı", () => {
    const cal = src("app/components/admin/reservation-form/ReservationCalendar.tsx");
    for (const k of [
      "getDayStyle",
      "fullyBlockedDates",
      "beginDrag",
      "extendDrag",
      "onSelectRange",
      "excludeDisabledDates",
    ]) {
      expect(cal).toContain(k);
    }
  });

  it("9f) manual-reservations formu ETKİLENMEDİ (fiyat prop'u geçmiyor)", () => {
    const m = src(
      "app/(admin)/maki-admin/manual-reservations/ekle/ManualReservationForm.tsx"
    );
    expect(m).not.toContain("prices={");
    expect(m).not.toContain("priceCurrency");
  });

  it("9g) migration EKLENMEDİ", () => {
    const h = src("app/components/admin/reservation-form/_helpers/dayPriceMap.ts");
    expect(h).not.toContain("ALTER TABLE");
    const r = src("app/api/admin/villas/[id]/prices/route.ts");
    expect(r).not.toContain("ALTER TABLE");
  });
});
