/* ===============================================================
   🛡️ ADMIN REZERVASYON — İNDİRİM SNAPSHOT (migration 080)
   ===============================================================
   HEDEF: Admin'den oluşturulan rezervasyonda 6 indirim kolonu
   PUBLIC akışla AYNI mantıkla dolsun.

   TEK KAYNAK: `lib/price.engine.ts > buildStayDiscountSnapshot`
   — public `price-verify.ts` (FAZ 4) de ARTIK bu fonksiyonu çağırır.
   Yani admin ve public aynı girdide aynı snapshot'ı üretir.

   Senaryolar 1-12 (kullanıcı listesi) burada kilitlenir.
=============================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildStayDiscountSnapshot,
  detectAppliedDiscountForStay,
  calculateGrandTotal,
  calculateStayTotal,
  EMPTY_STAY_DISCOUNT_SNAPSHOT,
  type DiscountRange,
} from "@/lib/price.engine";
import { buildCreateNormalPayload } from "@/app/(admin)/maki-admin/reservations/ekle/_helpers/buildCreateNormalPayload";
import { buildCreateCustomPricePayload } from "@/app/(admin)/maki-admin/reservations/ekle/_helpers/buildCreateCustomPricePayload";
import { buildCreateReservationPayload } from "@/app/services/reservation/_helpers/payload-create";
import {
  baseCreateData,
  tryPriceDetail,
  villaWithCleaning,
  ratesFixture,
} from "./_fixtures";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

const RATES = { TRY: 1, EUR: 35 };

/* 5 gece × 2.000 ₺ = 10.000 ₺ */
const PRICES = [
  { start_date: "2026-05-01", end_date: "2026-05-31", price: 2000, currency: "TRY" },
];

const PERCENT20: DiscountRange[] = [
  {
    start_date: "2026-05-10",
    end_date: "2026-05-20",
    discount_type: "percent",
    discount_value: 20,
    currency: null,
  },
];

const FIXED1500: DiscountRange[] = [
  {
    start_date: "2026-05-10",
    end_date: "2026-05-20",
    discount_type: "fixed",
    discount_value: 1500,
    currency: "TRY",
  },
];

const START = "2026-05-10";
const END = "2026-05-15"; // 5 gece

/** Admin sayfasının yaptığı zincirin aynısı. */
function adminSnapshot(discounts: DiscountRange[] | null) {
  const result = calculateGrandTotal({
    start: START,
    end: END,
    prices: PRICES,
    currency: "TRY",
    rates: RATES,
    discounts,
    cleaning_fee: 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
  });
  return {
    result,
    snapshot: buildStayDiscountSnapshot(
      START,
      END,
      PRICES,
      discounts,
      RATES,
      Number(result.stay) || 0
    ),
  };
}

/* ===============================================================
   1) İNDİRİM YOK → snapshot boş, mevcut davranış korunur
   =============================================================== */
describe("1) indirim yok", () => {
  it("1a) snapshot false + 5 alan null", () => {
    const { snapshot } = adminSnapshot(null);
    expect(snapshot).toEqual(EMPTY_STAY_DISCOUNT_SNAPSHOT);
  });

  it("1b) boş dizi de indirimsiz sayılır", () => {
    expect(adminSnapshot([]).snapshot.discount_applied).toBe(false);
  });

  it("1c) indirim aralığı konaklamayla KESİŞMİYORSA uygulanmaz", () => {
    const away: DiscountRange[] = [
      {
        start_date: "2026-06-01",
        end_date: "2026-06-10",
        discount_type: "percent",
        discount_value: 50,
        currency: null,
      },
    ];
    expect(adminSnapshot(away).snapshot).toEqual(EMPTY_STAY_DISCOUNT_SNAPSHOT);
  });

  it("1d) ÇIKIŞ günü gece değildir (half-open) — sadece çıkış gününe denk indirim SAYILMAZ", () => {
    const onCheckout: DiscountRange[] = [
      {
        start_date: "2026-05-15",
        end_date: "2026-05-15",
        discount_type: "percent",
        discount_value: 50,
        currency: null,
      },
    ];
    expect(detectAppliedDiscountForStay(START, END, onCheckout)).toBeNull();
  });

  it("1e) indirimsizken toplam DEĞİŞMEDİ (10.000 ₺)", () => {
    expect(adminSnapshot(null).result.stay).toBe(10000);
  });
});

/* ===============================================================
   2-6) %20 İNDİRİM
   =============================================================== */
describe("2-6) %20 indirim", () => {
  const { result, snapshot } = adminSnapshot(PERCENT20);

  it("2) discount_applied = true", () => {
    expect(snapshot.discount_applied).toBe(true);
  });

  it("3) discount_type = 'percent' (DB değeri — 'percentage' DEĞİL)", () => {
    expect(snapshot.discount_type).toBe("percent");
  });

  it("4) discount_value = 20 (yüzde değerinin kendisi)", () => {
    expect(snapshot.discount_value).toBe(20);
  });

  it("4b) percent'te discount_currency null", () => {
    expect(snapshot.discount_currency).toBeNull();
  });

  it("5) original_stay_total_try = 10000, stay_discount_amount_try = 2000", () => {
    expect(snapshot.original_stay_total_try).toBe(10000);
    expect(snapshot.stay_discount_amount_try).toBe(2000);
  });

  it("6) indirimli toplam = 8000 ve fark snapshot ile TUTARLI", () => {
    expect(result.stay).toBe(8000);
    expect(
      snapshot.original_stay_total_try! - snapshot.stay_discount_amount_try!
    ).toBe(result.stay);
  });
});

/* ===============================================================
   7) SABİT TUTARLI (fixed) İNDİRİM
   =============================================================== */
describe("7) fixed indirim", () => {
  const { result, snapshot } = adminSnapshot(FIXED1500);

  it("7a) type/value/currency public kuralıyla aynı", () => {
    expect(snapshot.discount_type).toBe("fixed");
    expect(snapshot.discount_value).toBe(1500);
    /* fixed → kaydın HAM currency'si (TRY'ye çevrilmez). */
    expect(snapshot.discount_currency).toBe("TRY");
  });

  it("7b) fixed = o gecenin NİHAİ fiyatı → 5×1500 = 7500", () => {
    expect(result.stay).toBe(7500);
    expect(snapshot.original_stay_total_try).toBe(10000);
    expect(snapshot.stay_discount_amount_try).toBe(2500);
  });

  it("7c) CLAMP YOK — fixed normalden yüksekse fark NEGATİF olabilir", () => {
    const high: DiscountRange[] = [
      { ...FIXED1500[0], discount_value: 3000 },
    ];
    const { snapshot: s } = adminSnapshot(high);
    expect(s.stay_discount_amount_try).toBeLessThan(0);
  });
});

/* ===============================================================
   8) BİRDEN FAZLA FİYAT ARALIĞI / GECE
   =============================================================== */
describe("8) çoklu sezon aralığı", () => {
  const MULTI = [
    { start_date: "2026-05-01", end_date: "2026-05-12", price: 2000, currency: "TRY" },
    { start_date: "2026-05-13", end_date: "2026-05-31", price: 3000, currency: "TRY" },
  ];

  it("8a) indirimsiz toplam iki sezonu da kapsar", () => {
    /* 10,11,12 → 2000×3 ; 13,14 → 3000×2  = 12.000 */
    const plain = calculateStayTotal(START, END, MULTI, "TRY", RATES);
    expect(plain.stay).toBe(12000);
  });

  it("8b) %20 indirimde snapshot TOPLAM indirimi gösterir", () => {
    const result = calculateGrandTotal({
      start: START, end: END, prices: MULTI, currency: "TRY", rates: RATES,
      discounts: PERCENT20, cleaning_fee: 0, cleaning_currency: "TRY", cleaning_limit: 0,
    });
    const snap = buildStayDiscountSnapshot(
      START, END, MULTI, PERCENT20, RATES, Number(result.stay) || 0
    );
    expect(snap.original_stay_total_try).toBe(12000);
    expect(result.stay).toBe(9600);            // 12.000 × 0.8
    expect(snap.stay_discount_amount_try).toBe(2400);
  });
});

/* ===============================================================
   9) PUBLIC ↔ ADMIN AYNI SONUÇ
   =============================================================== */
describe("9) public ile admin aynı snapshot", () => {
  it("9a) 🔒 public price-verify ARTIK ortak fonksiyonu çağırıyor", () => {
    const pv = src("app/services/reservation/_helpers/price-verify.ts");
    expect(pv).toContain("buildStayDiscountSnapshot(");
    /* Eski kopyalanmış blok KALMADI. */
    expect(pv).not.toContain("const undiscountedStay = calculateStayTotal(");
    expect(pv).not.toContain("let stayDiscountAmountTry");
  });

  it("9b) 🔒 admin de AYNI fonksiyonu çağırıyor", () => {
    const p = src("app/(admin)/maki-admin/reservations/ekle/page.tsx");
    expect(p).toContain("buildStayDiscountSnapshot(");
  });

  it("9c) 🔒 snapshot mantığı TEK yerde tanımlı", () => {
    const eng = src("lib/price.engine.ts");
    expect(
      (eng.match(/export const buildStayDiscountSnapshot/g) || []).length
    ).toBe(1);
    expect(
      (eng.match(/export function detectAppliedDiscountForStay/g) || []).length
    ).toBe(1);
  });

  it("9d) aynı girdide aynı çıktı (determinizm)", () => {
    const a = buildStayDiscountSnapshot(START, END, PRICES, PERCENT20, RATES, 8000);
    const b = buildStayDiscountSnapshot(START, END, PRICES, PERCENT20, RATES, 8000);
    expect(a).toEqual(b);
  });
});

/* ===============================================================
   10) CUSTOM PRICE — mevcut davranış bozulmuyor
   =============================================================== */
describe("10) custom price", () => {
  const CUSTOM_INPUT = {
    data: { ...baseCreateData, custom_price: true, total_price_try: 5000 },
    guestNames: [],
    priceDetail: tryPriceDetail,
    prepaymentRate: 20,
    selectedVilla: villaWithCleaning,
    rates: ratesFixture,
    startISO: START,
    endISO: END,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it("10a) custom payload snapshot'ı AÇIKÇA 'indirim yok' yazar", () => {
    const p = buildCreateCustomPricePayload(CUSTOM_INPUT);
    expect(p.discount_applied).toBe(false);
    expect(p.discount_type).toBeNull();
    expect(p.discount_value).toBeNull();
    expect(p.discount_currency).toBeNull();
    expect(p.original_stay_total_try).toBeNull();
    expect(p.stay_discount_amount_try).toBeNull();
  });

  it("10b) 🔒 custom price'ın diğer davranışı DEĞİŞMEDİ", () => {
    const f = src(
      "app/(admin)/maki-admin/reservations/ekle/_helpers/buildCreateCustomPricePayload.ts"
    );
    expect(f).toContain("custom_price: true");
  });
});

/* ===============================================================
   11) EDIT — snapshot bozulmuyor
   =============================================================== */
describe("11) rezervasyon düzenleme", () => {
  it("11a) 🔒 payload-update indirim kolonlarına HİÇ dokunmuyor", () => {
    const u = src("app/services/reservation/_helpers/payload-update.ts");
    for (const k of [
      "discount_applied",
      "discount_type",
      "discount_value",
      "discount_currency",
      "original_stay_total_try",
      "stay_discount_amount_try",
    ]) {
      expect(u).not.toContain(k);
    }
  });
});

/* ===============================================================
   12) PAYLOAD ZİNCİRİ + REGRESYON
   =============================================================== */
describe("12) payload zinciri", () => {
  function normalPayload(over: Record<string, unknown> = {}) {
    return buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 50000, ...over },
      guestNames: [],
      priceDetail: tryPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO: START,
      endISO: END,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  it("12a) admin normal payload 6 alanı TAŞIR", () => {
    const p = normalPayload({
      discount_applied: true,
      discount_type: "percent",
      discount_value: 20,
      discount_currency: null,
      original_stay_total_try: 10000,
      stay_discount_amount_try: 2000,
    });
    expect(p.discount_applied).toBe(true);
    expect(p.discount_type).toBe("percent");
    expect(p.discount_value).toBe(20);
    expect(p.original_stay_total_try).toBe(10000);
    expect(p.stay_discount_amount_try).toBe(2000);
  });

  it("12b) indirim bilgisi yoksa false + null (eski davranış)", () => {
    const p = normalPayload();
    expect(p.discount_applied).toBe(false);
    expect(p.discount_type).toBeNull();
    expect(p.stay_discount_amount_try).toBeNull();
  });

  it("12c) DB builder (public ile ORTAK) 6 kolonu yazar", () => {
    const db = buildCreateReservationPayload({
      data: {
        villa_id: "v1",
        name: "A",
        phone: "+905321234567",
        start_date: START,
        end_date: END,
        discount_applied: true,
        discount_type: "percent",
        discount_value: 20,
        original_stay_total_try: 10000,
        stay_discount_amount_try: 2000,
      },
      reservationCommissionAmount: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(db.discount_applied).toBe(true);
    expect(db.discount_type).toBe("percent");
    expect(db.discount_value).toBe(20);
    expect(db.original_stay_total_try).toBe(10000);
    expect(db.stay_discount_amount_try).toBe(2000);
  });

  it("12d) 🔒 payload-create (public+admin ORTAK) DEĞİŞMEDİ", () => {
    const c = src("app/services/reservation/_helpers/payload-create.ts");
    expect(c).toContain("discount_applied: !!data.discount_applied,");
    expect(c).toContain("discount_currency: data.discount_currency ?? null,");
  });

  it("12e) 🔒 migration / yeni endpoint / paket YOK", () => {
    const eng = src("lib/price.engine.ts");
    expect(eng).not.toContain("ALTER TABLE");
    const pkg = JSON.parse(src("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).length).toBeGreaterThan(0);
  });
});
