/* ===============================================================
   🛡️ /arama FİYAT KAPSAMI FİLTRESİ — REGRESYON KİLİDİ
   ===============================================================
   Tarihli aramada (start < end, ikisi de geçerli) seçilen aralığın
   TÜM konaklama gecelerinde fiyatı olmayan villa listelenmez. Ölçüt
   fiyat motorunun MEVCUT `calculateGrandTotal(...).priceAvailable`'ı.

   Kilitlenenler:
     1–7  kapsam senaryoları (tam, eksik gece, fiyat yok, 0/NULL,
          çıkış gecesi, bitişik sezon, EUR/USD)
     8–9  tarihsiz / tek tarihli / geçersiz aramada sonuç AYNI
     10   flexible=1..3 havuzu ve davranışı AYNI
     11   indirim verisi karta AYNEN gider; J vakası (indirim 0) görünür
     12   fiyat sıralaması AYNI (toplam fiyata göre)
     13   total + sayfalama filtrelenmiş ana listeyle tutarlı

   ⚠️ GERÇEK fiyat motoru çalışır; `calculateGrandTotal` yalnız çağrıları
   gözlemlemek için sarılır (matematik değişmez).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/* ---------------- fiyat motoru casusu ---------------- */
const grandTotalSpy = vi.fn();
vi.mock("@/lib/price.engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/price.engine")>();
  return {
    ...actual,
    calculateGrandTotal: (args: Parameters<typeof actual.calculateGrandTotal>[0]) => {
      grandTotalSpy(args);
      return actual.calculateGrandTotal(args);
    },
  };
});

/* ---------------- repository / service mock'ları ---------------- */
const findSearchResultsMock = vi.fn();
const blockedMock = vi.fn<(s: string, e: string, ids: string[]) => Promise<Set<string>>>();

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findSearchResults: (opts: unknown) => findSearchResultsMock(opts),
  },
}));
vi.mock("@/lib/db/villa-type.repository", () => ({
  villaTypeRepository: {
    findVillaTypeRelationsByTypeIds: async () => ({ data: [], error: null }),
  },
}));
vi.mock("@/lib/db/villa-feature.repository", () => ({
  villaFeatureRepository: {
    findAllForPublicTaxonomy: async () => ({ data: [], error: null }),
    findVillaFeatureRelationsByFeatureIds: async () => ({ data: [], error: null }),
  },
}));
vi.mock("@/lib/i18n/get-translation.server", () => ({
  getTranslationsForParents: async () => new Map(),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedVillaLocations: async () => [],
  getCachedVillaTypes: async () => [],
}));
vi.mock("@/lib/availability.helper", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/availability.helper")>();
  return {
    ...actual,
    getBlockedVillaIds: (s: string, e: string, ids: string[]) => blockedMock(s, e, ids),
  };
});
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: async () => ({ rates: { USD: 30, EUR: 35, GBP: 40 } }),
}));
vi.mock("@/app/services/villa-review.service", () => ({
  getVillaReviewStatsBatch: async () => ({}),
}));
vi.mock("@/lib/i18n/get-villa-type-translations.server", () => ({
  getVillaTypeNamesByLocale: async () => ({}),
}));
vi.mock("@/lib/i18n/get-villa-badge-translations.server", () => ({
  getVillaBadgesByLocale: async () => new Map<string, string>(),
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null) => u || "",
  appendAssetVersion: (u: string) => u,
}));

/* ---------------- next/* + UI mock'ları ---------------- */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/arama",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("next/image", () => ({
  /* eslint-disable-next-line @next/next/no-img-element */
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));
vi.mock("@/app/components/ui/PageHero", () => ({
  default: ({ title }: { title?: React.ReactNode }) => <h1 data-testid="hero">{title}</h1>,
}));

type CardProps = {
  id: string;
  isFlexible?: boolean;
  prices?: unknown[];
  stayDiscounts?: unknown[];
  stayStart?: string;
  stayEnd?: string;
};
const cardProps: CardProps[] = [];
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: (p: CardProps) => {
    cardProps.push(p);
    return (
      <div data-testid={p.isFlexible ? "flex-card" : "villa-card"}>{p.id}</div>
    );
  },
}));

/* ---------------- fixtures ----------------
   Aralık: 2026-11-05 → 2026-11-12 (7 gece: 05..11; 12 = çıkış). */
const START = "2026-11-05";
const END = "2026-11-12";

type PriceRow = { price: number | null; currency: string; start_date: string; end_date: string };
type DiscountRow = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency: string | null;
};

const row = (price: number | null, s: string, e: string, currency = "TRY"): PriceRow => ({
  price,
  currency,
  start_date: s,
  end_date: e,
});

function villa(id: string, prices: PriceRow[], discounts: DiscountRow[] = []) {
  return {
    id,
    slug: id,
    title: `Villa ${id}`,
    price: null,
    currency: "TRY",
    badge: null,
    bedrooms: 3,
    bathrooms: 2,
    guests: 6,
    cleaning_fee: 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
    is_active: true,
    deleted_at: null,
    location: { name: "Kalkan" },
    location_id: "loc-1",
    villa_images: [{ image_url: "/x.jpg", is_cover: true, sort_order: 0 }],
    villa_prices: prices,
    villa_discounts: discounts,
  };
}

const PCT20: DiscountRow = {
  start_date: "2026-11-01",
  end_date: "2026-11-30",
  discount_type: "percent",
  discount_value: 20,
  currency: null,
};
const FIXED0: DiscountRow = {
  start_date: "2026-11-01",
  end_date: "2026-11-30",
  discount_type: "fixed",
  discount_value: 0,
  currency: "TRY",
};

const SCENARIO = [
  villa("full", [row(5000, "2026-11-01", "2026-11-30")]),
  villa("partial", [row(5000, "2026-11-05", "2026-11-07")]),
  villa("none", []),
  villa("zero", [row(0, "2026-11-01", "2026-11-30")]),
  villa("nullp", [row(null, "2026-11-01", "2026-11-30")]),
  villa("adjacent", [row(3000, "2026-11-01", "2026-11-08"), row(4000, "2026-11-09", "2026-11-30")]),
  villa("checkout-gap", [row(5000, "2026-11-01", "2026-11-11")]),
  villa("first-gap", [row(5000, "2026-11-06", "2026-11-30")]),
  villa("mid-gap", [row(5000, "2026-11-01", "2026-11-07"), row(5000, "2026-11-09", "2026-11-30")]),
  villa("eur", [row(100, "2026-11-01", "2026-11-30", "EUR")]),
  villa("usd", [row(100, "2026-11-01", "2026-11-30", "USD")]),
  villa("pct-discount", [row(5000, "2026-11-01", "2026-11-30")], [PCT20]),
  villa("fixed0-discount", [row(5000, "2026-11-01", "2026-11-30")], [FIXED0]),
];
const ALL_IDS = SCENARIO.map((v) => v.id);
const PRICEABLE = [
  "full",
  "adjacent",
  "checkout-gap",
  "eur",
  "usd",
  "pct-discount",
  "fixed0-discount",
];
const UNPRICEABLE = ["partial", "none", "zero", "nullp", "first-gap", "mid-gap"];

type SP = Record<string, string | string[] | undefined>;

async function renderArama(sp: SP) {
  const { default: AramaPageBody } = await import("@/app/components/search/AramaPageBody");
  const element = await AramaPageBody({ locale: "tr", searchParams: Promise.resolve(sp) });
  return render(element);
}

const shownIds = () => screen.queryAllByTestId("villa-card").map((el) => el.textContent);
const flexIds = () => screen.queryAllByTestId("flex-card").map((el) => el.textContent);
const heroText = () => screen.getByTestId("hero").textContent || "";

beforeEach(() => {
  vi.clearAllMocks();
  cardProps.length = 0;
  findSearchResultsMock.mockResolvedValue({ data: SCENARIO, error: null });
  blockedMock.mockResolvedValue(new Set<string>());
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

/* ===============================================================
   1–7) KAPSAM SENARYOLARI
   =============================================================== */
describe("tarihli arama — fiyat kapsamı", () => {
  it("1–7) yalnız tüm geceleri fiyatlı villalar listelenir", async () => {
    await renderArama({ start: START, end: END, guests: "2", pageSize: "100" });
    const ids = shownIds();
    expect([...ids].sort()).toEqual([...PRICEABLE].sort());
    for (const id of UNPRICEABLE) expect(ids, id).not.toContain(id);
    expect(heroText()).toContain(String(PRICEABLE.length));
  });

  it("1) tüm gecelerde fiyat var → görünür", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).toContain("full");
  });

  it("2) herhangi bir gece (ilk/ara/son) fiyatsız → görünmez", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).not.toContain("partial");
    expect(shownIds()).not.toContain("first-gap");
    expect(shownIds()).not.toContain("mid-gap");
  });

  it("3) hiç fiyatı olmayan villa → görünmez", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).not.toContain("none");
  });

  it("4) 0 / NULL fiyat → görünmez", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).not.toContain("zero");
    expect(shownIds()).not.toContain("nullp");
  });

  it("5) çıkış gecesi fiyat gerektirmez (motor davranışı) → görünür", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).toContain("checkout-gap");
  });

  it("6) bitişik sezon fiyatları → görünür", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).toContain("adjacent");
  });

  it("7) EUR/USD fiyatlar → görünür; kart fiyat verisini AYNEN alır", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).toContain("eur");
    expect(shownIds()).toContain("usd");
    const eur = cardProps.find((p) => p.id === "eur")!;
    expect(eur.prices).toEqual([row(100, "2026-11-01", "2026-11-30", "EUR")]);
  });

  it("filtre, müsaitlik bloğuyla birlikte çalışır (bloklu fiyatlı villa yine gizli)", async () => {
    blockedMock.mockResolvedValue(new Set(["full"]));
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).not.toContain("full");
    expect(shownIds()).toContain("adjacent");
    /* Müsaitlik RPC'sine giden aday listesi DEĞİŞMEDİ (tüm villalar). */
    expect(blockedMock.mock.calls[0]).toEqual([START, END, ALL_IDS]);
  });
});

/* ===============================================================
   8–9) TARİHSİZ / EKSİK / GEÇERSİZ TARİH → SONUÇ AYNI
   =============================================================== */
describe("tarih aralığı yoksa davranış değişmez", () => {
  const cases: Array<[string, SP]> = [
    ["tarihsiz", {}],
    ["yalnız misafir", { guests: "2" }],
    ["yalnız start", { start: START }],
    ["yalnız end", { end: END }],
    ["geçersiz format", { start: "05-11-2026", end: "12-11-2026" }],
    ["aynı gün", { start: START, end: START }],
    ["ters sıra", { start: END, end: START }],
  ];

  for (const [name, sp] of cases) {
    it(`8–9) ${name} → tüm villalar, fiyat kontrolü/müsaitlik çağrısı yok`, async () => {
      await renderArama({ ...sp, pageSize: "100" });
      expect(shownIds()).toEqual(ALL_IDS);
      expect(grandTotalSpy).not.toHaveBeenCalled();
      expect(blockedMock).not.toHaveBeenCalled();
      /* Kart tarihli fiyat verisi almaz (eski "gecelik" davranış). */
      expect(cardProps.every((p) => p.prices === undefined)).toBe(true);
    });
  }
});

/* ===============================================================
   10) ESNEK ARAMA — havuz ve davranış AYNI
   =============================================================== */
describe("flexible=1..3 davranışı değişmez", () => {
  for (const flexible of ["1", "2", "3"]) {
    it(`10) flexible=${flexible}: havuz = ana tarihte bloklu villalar (fiyattan bağımsız)`, async () => {
      /* Ana pencerede fiyatlı + fiyatsız birer villa bloklu; kaydırılmış
         pencerelerde hiçbiri bloklu değil. */
      blockedMock.mockImplementation(async (s: string) =>
        s === START ? new Set(["full", "none"]) : new Set<string>()
      );
      await renderArama({ start: START, end: END, flexible, pageSize: "100" });

      /* Esnek bölüm: fiyatsız villa da ESKİSİ gibi yer alır. */
      expect(flexIds().sort()).toEqual(["full", "none"]);
      /* Kaydırılmış pencerelere giden aday listesi AYNI (bloklu havuz). */
      const shifted = blockedMock.mock.calls.filter((c) => c[0] !== START);
      expect(shifted.length).toBe(Number(flexible) * 2);
      for (const c of shifted) expect(c[2]).toEqual(["full", "none"]);
      /* Esnek kartlara fiyat verisi verilmez (eski davranış). */
      const flexCards = cardProps.filter((p) => p.isFlexible);
      expect(flexCards.every((p) => p.prices === undefined)).toBe(true);
      /* Ana liste yine fiyat kapsamıyla süzülü. */
      expect(shownIds()).not.toContain("none");
      expect(shownIds()).not.toContain("partial");
    });
  }
});

/* ===============================================================
   11) İNDİRİM — veri ve hesap AYNI
   =============================================================== */
describe("indirim davranışı değişmez", () => {
  it("11) indirimli villa görünür; karta giden indirim verisi AYNI", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    const p = cardProps.find((c) => c.id === "pct-discount")!;
    expect(p.stayDiscounts).toEqual([PCT20]);
  });

  it("11) toplamı 0'a düşüren indirim (J vakası) filtrelenmez — motor fiyatı 'var' sayar", async () => {
    await renderArama({ start: START, end: END, pageSize: "100" });
    expect(shownIds()).toContain("fixed0-discount");
  });

  it("11) filtre motoru indirimle çağırır, indirim toplamı değiştirmez", async () => {
    const { calculateGrandTotal } = await import("@/lib/price.engine");
    const base = { start: START, end: END, prices: [row(5000, "2026-11-01", "2026-11-30")] as never, currency: "TRY", rates: { TRY: 1 } };
    expect(calculateGrandTotal({ ...base }).total).toBe(35000);
    expect(calculateGrandTotal({ ...base, discounts: [PCT20] }).total).toBe(28000);
  });
});

/* ===============================================================
   12) FİYAT SIRALAMASI — AYNI
   =============================================================== */
describe("fiyat sıralaması değişmez", () => {
  const SORT_SET = [
    villa("a3000", [row(3000, "2026-11-01", "2026-11-30")]),
    villa("gap", [row(500, "2026-11-06", "2026-11-30")]),
    villa("b1000", [row(1000, "2026-11-01", "2026-11-30")]),
    villa("c2000", [row(2000, "2026-11-01", "2026-11-30")]),
    villa("d-disc", [row(4000, "2026-11-01", "2026-11-30")], [{ ...PCT20, discount_value: 90 }]),
  ];

  it("12) price-asc: toplam fiyata göre artan (indirim dahil), fiyatsız yok", async () => {
    findSearchResultsMock.mockResolvedValue({ data: SORT_SET, error: null });
    await renderArama({ start: START, end: END, sort: "price-asc" });
    /* d-disc: 4000 × %10 = 400/gece → en ucuz. */
    expect(shownIds()).toEqual(["d-disc", "b1000", "c2000", "a3000"]);
  });

  it("12) price-desc: azalan", async () => {
    findSearchResultsMock.mockResolvedValue({ data: SORT_SET, error: null });
    await renderArama({ start: START, end: END, sort: "price-desc" });
    expect(shownIds()).toEqual(["a3000", "c2000", "b1000", "d-disc"]);
  });

  it("12) smart: DB sırası korunur (yalnız fiyatsız çıkar)", async () => {
    findSearchResultsMock.mockResolvedValue({ data: SORT_SET, error: null });
    await renderArama({ start: START, end: END });
    expect(shownIds()).toEqual(["a3000", "b1000", "c2000", "d-disc"]);
  });
});

/* ===============================================================
   13) TOTAL + SAYFALAMA — filtrelenmiş ana listeyle tutarlı
   =============================================================== */
describe("total ve sayfalama", () => {
  const priced = Array.from({ length: 15 }, (_, i) =>
    villa(`p${String(i + 1).padStart(2, "0")}`, [row(1000, "2026-11-01", "2026-11-30")])
  );
  const unpriced = Array.from({ length: 5 }, (_, i) => villa(`u${i + 1}`, []));
  /* Fiyatsızlar araya karışık dizilir → filtre sayfalamadan ÖNCE çalışmalı. */
  const MIXED = [...priced.slice(0, 5), ...unpriced, ...priced.slice(5)];

  it("13) sayfa 1: 12 kart, total = 15, fiyatsız yok", async () => {
    findSearchResultsMock.mockResolvedValue({ data: MIXED, error: null });
    await renderArama({ start: START, end: END });
    expect(shownIds()).toEqual(priced.slice(0, 12).map((v) => v.id));
    expect(heroText()).toMatch(/^15\b/);
  });

  it("13) sayfa 2: kalan 3 fiyatlı villa", async () => {
    findSearchResultsMock.mockResolvedValue({ data: MIXED, error: null });
    await renderArama({ start: START, end: END, page: "2" });
    expect(shownIds()).toEqual(priced.slice(12).map((v) => v.id));
  });

  it("13) aralık dışı sayfa → son sayfaya sabitlenir (mevcut clamp)", async () => {
    findSearchResultsMock.mockResolvedValue({ data: MIXED, error: null });
    await renderArama({ start: START, end: END, page: "9" });
    expect(shownIds()).toEqual(priced.slice(12).map((v) => v.id));
  });

  it("13) tarihsiz: total = 20 (fiyatsızlar dahil, eski davranış)", async () => {
    findSearchResultsMock.mockResolvedValue({ data: MIXED, error: null });
    await renderArama({});
    expect(heroText()).toMatch(/^20\b/);
    expect(shownIds()).toEqual(MIXED.slice(0, 12).map((v) => v.id));
  });
});
