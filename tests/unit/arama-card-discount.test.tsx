/* ===============================================================
   🛡️ /arama KART FİYATI — villa_discounts REGRESYON KİLİDİ
   ===============================================================
   PROBLEM (düzeltildi): tarihli aramada VillaCard, mevcut
   `calculateGrandTotal` çağrısına `discounts` geçmediği için aktif
   indirimleri hesaba katmıyor, kullanıcıya indirimsiz (yüksek) fiyat
   gösteriyordu.

   BU TEST ÜÇ ŞEYİ KİLİTLER:
     1) İndirim verisi VillaCard'a ULAŞIYOR mu?
     2) `calculateGrandTotal`'a GERÇEKTEN aktarılıyor mu?
     3) Mevcut davranışlar BOZULUYOR mu? (prop verilmeyince birebir aynı)

   ⚠️ GERÇEK fiyat motoru çalışır — `calculateGrandTotal` yalnız
   ARGÜMANLARI gözlemlemek için sarmalanır (importOriginal), matematik
   DEĞİŞTİRİLMEZ. price.engine.ts'e dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

/* ---------------- calculateGrandTotal casus sarmalayıcısı ----------------
   Gerçek modül yüklenir; yalnız bu tek fonksiyon spy ile sarılır →
   dönen değer GERÇEK motorun sonucudur. */
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

/* ---------------- VillaCard çevre mock'ları ---------------- */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/arama",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
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
import { calculateGrandTotal, type DiscountRange } from "@/lib/price.engine";

/* ---------------- fixtures ----------------
   Kullanıcının örnek senaryosu: 08.10.2026 → 15.10.2026 (7 gece),
   gecelik 10.000 TRY → indirimsiz 70.000; %20 indirim → 56.000. */
const START = "2026-10-08";
const END = "2026-10-15";

const PRICES = [
  {
    price: 10000,
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

function renderCard(stayDiscounts?: DiscountRange[]) {
  render(
    <VillaCard
      id="v-1"
      slug="test-villa"
      title="Test Villa"
      location="Kalkan"
      price={10000}
      currency="TRY"
      stayStart={START}
      stayEnd={END}
      prices={PRICES}
      stayDiscounts={stayDiscounts}
      cleaningFee={0}
      cleaningCurrency="TRY"
      cleaningLimit={0}
    />
  );
}

/** Spy'a düşen son çağrının argümanları. */
function lastArgs() {
  expect(grandTotalSpy).toHaveBeenCalled();
  return grandTotalSpy.mock.calls[grandTotalSpy.mock.calls.length - 1][0];
}

beforeEach(() => {
  grandTotalSpy.mockClear();
});

/* ===============================================================
   A) DAVRANIŞ
   =============================================================== */
describe("/arama kart fiyatı — indirim aktarımı", () => {
  it("1) `stayDiscounts` VillaCard'a ulaşır ve calculateGrandTotal'a AKTARILIR", () => {
    renderCard(DISCOUNTS);
    expect(lastArgs().discounts).toEqual(DISCOUNTS);
  });

  it("2) prop verilmezse `discounts` undefined kalır → motorun null default'u (ESKİ DAVRANIŞ)", () => {
    renderCard(undefined);
    expect(lastArgs().discounts).toBeUndefined();
  });

  it("3) indirimli toplam, indirimsiz toplamdan GERÇEKTEN düşük (%20 → 70.000 → 56.000)", () => {
    const withoutDiscount = calculateGrandTotal({
      start: START,
      end: END,
      prices: PRICES,
      currency: "TRY",
      rates: { TRY: 1 },
      cleaning_fee: 0,
      cleaning_currency: "TRY",
      cleaning_limit: 0,
    });
    const withDiscount = calculateGrandTotal({
      start: START,
      end: END,
      prices: PRICES,
      currency: "TRY",
      rates: { TRY: 1 },
      cleaning_fee: 0,
      cleaning_currency: "TRY",
      cleaning_limit: 0,
      discounts: DISCOUNTS,
    });

    expect(withoutDiscount.nights).toBe(7);
    expect(withoutDiscount.total).toBe(70000);
    expect(withDiscount.total).toBe(56000);
  });

  it("4) kart, indirim geçilince İNDİRİMLİ toplamı render eder", () => {
    renderCard(DISCOUNTS);
    /* Motorun gerçek sonucu 56.000 → tr-TR gruplandırması "56.000". */
    expect(screen.getByText(/56\.000/)).toBeTruthy();
    /* ⚠️ UI GÜNCELLEMESİ: indirimsiz toplam (70.000) artık kartta
       ÜSTÜ ÇİZİLİ olarak gösteriliyor. Testin ASIL amacı — "kart
       ödenecek tutar olarak indirimsizi göstermesin" — gevşetilmedi,
       daha da sıkıldı: 70.000 YALNIZ line-through öğesinde olabilir,
       56.000 ise ASLA üstü çizili olamaz. */
    const struck = Array.from(
      document.body.querySelectorAll(".line-through")
    )
      .map((el) => el.textContent || "")
      .join(" ");
    expect(struck).toMatch(/70\.000/);
    expect(struck).not.toMatch(/56\.000/);
    /* 70.000 SADECE üstü çizili öğede geçer — başka hiçbir yerde. */
    expect(
      screen.getAllByText(/70\.000/).every((el) =>
        el.className.includes("line-through")
      )
    ).toBe(true);
  });

  it("5) indirim geçilmeyince kart ESKİSİ gibi indirimsiz toplamı render eder", () => {
    renderCard(undefined);
    expect(screen.getByText(/70\.000/)).toBeTruthy();
  });

  it("6) boş indirim dizisi = indirim yok (eski davranış birebir)", () => {
    renderCard([]);
    expect(lastArgs().discounts).toEqual([]);
    expect(screen.getByText(/70\.000/)).toBeTruthy();
  });

  it("7) tarih/gece/currency/temizlik argümanları DEĞİŞMEDİ", () => {
    renderCard(DISCOUNTS);
    const a = lastArgs();
    expect(a.start).toBe(START);
    expect(a.end).toBe(END);
    expect(a.prices).toEqual(PRICES);
    expect(a.currency).toBe("TRY");
    expect(a.cleaning_fee).toBe(0);
    expect(a.cleaning_currency).toBe("TRY");
    expect(a.cleaning_limit).toBe(0);
  });
});

/* ===============================================================
   B) KAYNAK KİLİDİ — veri akışı ve kapsam
   =============================================================== */
describe("/arama indirim akışı — kaynak kilidi", () => {
  const read = (rel: string) =>
    readFileSync(join(process.cwd(), rel), "utf-8");
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const repo = read("lib/db/villa.repository.server.ts");
  const arama = read("app/components/search/AramaPageBody.tsx");
  const card = read("app/components/villa/VillaCard.tsx");
  const engine = read("lib/price.engine.ts");

  it("8) findSearchResults select'i villa_discounts embed eder", () => {
    const fn = repo.slice(repo.indexOf("async findSearchResults"));
    const body = fn.slice(0, fn.indexOf("async ", 10));
    expect(body).toMatch(/villa_discounts\s*\(/);
    expect(body).toMatch(/discount_type/);
    expect(body).toMatch(/discount_value/);
  });

  it("9) AramaPageBody karta `stayDiscounts` geçer — `prices` ile AYNI koşulda", () => {
    const code = codeOnly(arama);
    expect(code).toMatch(
      /stayDiscounts=\{\s*hasDateRange && !villa\.isFlexible\s*\?\s*villa\.discounts\s*:\s*undefined\s*\}/
    );
  });

  it("10) sıralama anahtarı da AYNI `discounts` ile hesaplanır (gösterilen = sıralanan)", () => {
    const code = codeOnly(arama);
    expect(code).toMatch(/discounts:\s*v\.discounts/);
  });

  it("11) VillaCard `stayDiscounts`'ı MEVCUT calculateGrandTotal çağrısına iletir", () => {
    const code = codeOnly(card);
    expect(code).toMatch(/discounts:\s*stayDiscounts/);
    /* Kartta İKİNCİ bir calculateGrandTotal çağrısı türememiş olmalı. */
    expect((code.match(/calculateGrandTotal\(/g) || []).length).toBe(1);
  });

  it("12) price.engine.ts'in `discounts` parametresi HÂLÂ opsiyonel (motor değişmedi)", () => {
    expect(engine).toMatch(/discounts = null,/);
    expect(engine).toMatch(/discounts\?:\s*DiscountRange\[\]\s*\|\s*null;/);
  });

  it("13) kapsam genişlemedi — diğer yüzeylere `stayDiscounts` sızmadı", () => {
    const others = [
      "app/components/short-gaps/ShortGapsPageBody.tsx",
      "app/components/shared-list/SharedListPageBody.tsx",
      "app/components/private-villa/PrivateVillaPageBody.tsx",
      "app/components/villa/VillaCardBookingModal.tsx",
    ];
    for (const rel of others) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/stayDiscounts/);
    }
  });
});
