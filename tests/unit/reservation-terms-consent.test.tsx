/* ===============================================================
   🛡️ REZERVASYON — SÖZLEŞME ONAY CHECKBOX'I
   ===============================================================
   KURALLAR:
     • Başlangıçta İŞARETSİZ, submit butonu DEVRE DIŞI.
     • İşaretlenmeden gönderim yapılamaz (buton + defansif guard).
     • İşaretliyse MEVCUT rezervasyon akışı aynen çalışır.
     • Üç link aktif locale'i taşır (`localeHref`):
         tr → /p/...      en → /en/p/...      de → /de/p/...
     • Linke tıklamak checkbox'ı toggle ETMEZ.
     • Metin sözlükten gelir (EN/DE'de Türkçe sızıntısı YOK).
=============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";
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
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: vi.fn(async () => ({
    phone: "",
    whatsapp_link: "",
    updated_at: null,
  })),
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null | undefined) => u || null,
  resolveAssetUrlVersioned: (u: string | null | undefined) => u || null,
}));

import ReservationForm from "@/app/components/reservation/ReservationForm";

const LOCALES: Locale[] = ["tr", "en", "de"];

const SLUGS = {
  cancellation: "/p/rezervasyon-ve-iptal-kosullari",
  distanceSales: "/p/mesafeli-satis-sozlesmesi",
  privacy: "/p/kvkk-ve-gizlilik-politikasi",
} as const;

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

function renderForm(locale?: Locale) {
  const props: Record<string, unknown> = {
    villa: VILLA,
    prices: [
      { start_date: "2026-06-01", end_date: "2026-06-30", price: 1000, currency: "TRY" },
    ],
    discounts: [],
    start: "2026-06-01",
    end: "2026-06-08",
    image: "/cover.jpg",
    adults: "2",
    children: "1",
    poolHeatingSelected: false,
  };
  if (locale) props.locale = locale;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<ReservationForm {...(props as any)} />);
}

function terms(): HTMLInputElement {
  return document.getElementById(
    "reservation-terms-accept"
  ) as HTMLInputElement;
}

function submitButton(locale: Locale) {
  const d = getDictionary(locale).reservation;
  return screen.getByText(d.form.submit).closest("button") as HTMLButtonElement;
}

/** Formu geçerli hâle getirir (checkbox HARİÇ). */
async function fillValidForm(locale: Locale) {
  const d = getDictionary(locale).reservation;
  await waitFor(() =>
    expect(screen.getByText("Havale / EFT")).toBeInTheDocument()
  );
  fireEvent.change(screen.getByPlaceholderText(d.form.namePlaceholder), {
    target: { value: "Ahmet Yılmaz" },
  });
  fireEvent.change(screen.getByPlaceholderText(d.form.emailPlaceholder), {
    target: { value: "test@example.com" },
  });
  /* 🛡️ Migration 094 — İKİ telefon da zorunlu; ülke kodu select'i
     varsayılan +90. Kullanıcı akışı tamamlanır, assertion değişmedi. */
  fireEvent.change(screen.getByPlaceholderText(d.form.phonePlaceholder), {
    target: { value: "5551112233" },
  });
  fireEvent.change(screen.getByPlaceholderText(d.form.phone2Placeholder), {
    target: { value: "5559998877" },
  });
  fireEvent.change(screen.getByPlaceholderText(d.form.identityPlaceholder), {
    target: { value: "12345678901" },
  });
  fireEvent.click(screen.getAllByRole("radio")[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/public/payment-methods")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            payment_methods: [{ id: "pm-1", name: "Havale / EFT" }],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, id: "r1", reservation_no: "R-1" }),
      };
    }) as unknown as typeof fetch
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* =============================================================== */
describe("1) Başlangıç durumu", () => {
  it("1a) checkbox render edilir ve UNCHECKED", async () => {
    renderForm("tr");
    await waitFor(() => expect(terms()).toBeTruthy());
    expect(terms().checked).toBe(false);
    expect(terms().type).toBe("checkbox");
  });

  it("1b) label `htmlFor` ile checkbox'a bağlı (a11y)", async () => {
    renderForm("tr");
    await waitFor(() => expect(terms()).toBeTruthy());
    const label = document.querySelector(
      'label[for="reservation-terms-accept"]'
    );
    expect(label).toBeTruthy();
  });
});

describe("2-3-5) Submit kapısı", () => {
  it("2) checkbox UNCHECKED → gönderim ENGELLENİR (POST yok)", async () => {
    renderForm("tr");
    const d = getDictionary("tr").reservation;
    await fillValidForm("tr");
    const btn = submitButton("tr");

    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByText(d.form.termsRequired)).toBeInTheDocument()
    );
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    expect(
      calls.some((c) => String(c[0]) === "/api/public/reservations")
    ).toBe(false);
  });

  it("3) checkbox CHECKED → buton aktif ve MEVCUT akış POST atar", async () => {
    renderForm("tr");
    await fillValidForm("tr");
    fireEvent.click(terms());
    const btn = submitButton("tr");

    fireEvent.click(btn);
    await waitFor(() => {
      const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
        .mock.calls;
      expect(
        calls.some((c) => String(c[0]) === "/api/public/reservations")
      ).toBe(true);
    });
  });

  it("5) tekrar kaldırılırsa gönderim YİNE engellenir", async () => {
    renderForm("tr");
    const d = getDictionary("tr").reservation;
    await fillValidForm("tr");
    fireEvent.click(terms());
    expect(terms().checked).toBe(true);
    fireEvent.click(terms());
    expect(terms().checked).toBe(false);

    fireEvent.click(submitButton("tr"));
    await waitFor(() =>
      expect(screen.getByText(d.form.termsRequired)).toBeInTheDocument()
    );
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    expect(
      calls.some((c) => String(c[0]) === "/api/public/reservations")
    ).toBe(false);
  });
});

describe("4) Hata mesajı — MEVCUT inline banner kullanılır", () => {
  it.each(LOCALES)("4-%s) onaysız gönderimde locale'e uygun uyarı", async (loc) => {
    renderForm(loc);
    const d = getDictionary(loc).reservation;
    await fillValidForm(loc);
    fireEvent.click(submitButton(loc));

    await waitFor(() =>
      expect(screen.getByText(d.form.termsRequired)).toBeInTheDocument()
    );
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    expect(
      calls.some((c) => String(c[0]) === "/api/public/reservations")
    ).toBe(false);
  });

  it("4d) onay verilince uyarı kendiliğinden kalkar", async () => {
    renderForm("tr");
    const d = getDictionary("tr").reservation;
    await fillValidForm("tr");
    fireEvent.click(submitButton("tr"));
    await waitFor(() =>
      expect(screen.getByText(d.form.termsRequired)).toBeInTheDocument()
    );
    fireEvent.click(terms());
    await waitFor(() =>
      expect(screen.queryByText(d.form.termsRequired)).toBeNull()
    );
  });
});

describe("6-7-8) Link hedefleri aktif locale'i TAŞIR", () => {
  it.each(LOCALES)("%s) üç link de doğru prefix'li", async (loc) => {
    renderForm(loc);
    await waitFor(() => expect(terms()).toBeTruthy());
    const label = document.querySelector(
      'label[for="reservation-terms-accept"]'
    ) as HTMLElement;
    const hrefs = Array.from(label.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toEqual([
      localeHref(SLUGS.cancellation, loc),
      localeHref(SLUGS.distanceSales, loc),
      localeHref(SLUGS.privacy, loc),
    ]);
  });

  it("6b) TR canonical (prefix'siz) KALIR", async () => {
    renderForm("tr");
    await waitFor(() => expect(terms()).toBeTruthy());
    const label = document.querySelector(
      'label[for="reservation-terms-accept"]'
    ) as HTMLElement;
    const hrefs = Array.from(label.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toEqual([
      "/p/rezervasyon-ve-iptal-kosullari",
      "/p/mesafeli-satis-sozlesmesi",
      "/p/kvkk-ve-gizlilik-politikasi",
    ]);
  });

  it("7b) EN → /en/p/..., 8b) DE → /de/p/...", async () => {
    for (const loc of ["en", "de"] as const) {
      renderForm(loc);
      await waitFor(() => expect(terms()).toBeTruthy());
      const label = document.querySelector(
        'label[for="reservation-terms-accept"]'
      ) as HTMLElement;
      const hrefs = Array.from(label.querySelectorAll("a")).map((a) =>
        a.getAttribute("href")
      );
      expect(hrefs).toEqual([
        `/${loc}/p/rezervasyon-ve-iptal-kosullari`,
        `/${loc}/p/mesafeli-satis-sozlesmesi`,
        `/${loc}/p/kvkk-ve-gizlilik-politikasi`,
      ]);
      cleanup();
    }
  });

  it("linke tıklamak checkbox'ı TOGGLE ETMEZ", async () => {
    renderForm("tr");
    await waitFor(() => expect(terms()).toBeTruthy());
    const label = document.querySelector(
      'label[for="reservation-terms-accept"]'
    ) as HTMLElement;
    const link = label.querySelector("a") as HTMLAnchorElement;
    expect(terms().checked).toBe(false);
    fireEvent.click(link);
    expect(terms().checked).toBe(false);
  });

  it("linkler yeni sekmede açılır (form kaybolmaz)", async () => {
    renderForm("tr");
    await waitFor(() => expect(terms()).toBeTruthy());
    const label = document.querySelector(
      'label[for="reservation-terms-accept"]'
    ) as HTMLElement;
    for (const a of Array.from(label.querySelectorAll("a"))) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });
});

describe("Metin locale'e göre sözlükten gelir", () => {
  it.each(LOCALES)("%s) üç link etiketi dictionary değerleriyle aynı", async (loc) => {
    renderForm(loc);
    const d = getDictionary(loc).reservation;
    await waitFor(() => expect(terms()).toBeTruthy());
    expect(screen.getByText(d.form.termsCancellationLink)).toBeInTheDocument();
    expect(screen.getByText(d.form.termsDistanceSalesLink)).toBeInTheDocument();
    expect(screen.getByText(d.form.termsPrivacyLink)).toBeInTheDocument();
  });

  it("şablonda çözülmemiş placeholder KALMAZ", async () => {
    for (const loc of LOCALES) {
      renderForm(loc);
      await waitFor(() => expect(terms()).toBeTruthy());
      const label = document.querySelector(
        'label[for="reservation-terms-accept"]'
      ) as HTMLElement;
      expect(label.textContent).not.toContain("{cancellation}");
      expect(label.textContent).not.toContain("{distanceSales}");
      expect(label.textContent).not.toContain("{privacy}");
      cleanup();
    }
  });
});

describe("10) MEVCUT validasyonlar BOZULMADI", () => {
  it("10a) onay verilse bile eksik alan varsa POST YAPILMAZ", async () => {
    renderForm("tr");
    await waitFor(() =>
      expect(screen.getByText("Havale / EFT")).toBeInTheDocument()
    );
    /* Yalnız checkbox işaretli; zorunlu alanlar BOŞ. */
    fireEvent.click(terms());
    fireEvent.click(submitButton("tr"));
    await new Promise((r) => setTimeout(r, 30));
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    expect(
      calls.some((c) => String(c[0]) === "/api/public/reservations")
    ).toBe(false);
  });
});
