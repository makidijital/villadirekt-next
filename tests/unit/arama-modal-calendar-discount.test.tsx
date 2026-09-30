/* ===============================================================
   🛡️ /arama MÜSAİTLİK MODALI — GÜNLÜK İNDİRİMLİ FİYAT
   ===============================================================
   Modal, engine girdilerini `/api/public/villas/[id]/availability`
   route'undan alır. Bu turda route'a MEVCUT public servis
   (`getVillaDiscounts`) üzerinden `discounts` alanı EKLENDİ →
   modal takvimi villa detay takvimiyle AYNI indirimli günlük fiyat
   görünümünü kullanır (üstü çizili normal + indirimli).

   Değerler price.engine'in ZATEN export ettiği fonksiyonlardan gelir
   (`getActiveDiscount` → `applyDiscountToDailyPrice`); bu dosya yeni
   indirim formülü İÇERMEZ ve kaynak kilidiyle bunu doğrular.

   Harness: `VillaCardBookingModal.pool-heating.test.tsx` deseni
   (fetch stub + settings mock, gerçek network YOK).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import VillaCardBookingModal from "@/app/components/villa/VillaCardBookingModal";
import type { DiscountRange } from "@/lib/price.engine";

const NIGHTLY = 10000;

/* Görünüm testleri takvimin AÇILDIĞI ay üzerinden yapılır (navigasyon
   gerekmez; fiyat gösterimi geçmiş günlerde de aynıdır). */
const NOW = new Date();
const Y = NOW.getFullYear();
const M = String(NOW.getMonth() + 1).padStart(2, "0");
/* Tarih hidrasyonu testi için gelecek ay (seçilebilir aralık). */
const FUTURE = new Date(NOW.getFullYear(), NOW.getMonth() + 2, 1);
const FY = FUTURE.getFullYear();
const FM = String(FUTURE.getMonth() + 1).padStart(2, "0");

/** Ayın 8–12'si %20 indirimli; kalan günler indirimsiz. */
const PARTIAL_DISCOUNT: DiscountRange[] = [
  {
    start_date: `${Y}-${M}-08`,
    end_date: `${Y}-${M}-12`,
    discount_type: "percent",
    discount_value: 20,
    currency: null,
  },
];

/** %0 → indirimli = normal (sahte indirim senaryosu). */
const ZERO_DISCOUNT: DiscountRange[] = [
  {
    start_date: `${Y}-${M}-01`,
    end_date: `${Y}-${M}-28`,
    discount_type: "percent",
    discount_value: 0,
    currency: null,
  },
];

function availabilityResponse(discounts?: DiscountRange[]) {
  return {
    config: {
      deposit: 0,
      cleaning_fee: 0,
      cleaning_currency: "TRY",
      cleaning_limit: 0,
      custom_prepayment_rate: 20,
      minimum_stay_nights: null,
      pool_heating_fee: null,
      pool_heating_currency: "TRY",
      pool_heating_months: null,
    },
    prices: [
      {
        price: NIGHTLY,
        currency: "TRY",
        start_date: "2020-01-01",
        end_date: "2035-12-31",
      },
    ],
    externalBlocks: { checkin: [], checkout: [], middle: [] },
    ...(discounts ? { discounts } : {}),
  };
}

function mockFetch(discounts?: DiscountRange[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/availability")) {
        return { ok: true, json: async () => availabilityResponse(discounts) };
      }
      if (url.includes("/blocked-ranges")) {
        return { ok: true, json: async () => ({ ok: true, ranges: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch
  );
}

async function openModal(discounts?: DiscountRange[]) {
  mockFetch(discounts);
  const r = render(
    <VillaCardBookingModal
      isOpen={true}
      onClose={vi.fn()}
      villaId="v1"
      villaSlug="test-villa"
      villaTitle="Test Villa"
    />
  );
  /* ⚠️ UI turu: "Tarih seç" bloğu kaldırıldı → sync-point takvimin
     kendisidir. Test amacı/assertion'ları DEĞİŞMEDİ. */
  await screen.findAllByRole("gridcell");
  await waitFor(() => expect(dayCellText(r.container, 9)).not.toBe(""));
  return r;
}

function dayCellText(container: HTMLElement, day: number): string {
  const cells = Array.from(container.querySelectorAll('[role="gridcell"]'));
  const pattern = new RegExp(`^${day}(₺|$)`);
  return cells.find((el) => pattern.test(el.textContent || ""))?.textContent || "";
}

function struckTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("*"))
    .filter(
      (el) => (el as HTMLElement).style?.textDecoration === "line-through"
    )
    .map((el) => el.textContent || "");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/arama modal takvimi — indirimli günlük fiyat", () => {
  it("1) API `discounts` DÖNMEZSE mevcut tek-fiyat görünümü (eski davranış)", async () => {
    const { container } = await openModal();
    expect(dayCellText(container, 9)).toBe("9₺10.000");
    expect(struckTexts(container)).toHaveLength(0);
  });

  it("2) %20 indirimli günde üstü çizili ₺10.000 + ₺8.000", async () => {
    const { container } = await openModal(PARTIAL_DISCOUNT);
    const text = dayCellText(container, 9);
    expect(text).toContain("₺10.000");
    expect(text).toContain("₺8.000");
    expect(struckTexts(container).join(" ")).toContain("₺10.000");
  });

  it("3) indirimsiz günler TEK fiyat olarak kalır (gün bazlı doğruluk)", async () => {
    const { container } = await openModal(PARTIAL_DISCOUNT);
    expect(dayCellText(container, 8)).toContain("₺8.000");
    expect(dayCellText(container, 12)).toContain("₺8.000");
    expect(dayCellText(container, 13)).toBe("13₺10.000");
  });

  it("4) sahte indirim (fiyat eşit) → üstü çizili YOK", async () => {
    const { container } = await openModal(ZERO_DISCOUNT);
    expect(dayCellText(container, 9)).toBe("9₺10.000");
    expect(struckTexts(container)).toHaveLength(0);
  });

  it("5) 🔒 URL'den gelen tarihler HÂLÂ seçili açılır (önceki geliştirme)", async () => {
    mockFetch(PARTIAL_DISCOUNT);
    const start = `${FY}-${FM}-08`;
    const end = `${FY}-${FM}-11`;
    render(
      <VillaCardBookingModal
        isOpen={true}
        onClose={vi.fn()}
        villaId="v1"
        villaSlug="test-villa"
        villaTitle="Test Villa"
        initialStart={start}
        initialEnd={end}
      />
    );
    /* 08 → 11 = 3 gece → URL'den gelen aralık hidrate olmuş demektir
       (tarih etiketi bloğu UI turunda kaldırıldı; doğrulama özet
       üzerinden yapılır). */
    expect(
      await screen.findByText("Konaklama Tutarı (3 Gece)")
    ).toBeInTheDocument();
  });
});

describe("kaynak kilidi — veri akışı ve motor", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("6) availability route MEVCUT `getVillaDiscounts` servisini kullanır", () => {
    const route = codeOnly(
      read("app/api/public/villas/[id]/availability/route.ts")
    );
    expect(route).toMatch(/getVillaDiscounts\(id\)/);
    /* Mevcut response alanları KORUNDU. */
    expect(route).toMatch(/config,/);
    expect(route).toMatch(/prices: safePrices,/);
    expect(route).toMatch(/externalBlocks:/);
    /* Yeni repository/sorgu türemedi. */
    expect(route).not.toMatch(/villaDiscountRepository/);
    expect(route).not.toMatch(/from\("villa_discounts"\)/);
  });

  it("7) modal, engine'in MEVCUT `discounts` parametresini kullanır", () => {
    const modal = codeOnly(
      read("app/components/villa/VillaCardBookingModal.tsx")
    );
    expect(modal).toMatch(/discounts: apiData\.discounts \?\? \[\]/);
    /* Modalde fiyat motoru çağrısı YOK (hesap engine'de). */
    expect(modal).not.toMatch(/calculateGrandTotal\(/);
    expect(modal).not.toMatch(/applyDiscountToDailyPrice\(/);
  });

  it("8) price.engine.ts'e DOKUNULMADI", () => {
    const engine = read("lib/price.engine.ts");
    expect(engine).toMatch(/discounts = null,/);
    expect(engine).toMatch(/export const applyDiscountToDailyPrice/);
    expect(engine).toMatch(/export const getActiveDiscount/);
  });

  it("9) admin fiyat takvimi indirim gösterimi MEVCUT haliyle duruyor", () => {
    /* PricingCalendarCanvas / DiscountCalendarCanvas ortak hücresi —
       bu turda DOKUNULMADI, yalnız varlığı kilitlenir. */
    const dayCell = read(
      "app/components/admin/villa/pricing-calendar/_components/DayCell.tsx"
    );
    expect(dayCell).toMatch(/textDecoration: "line-through"/);
    expect(dayCell).toMatch(/discountedPrice/);
  });
});

/* ===============================================================
   D) MODAL FİYAT ÖZETİ — villa detay ile BİREBİR
   ===============================================================
   Referans: `booking/BookingSummary.tsx` (villa detay BookingSidebar'ın
   kullandığı AYNI component). Modal artık engine'in ZATEN ürettiği
   `activeStayDiscount`'ı aynı component'e geçirir → "Konaklama Tutarı
   (3 Gece)" + üstü çizili indirimsiz tutar + indirimli tutar +
   "İndirimli Tutar" etiketi. Yeni hesap/markup YOK.
=============================================================== */
describe("D) modal fiyat özeti — indirimli tutar", () => {
  /* 08 → 11 = 3 gece; gelecek ay (seçilebilir). */
  const START = `${FY}-${FM}-08`;
  const END = `${FY}-${FM}-11`;
  const FULL_DISCOUNT: DiscountRange[] = [
    {
      start_date: `${FY}-${FM}-01`,
      end_date: `${FY}-${FM}-28`,
      discount_type: "percent",
      discount_value: 20,
      currency: null,
    },
  ];

  async function openWithDates(
    discounts?: DiscountRange[],
    cleaningFee = 0
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/availability")) {
          const base = availabilityResponse(discounts);
          return {
            ok: true,
            json: async () => ({
              ...base,
              config: { ...base.config, cleaning_fee: cleaningFee },
            }),
          };
        }
        if (url.includes("/blocked-ranges")) {
          return { ok: true, json: async () => ({ ok: true, ranges: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch
    );
    const r = render(
      <VillaCardBookingModal
        isOpen={true}
        onClose={vi.fn()}
        villaId="v1"
        villaSlug="test-villa"
        villaTitle="Test Villa"
        initialStart={START}
        initialEnd={END}
      />
    );
    await screen.findByText("Toplam Tutar");
    return r;
  }

  function struck(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll(".line-through")).map(
      (el) => el.textContent || ""
    );
  }

  it("10) 3 gece + indirim → başlık 'Konaklama Tutarı (3 Gece)'", async () => {
    await openWithDates(FULL_DISCOUNT);
    expect(screen.getByText("Konaklama Tutarı (3 Gece)")).toBeInTheDocument();
  });

  it("11) indirimsiz konaklama toplamı ÜSTÜ ÇİZİLİ (₺30.000)", async () => {
    const { container } = await openWithDates(FULL_DISCOUNT);
    expect(struck(container).join(" ")).toMatch(/30\.000/);
  });

  it("12) indirimli toplam NORMAL + 'İndirimli Tutar' etiketi", async () => {
    const { container } = await openWithDates(FULL_DISCOUNT);
    expect(screen.getAllByText(/24\.000/).length).toBeGreaterThan(0);
    expect(struck(container).join(" ")).not.toMatch(/24\.000/);
    expect(screen.getByText("İndirimli Tutar")).toBeInTheDocument();
  });

  it("13) 🔒 indirim YOKKEN 'İndirimli Tutar' ve üstü çizili YOK", async () => {
    const { container } = await openWithDates();
    expect(screen.queryByText("İndirimli Tutar")).not.toBeInTheDocument();
    expect(struck(container)).toHaveLength(0);
    expect(screen.getByText("Konaklama Tutarı (3 Gece)")).toBeInTheDocument();
  });

  it("14) temizlik ücreti KORUNUR ve toplam doğru kalır", async () => {
    /* 3 × 10.000 = 30.000 → %20 → 24.000 + temizlik 3.500 = 27.500 */
    await openWithDates(FULL_DISCOUNT, 3500);
    expect(screen.getAllByText(/3\.500/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/27\.500/).length).toBeGreaterThan(0);
  });

  it("15) indirimsizde toplam = 30.000 + temizlik (mevcut davranış)", async () => {
    await openWithDates(undefined, 3500);
    expect(screen.getAllByText(/33\.500/).length).toBeGreaterThan(0);
  });

  it("16) 🔒 tarihsiz modalda özet HİÇ render edilmez (eski davranış)", async () => {
    mockFetch(FULL_DISCOUNT);
    render(
      <VillaCardBookingModal
        isOpen={true}
        onClose={vi.fn()}
        villaId="v1"
        villaSlug="test-villa"
        villaTitle="Test Villa"
      />
    );
    await screen.findAllByRole("gridcell");
    expect(screen.queryByText("Toplam Tutar")).not.toBeInTheDocument();
    expect(screen.queryByText("İndirimli Tutar")).not.toBeInTheDocument();
  });

  it("17) 🔒 paylaşılan BookingSummary kullanılır — duplicate özet YOK", () => {
    const modal = readFileSync(
      join(process.cwd(), "app/components/villa/VillaCardBookingModal.tsx"),
      "utf-8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(modal).toMatch(/<BookingSummary/);
    expect(modal).toMatch(/activeStayDiscount=\{activeStayDiscount\}/);
    /* Modal kendi indirim hesabını YAPMAZ. */
    expect(modal).not.toMatch(/applyDiscountToDailyPrice\(/);
    expect(modal).not.toMatch(/calculateStayTotal\(/);
    expect(modal).not.toMatch(/discountedTotal/);
  });
});

/* ===============================================================
   E) MODAL TAKVİM DİLİ — modalın locale'i ile eşleşir
   ===============================================================
   Regresyon: modal, `BookingCalendar`'a `locale` GEÇMİYORDU → takvim
   EN/DE modallarda da Türkçe render ediliyordu. Aşağıdaki test UÇTAN
   UCA (modal → takvim) dil paritesini kilitler.
=============================================================== */
describe("E) modal takvim dili", () => {
  function renderModalWithLocale(locale?: "tr" | "en" | "de") {
    mockFetch();
    return render(
      <VillaCardBookingModal
        isOpen={true}
        onClose={vi.fn()}
        villaId="v1"
        villaSlug="test-villa"
        villaTitle="Test Villa"
        locale={locale}
      />
    );
  }

  async function calendarTexts(container: HTMLElement) {
    await screen.findAllByRole("gridcell");
    return {
      caption: container.querySelector(".rdp-caption")?.textContent || "",
      weekdays: Array.from(container.querySelectorAll(".rdp-head_cell"))
        .map((el) => (el.textContent || "").trim())
        .join(" "),
    };
  }

  it("18) EN modal → İngilizce ay adı + hafta günleri", async () => {
    const { container } = renderModalWithLocale("en");
    const { caption, weekdays } = await calendarTexts(container);
    expect(caption).toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
    expect(weekdays).not.toMatch(/Ça|Ct|Pz/);
  });

  it("19) DE modal → Almanca ay adı + hafta günleri", async () => {
    const { container } = renderModalWithLocale("de");
    const { caption, weekdays } = await calendarTexts(container);
    expect(caption).toMatch(/Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember/);
    expect(weekdays).toMatch(/Mo|Di|Mi/);
    expect(weekdays).not.toMatch(/Ça|Ct|Pz/);
  });

  it("20) locale verilmezse MEVCUT güvenli default (TR) korunur", async () => {
    const { container } = renderModalWithLocale();
    const { weekdays } = await calendarTexts(container);
    expect(weekdays).toMatch(/Ça|Ct|Pz/);
  });
});
