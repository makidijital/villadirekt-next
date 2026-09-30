/* ===============================================================
   🛡️ /arama VillaCard — FİYAT GÖSTERİM KONUMU (UI-only regresyon)
   ===============================================================
   DEĞİŞİKLİK: tarih seçiliyken hesaplanan konaklama TOPLAMI artık
   yalnız CONTENT AREA'daki fiyat alanında ("başlayan fiyatlarla" /
   "Fiyat sorunuz" alanı) gösterilir; müsaitlik CTA'sının yanındaki
   ikinci gösterim KALDIRILDI.

   ⚠️ Bu test SADECE KONUMU kilitler. Fiyatın NASIL hesaplandığı
   (price.engine / indirim / kur / temizlik) DEĞİŞMEDİ ve burada
   gerçek motor çalışır — mock'lanan tek şey kart çevresidir.
=============================================================== */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import type { DiscountRange } from "@/lib/price.engine";

/* ---------------- VillaCard çevre mock'ları (kart testinin deseni) -------- */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/arama",
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("next/image", () => ({
  /* eslint-disable-next-line @next/next/no-img-element */
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: { TRY: 1 } }),
}));

import VillaCard from "@/app/components/villa/VillaCard";

/* ---------------- fixtures — 08.10 → 11.10 = 3 GECE ---------------- */
const START = "2026-10-08";
const END = "2026-10-11";
const NIGHTLY = 10000;
const PRICES = [
  {
    price: NIGHTLY,
    currency: "TRY",
    start_date: "2026-10-01",
    end_date: "2026-10-31",
  },
];
const DISCOUNTS: DiscountRange[] = [
  {
    start_date: "2026-10-01",
    end_date: "2026-10-31",
    discount_type: "percent",
    discount_value: 20,
    currency: null,
  },
];

function renderCard(opts: {
  withDates?: boolean;
  discounts?: DiscountRange[];
  prices?: typeof PRICES;
  price?: number | null;
  cleaningFee?: number;
  locale?: "tr" | "en" | "de";
} = {}) {
  const withDates = opts.withDates ?? true;
  return render(
    <VillaCard
      id="v-1"
      slug="test-villa"
      title="Test Villa"
      location="Kalkan"
      price={opts.price === undefined ? NIGHTLY : (opts.price as number)}
      currency="TRY"
      stayStart={withDates ? START : undefined}
      stayEnd={withDates ? END : undefined}
      prices={opts.prices === undefined ? PRICES : opts.prices}
      stayDiscounts={opts.discounts}
      cleaningFee={opts.cleaningFee ?? 0}
      cleaningCurrency="TRY"
      cleaningLimit={0}
      locale={opts.locale}
    />
  );
}

/** Müsaitlik CTA butonunu içeren satırın metni. */
function availabilityRowText(): string {
  const btn = screen.getByLabelText(tr.card.availabilityAriaLabel);
  return btn.parentElement?.textContent || "";
}

/** Fiyat SATIRI = turuncu tutarı (font-display span) içeren `<p>`. */
function priceLine(container: HTMLElement): HTMLElement | null {
  const span = Array.from(
    container.querySelectorAll("span.font-display")
  ).find((el) => /\d/.test(el.textContent || ""));
  return (span?.closest("p") as HTMLElement | null) ?? null;
}

function priceAreaText(container: HTMLElement): string {
  return priceLine(container)?.textContent || "";
}

/** Fiyat BLOĞU = tarih satırı + fiyat satırı + indirim satırı. */
function priceBlockText(container: HTMLElement): string {
  return priceLine(container)?.parentElement?.textContent || "";
}

describe("A) tarih seçili — toplam YALNIZ fiyat alanında", () => {
  it("1) 3 gecelik toplam (30.000) fiyat alanında gösterilir", () => {
    const { container } = renderCard();
    expect(priceAreaText(container)).toMatch(/30\.000/);
  });

  it("2) 🔒 'N gece' metni ARTIK gösterilmiyor (tarih üst satıra taşındı)", () => {
    /* ⚠️ GÜNCELLEME: gece sayısı yerine seçilen tarih aralığı gösteriliyor.
       Assertion gevşetilmedi — tam tersi, "gece" metninin YOKLUĞU ve
       tarih satırının VARLIĞI kilitlendi (bkz. G bloğu). */
    const { container } = renderCard();
    expect(priceBlockText(container)).not.toContain("gece");
  });

  it("3) 🔒 müsaitlik CTA'sının yanında ARTIK fiyat YOK", () => {
    renderCard();
    const row = availabilityRowText();
    expect(row).not.toMatch(/30\.000/);
    expect(row).not.toMatch(/gece/);
  });

  it("4) toplam kartta TEK KEZ görünür (çift gösterim yok)", () => {
    expect(renderCard().container.textContent?.match(/30\.000/g) || []).toHaveLength(1);
  });
});

describe("B) tarih yok — mevcut davranış BİREBİR", () => {
  it("5) 'başlayan fiyatlarla' + gecelik fiyat aynen", () => {
    const { container } = renderCard({ withDates: false });
    const text = priceAreaText(container);
    expect(text).toMatch(/10\.000/);
    expect(text).toContain(tr.card.startingFromLower);
  });

  it("6) fiyat yoksa 'Fiyat sorunuz' aynen", () => {
    const { container } = renderCard({ withDates: false, price: 0 });
    expect(container.textContent).toContain(tr.card.priceOnRequest);
  });
});

describe("C/D) indirim ve hesaplanamayan fiyat", () => {
  it("7) indirimli villa — motorun İNDİRİMLİ toplamı (24.000) fiyat alanında", () => {
    /* 3 × 10.000 = 30.000 → %20 indirim → 24.000. Motor DEĞİŞMEDİ.
       ⚠️ GÜNCELLEME: indirimsiz 30.000 artık kartta ÜSTÜ ÇİZİLİ olarak
       gösteriliyor (bu turun istenen davranışı). Assertion gevşetilmedi:
       indirimli tutarın ÜSTÜ ÇİZİLİ OLMADIĞI ek olarak kilitlendi;
       30.000'in üstü çizili gösterimi F bloğunda ayrıca doğrulanıyor. */
    const { container } = renderCard({ discounts: DISCOUNTS });
    expect(priceAreaText(container)).toMatch(/24\.000/);
    const struck = Array.from(container.querySelectorAll(".line-through"))
      .map((el) => el.textContent || "")
      .join(" ");
    expect(struck).not.toMatch(/24\.000/);
  });

  it("8) fiyat kaydı yoksa (prices: []) mevcut fallback korunur", () => {
    /* stayTotal hesaplanamaz → kart eski "başlayan fiyatlarla"
       davranışına düşer; YENİ bir fallback ÜRETİLMEDİ. */
    const { container } = renderCard({ prices: [] });
    const text = priceAreaText(container);
    expect(text).toContain(tr.card.startingFromLower);
    expect(availabilityRowText()).not.toMatch(/\d/);
  });

  it("9) fiyat kaydı yok + price yok → 'Fiyat sorunuz'", () => {
    const { container } = renderCard({ prices: [], price: 0 });
    expect(container.textContent).toContain(tr.card.priceOnRequest);
  });
});

/* ===============================================================
   F) İNDİRİMLİ GÖSTERİM — üstü çizili indirimsiz + indirimli toplam
   ===============================================================
   Değerler motorun ÇIKTISIDIR: indirimli = mevcut calculateGrandTotal,
   indirimsiz = motorun ZATEN export ettiği calculateStayTotal(…, null)
   (villa detaydaki useBookingEngine deseni). Yeni formül YOK.
=============================================================== */
describe("F) indirimli toplam gösterimi", () => {
  /** Üstü çizili (line-through) metinler. */
  function struckTexts(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll(".line-through")).map(
      (el) => el.textContent || ""
    );
  }

  it("13) indirim varsa indirimsiz toplam ÜSTÜ ÇİZİLİ gösterilir", () => {
    /* 3 × 10.000 = 30.000 → %20 → 24.000 */
    const { container } = renderCard({ discounts: DISCOUNTS });
    expect(struckTexts(container).join(" ")).toMatch(/30\.000/);
  });

  it("14) indirimli toplam NORMAL (üstü çizili DEĞİL) gösterilir", () => {
    const { container } = renderCard({ discounts: DISCOUNTS });
    const text = priceAreaText(container);
    expect(text).toMatch(/24\.000/);
    expect(struckTexts(container).join(" ")).not.toMatch(/24\.000/);
  });

  it("15) iki tutar da AYNI fiyat SATIRINDA gösterilir", () => {
    const { container } = renderCard({ discounts: DISCOUNTS });
    const text = priceAreaText(container);
    expect(text).toMatch(/30\.000/);
    expect(text).toMatch(/24\.000/);
    expect(text).not.toContain("gece");
  });

  it("16) 🔒 indirim YOKSA üstü çizili tutar HİÇ render edilmez", () => {
    const { container } = renderCard();
    expect(struckTexts(container)).toHaveLength(0);
    expect(priceAreaText(container)).toMatch(/30\.000/);
  });

  it("17) boş indirim dizisi = indirim yok (mevcut davranış birebir)", () => {
    const { container } = renderCard({ discounts: [] });
    expect(struckTexts(container)).toHaveLength(0);
    expect(priceAreaText(container)).toMatch(/30\.000/);
  });

  it("18) tarih seçilmemişse indirim verisi olsa bile üstü çizili YOK", () => {
    const { container } = renderCard({
      withDates: false,
      discounts: DISCOUNTS,
    });
    expect(struckTexts(container)).toHaveLength(0);
    expect(priceAreaText(container)).toContain(tr.card.startingFromLower);
  });

  it("19) 🔒 müsaitlik satırına fiyat GERİ GELMEDİ", () => {
    renderCard({ discounts: DISCOUNTS });
    const row = availabilityRowText();
    expect(row).not.toMatch(/30\.000/);
    expect(row).not.toMatch(/24\.000/);
  });

  it("20) indirim tutarı yükseltirse (fixed = yüksek gecelik) üstü çizili YOK", () => {
    /* "fixed" = o gecenin NİHAİ fiyatı (motor semantiği). 12.000 > 10.000
       → indirimsiz toplam DAHA DÜŞÜK; sahte "indirim" gösterilmemeli. */
    const { container } = renderCard({
      discounts: [
        {
          start_date: "2026-10-01",
          end_date: "2026-10-31",
          discount_type: "fixed",
          discount_value: 12000,
          currency: null,
        },
      ],
    });
    expect(struckTexts(container)).toHaveLength(0);
    expect(priceAreaText(container)).toMatch(/36\.000/);
  });
});

describe("E) motor dokunulmazlığı — kaynak kilidi", () => {
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("10) 🔒 kartta hâlâ TEK `calculateGrandTotal` çağrısı var", () => {
    const card = codeOnly(
      readFileSync(
        join(process.cwd(), "app/components/villa/VillaCard.tsx"),
        "utf-8"
      )
    );
    expect((card.match(/calculateGrandTotal\(/g) || []).length).toBe(1);
    /* Motorun opsiyonel `discounts` parametresi hâlâ aktarılıyor. */
    expect(card).toMatch(/discounts:\s*stayDiscounts/);
  });

  it("11) 🔒 price.engine.ts'e DOKUNULMADI (imza + discount default)", () => {
    const engine = readFileSync(
      join(process.cwd(), "lib/price.engine.ts"),
      "utf-8"
    );
    expect(engine).toMatch(/discounts = null,/);
    expect(engine).toMatch(/discounts\?:\s*DiscountRange\[\]\s*\|\s*null;/);
  });

  it("12) 🔒 diğer variant'ların (curation/discount) fiyat bloğu DURUYOR", () => {
    const card = readFileSync(
      join(process.cwd(), "app/components/villa/VillaCard.tsx"),
      "utf-8"
    );
    /* Curation: "TOPLAM" eyebrow'lu blok; Discount: gecelik gösterim. */
    expect(card).toContain("dict.card.total");
    expect(card).toContain("dict.card.nightly");
  });
});

/* ===============================================================
   G) ÜÇ SATIRLI FİYAT ALANI — tarih · fiyat · indirim tutarı
   ===============================================================
   Tarih etiketi mevcut `buildHeroDateLabel` (Hero paneliyle AYNI
   helper) ile üretilir; indirim tutarı ZATEN hesaplanmış iki toplamın
   FARKIDIR. Yeni format/hesap YOK.
=============================================================== */
describe("G) üç satırlı fiyat alanı", () => {
  const savingsLine = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("p")).find((p) =>
      p.className.includes("text-red-600")
    );

  it("21) ÜST SATIR — seçilen tarih aralığı fiyatın üstünde gösterilir", () => {
    const { container } = renderCard();
    /* 2026-10-08 → 2026-10-11, tr-TR kısa ay: "8 Eki – 11 Eki". */
    expect(priceBlockText(container)).toMatch(/8\s*Eki\s*–\s*11\s*Eki/);
  });

  it("22) tarih satırı fiyat satırının ÜSTÜNDE (DOM sırası)", () => {
    const { container } = renderCard();
    const block = priceLine(container)!.parentElement!;
    const texts = Array.from(block.querySelectorAll("p")).map(
      (p) => p.textContent || ""
    );
    expect(texts[0]).toMatch(/Eki/);
    expect(texts[1]).toMatch(/30\.000/);
  });

  it("23) tarih seçilmemişse tarih satırı YOK (mevcut davranış)", () => {
    const { container } = renderCard({ withDates: false });
    expect(container.textContent).not.toMatch(/Eki/);
    expect(priceAreaText(container)).toContain(tr.card.startingFromLower);
  });

  it("24) ALT SATIR — indirim tutarı (₺6.000) KIRMIZI gösterilir", () => {
    /* 30.000 − 24.000 = 6.000 (iki mevcut toplamın farkı). */
    const { container } = renderCard({ discounts: DISCOUNTS });
    const line = savingsLine(container);
    expect(line).toBeTruthy();
    expect(line!.textContent).toMatch(/6\.000/);
    expect(line!.textContent).toContain("indirimli");
  });

  it("25) 🔒 indirim yoksa indirim satırı HİÇ render edilmez", () => {
    const { container } = renderCard();
    expect(savingsLine(container)).toBeUndefined();
  });

  it("26) 'Temizlik dahil' mevcut koşuluyla fiyat satırında kalır", () => {
    const { container } = renderCard({ cleaningFee: 2000 });
    const text = priceAreaText(container);
    expect(text).toContain(tr.card.cleaningIncluded);
    /* 3 × 10.000 + 2.000 = 32.000 */
    expect(text).toMatch(/32\.000/);
  });

  it("27) temizlik yoksa 'Temizlik dahil' YOK (mevcut davranış)", () => {
    const { container } = renderCard();
    expect(priceAreaText(container)).not.toContain(tr.card.cleaningIncluded);
  });

  it("28) EN/DE — indirim metni sözlükten gelir (hardcoded TR yok)", async () => {
    const { en } = await import("@/lib/i18n/dictionaries/en");
    const { container } = renderCard({ discounts: DISCOUNTS, locale: "en" });
    const line = savingsLine(container);
    expect(line!.textContent).toContain(
      en.card.totalSavings.replace("{amount}", "").trim()
    );
  });
});
