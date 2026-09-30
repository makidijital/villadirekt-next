/* ===============================================================
   🛡️ İNDİRİMLİ KART CTA — "Hemen Rezervasyon Yap" TARİH TAŞIMA KİLİDİ
   ===============================================================
   Ana sayfa "İndirimli Kiralık Villalar" kartındaki CTA, villa_discounts
   kaydının tarihlerini /rezervasyon sayfasına ÖN-SEÇİLİ olarak taşımalı.

   BU TEST ŞUNLARI KİLİTLER:
     1) URL standardı: /rezervasyon/<slug>?start=&end=  (ShortGaps +
        useBookingEngine ile AYNI param adları — yeni sözleşme yok).
     2) TARİH SEMANTİĞİ: `end_date` bu üründe kullanıcıya gösterilen
        ÇIKIŞ tarihidir → start_date/end_date URL'e AYNEN taşınır.
        ⛔ `+1 gün` UYGULANMAZ (kartta 10–17 Ekim ise rezervasyon
        sayfasında da 10–17 Ekim görünmeli).
     3) Locale önekleri (/en, /de) doğru.
     4) Bozuk/eksik veride MEVCUT davranışa (villa detayı) düşüş.
     5) discount variant DIŞINDA hiçbir şey değişmedi.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const pushSpy = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/",
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

type DiscountProp = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency: string | null;
};

const BASE_DISCOUNT: DiscountProp = {
  start_date: "2026-10-08",
  end_date: "2026-10-14",
  discount_type: "percent",
  discount_value: 20,
  currency: null,
};

function renderDiscountCard(opts?: {
  discount?: DiscountProp | null;
  slug?: string;
  locale?: "tr" | "en" | "de";
  discountAvailable?: boolean;
}) {
  render(
    <VillaCard
      variant="discount"
      discountAvailable={opts?.discountAvailable}
      id="v-1"
      slug={opts?.slug ?? "ornek-villa"}
      title="Örnek Villa"
      location="Kaş"
      price={10000}
      currency="TRY"
      images={[]}
      bedrooms={3}
      bathrooms={2}
      guests={6}
      discount={opts?.discount === undefined ? BASE_DISCOUNT : opts.discount}
      locale={opts?.locale ?? "tr"}
    />
  );
}

/** CTA butonunu metniyle bulur (tasarım/diğer butonlar değişmeden). */
function clickCta(label = "Hemen Rezervasyon Yap") {
  const btn = screen.getByRole("button", { name: label });
  fireEvent.click(btn);
  return btn;
}

describe("İndirimli kart CTA — fırsat tarihlerini rezervasyona taşır", () => {
  beforeEach(() => {
    pushSpy.mockReset();
  });

  it("1) TR: /rezervasyon/<slug>?start=&end= adresine gider", () => {
    renderDiscountCard();
    clickCta();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-10-08&end=2026-10-14"
    );
  });

  it("2) REGRESYON: end_date AYNEN taşınır — +1 gün UYGULANMAZ", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-10", end_date: "2026-10-17" },
    });
    clickCta();
    const url = new URL(pushSpy.mock.calls[0][0] as string, "https://x.test");
    expect(url.searchParams.get("start")).toBe("2026-10-10");
    expect(url.searchParams.get("end")).toBe("2026-10-17");
    // 17 → 18 KESİNLİKLE olmayacak (kullanıcı bildirimi, düzeltildi).
    expect(url.searchParams.get("end")).not.toBe("2026-10-18");
  });

  it("3) ÖRNEK: 10–17 Ekim → 10–17 Ekim", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-10", end_date: "2026-10-17" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-10-10&end=2026-10-17"
    );
  });

  it("4) ÖRNEK: 1–5 Kasım → 1–5 Kasım", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-11-01", end_date: "2026-11-05" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-11-01&end=2026-11-05"
    );
  });

  it("5) ÖRNEK: 28 Aralık – 2 Ocak → 28 Aralık – 2 Ocak (yıl sınırı, kaydırma YOK)", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-12-28", end_date: "2027-01-02" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-12-28&end=2027-01-02"
    );
  });

  it("6) Tek günlük indirim → iki tarih de aynı gün (kaydırma YOK)", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-08", end_date: "2026-10-08" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-10-08&end=2026-10-08"
    );
  });

  it("7) Kartta gösterilen aralık ile URL'deki tarihler BİREBİR aynı", () => {
    const d = { ...BASE_DISCOUNT, start_date: "2026-10-10", end_date: "2026-10-17" };
    renderDiscountCard({ discount: d });
    clickCta();
    const url = new URL(pushSpy.mock.calls[0][0] as string, "https://x.test");
    expect(url.searchParams.get("start")).toBe(d.start_date);
    expect(url.searchParams.get("end")).toBe(d.end_date);
  });

  it("8) EN locale → /en/rezervasyon/...", () => {
    renderDiscountCard({ locale: "en" });
    clickCta("Book Now");
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/en/rezervasyon/ornek-villa?start=2026-10-08&end=2026-10-14"
    );
  });

  it("9) DE locale → /de/rezervasyon/...", () => {
    renderDiscountCard({ locale: "de" });
    const btn = screen.getAllByRole("button").find((b) =>
      (b.textContent || "").trim().length > 0 &&
      (b.getAttribute("class") || "").includes("bg-[#ED7926]")
    )!;
    fireEvent.click(btn);
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/de/rezervasyon/ornek-villa?start=2026-10-08&end=2026-10-14"
    );
  });

  it("10) discount YOKSA → MEVCUT davranış: villa detay sayfası", () => {
    renderDiscountCard({ discount: null });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe("/kiralik-villa/ornek-villa");
  });

  it("11) BOZUK tarih → MEVCUT davranışa düşer (asla geçersiz URL üretmez)", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "bozuk", end_date: "2026-10-14" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe("/kiralik-villa/ornek-villa");
  });

  it("12) TERS aralık (end < start) → MEVCUT davranışa düşer", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-14", end_date: "2026-10-08" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe("/kiralik-villa/ornek-villa");
  });

  it("13) CTA tasarımı DEĞİŞMEDİ — turuncu marka butonu aynı sınıflarla duruyor", () => {
    renderDiscountCard();
    const btn = screen.getByRole("button", { name: "Hemen Rezervasyon Yap" });
    const cls = btn.getAttribute("class") || "";
    expect(cls).toContain("bg-[#ED7926]");
    expect(cls).toContain("h-11");
    expect(cls).toContain("rounded-xl");
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("15) MÜSAİTLİK — discountAvailable=false → rezervasyon YOK, villa detayına gider", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-10", end_date: "2026-10-17" },
      discountAvailable: false,
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe("/kiralik-villa/ornek-villa");
    expect(String(pushSpy.mock.calls[0][0])).not.toContain("/rezervasyon/");
  });

  it("16) MÜSAİTLİK — discountAvailable=true → indirim tarihleriyle rezervasyon sayfası", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-10", end_date: "2026-10-17" },
      discountAvailable: true,
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-10-10&end=2026-10-17"
    );
  });

  it("17) FAIL-SOFT — discountAvailable verilmezse (undefined) MEVCUT davranış korunur", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-10", end_date: "2026-10-17" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-10-10&end=2026-10-17"
    );
  });

  it("18) discountAvailable=false CTA'nın TASARIMINI değiştirmez", () => {
    renderDiscountCard({ discountAvailable: false });
    const btn = screen.getByRole("button", { name: "Hemen Rezervasyon Yap" });
    const cls = btn.getAttribute("class") || "";
    expect(cls).toContain("bg-[#ED7926]");
    expect(cls).toContain("h-11");
    expect(cls).toContain("rounded-xl");
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("14) DEFAULT variant (indirimsiz liste kartı) DEĞİŞMEDİ", () => {
    render(
      <VillaCard
        id="v-2"
        slug="baska-villa"
        title="Başka Villa"
        location="Fethiye"
        price={5000}
        currency="TRY"
        images={[]}
        bedrooms={2}
        bathrooms={1}
        guests={4}
        locale="tr"
      />
    );
    // default variant'ta "Hemen Rezervasyon Yap" CTA'sı HİÇ render edilmez.
    expect(
      screen.queryByRole("button", { name: "Hemen Rezervasyon Yap" })
    ).toBeNull();
  });
});
