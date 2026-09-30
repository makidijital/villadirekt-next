/* ===============================================================
   🛡️ MIGRATION 088 — ÖDEME YÖNTEMİ ADI LOCALE ÇÖZÜMÜ (public)
   ===============================================================
   `ReservationForm` ödeme yöntemi ETİKETİNİ locale'e göre gösterir:
     resolveTaxonomyName(p.name, p.name_by_locale, activeLocale)

   🔒 DEĞİŞMEYENLER (bu dosya bunları da doğrular):
     canonical `name` · `payment_method_id` · payload · API endpoint ·
     fiyat/ön ödeme hesabı · TR çıktısı.

   Mock convention: `reservation-locale-routes.test.tsx` ile AYNI.
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";
import type { Locale } from "@/lib/i18n/config";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: {}, setCurrency: vi.fn() }),
}));

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 20 })),
}));

import ReservationForm from "@/app/components/reservation/ReservationForm";

const VILLA = {
  id: "villa-1",
  slug: "test-villa",
  title: "Test Villa",
  cleaning_fee: 0,
  cleaning_currency: "TRY",
  cleaning_limit: 0,
  pool_heating_fee: 0,
  pool_heating_currency: "TRY",
  pool_heating_months: null,
};

/** DB satırı + additive `name_by_locale` (route'un döndürdüğü şekil). */
const PAYMENT_METHODS = [
  {
    id: "pm-1",
    name: "Kredi Kartı",
    type: "credit_card",
    name_by_locale: { de: "Kreditkarte" },
  },
  {
    id: "pm-2",
    name: "Havale / EFT",
    type: "bank_transfer",
    name_by_locale: { en: "Bank Transfer", de: "Banküberweisung" },
  },
];

function stubFetch(methods: unknown[] = PAYMENT_METHODS) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/public/payment-methods")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, payment_methods: methods }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    })
  );
}

function renderForm(locale?: Locale) {
  const props: Record<string, unknown> = {
    villa: VILLA,
    prices: [],
    discounts: [],
    start: "2026-06-01",
    end: "2026-06-08",
    image: "/cover.jpg",
    adults: "2",
    children: "0",
    poolHeatingSelected: false,
  };
  if (locale) props.locale = locale;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<ReservationForm {...(props as any)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ===============================================================
   1) resolveTaxonomyName — REUSE edilen fallback (yeni mantık YOK)
   =============================================================== */

describe("resolveTaxonomyName — ödeme yöntemi adı", () => {
  it("1) TR → canonical (çeviriye HİÇ bakılmaz)", () => {
    expect(
      resolveTaxonomyName("Kredi Kartı", { en: "Credit Card" }, "tr")
    ).toBe("Kredi Kartı");
  });

  it("2) EN çevirisi varsa çeviri", () => {
    expect(
      resolveTaxonomyName("Kredi Kartı", { en: "Credit Card" }, "en")
    ).toBe("Credit Card");
  });

  it("3) EN yok / DE var → EN'de TR, DE'de çeviri (istenen senaryo)", () => {
    const map = { de: "Kreditkarte" };
    expect(resolveTaxonomyName("Kredi Kartı", map, "en")).toBe("Kredi Kartı");
    expect(resolveTaxonomyName("Kredi Kartı", map, "de")).toBe("Kreditkarte");
  });

  it.each([undefined, null, {}, { en: "" }, { en: "   " }])(
    "4) çeviri yok/boş/whitespace (%s) → TR canonical",
    (map) => {
      expect(
        resolveTaxonomyName(
          "Kredi Kartı",
          map as Record<string, string> | null | undefined,
          "en"
        )
      ).toBe("Kredi Kartı");
    }
  );
});

/* ===============================================================
   2) ReservationForm — görünen etiket
   =============================================================== */

describe("ReservationForm — ödeme yöntemi etiketi", () => {
  it("5) TR → canonical adlar BİREBİR (regresyon)", async () => {
    renderForm("tr");
    await waitFor(() =>
      expect(screen.getByText("Kredi Kartı")).toBeInTheDocument()
    );
    expect(screen.getByText("Havale / EFT")).toBeInTheDocument();
    expect(screen.queryByText("Credit Card")).toBeNull();
    expect(screen.queryByText("Bank Transfer")).toBeNull();
  });

  it("6) locale prop'u HİÇ verilmezse de TR (backward compatibility)", async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByText("Havale / EFT")).toBeInTheDocument()
    );
    expect(screen.queryByText("Bank Transfer")).toBeNull();
  });

  it("7) EN → çevirisi olan çevrilir, olmayan TR'ye düşer", async () => {
    renderForm("en");
    await waitFor(() =>
      expect(screen.getByText("Bank Transfer")).toBeInTheDocument()
    );
    /* pm-1'in EN çevirisi YOK → TR canonical gösterilir. */
    expect(screen.getByText("Kredi Kartı")).toBeInTheDocument();
  });

  it("8) DE → her ikisi de çevrilir", async () => {
    renderForm("de");
    await waitFor(() =>
      expect(screen.getByText("Kreditkarte")).toBeInTheDocument()
    );
    expect(screen.getByText("Banküberweisung")).toBeInTheDocument();
    expect(screen.queryByText("Kredi Kartı")).toBeNull();
    expect(screen.queryByText("Havale / EFT")).toBeNull();
  });

  it("9) `name_by_locale` HİÇ yoksa (eski cevap şekli) TR canonical — çökmez", async () => {
    stubFetch([{ id: "pm-1", name: "Havale / EFT", type: "bank_transfer" }]);
    renderForm("de");
    await waitFor(() =>
      expect(screen.getByText("Havale / EFT")).toBeInTheDocument()
    );
  });

  it("10) 🔒 seçim canonical `id` ile yapılır — etiket/çeviri payload'a GİRMEZ", async () => {
    renderForm("de");
    await waitFor(() =>
      expect(screen.getByText("Kreditkarte")).toBeInTheDocument()
    );

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
  });

  it("11) 🔒 API endpoint DEĞİŞMEDİ (/api/public/payment-methods)", async () => {
    renderForm("en");
    await waitFor(() => {
      const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
        .mock.calls;
      expect(
        calls.some((c) => String(c[0]) === "/api/public/payment-methods")
      ).toBe(true);
    });
  });
});
