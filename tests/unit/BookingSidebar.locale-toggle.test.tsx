/* 🔄 BookingSidebar — Giriş/Çıkış etiketleri + tarih formatı locale'e göre;
   tarih alanı toggle (aynı alana tekrar tıklama takvimi kapatır). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import BookingSidebar from "@/app/components/villa/BookingSidebar";
import type { VillaPriceEmbed } from "@/lib/villa-row.types";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { LOCALE_BCP47, type Locale } from "@/lib/i18n/config";

const PRICES: VillaPriceEmbed[] = [
  { price: 4000, currency: "TRY", start_date: "2026-10-01", end_date: "2026-12-31" },
];

beforeEach(() => {
  cleanup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, ranges: [] }) })) as unknown as typeof fetch
  );
});

const PROPS = {
  villaSlug: "test-villa",
  villaId: "v1",
  prices: PRICES,
  cleaning_fee: 3500,
  cleaning_currency: "TRY",
  custom_prepayment_rate: 20,
  initialStart: "2026-11-05",
  initialEnd: "2026-11-11",
};

const fmt = (d: Date, l: Locale) =>
  d.toLocaleDateString(LOCALE_BCP47[l], { day: "numeric", month: "short" });

describe("BookingSidebar — Giriş/Çıkış çoklu dil", () => {
  const cases: Array<[Locale, string, string]> = [
    ["tr", "Giriş", "Çıkış"],
    ["en", "Check-in", "Check-out"],
    ["de", "Anreise", "Abreise"],
  ];
  for (const [locale, inLabel, outLabel] of cases) {
    it(`${locale}: etiketler + locale'e göre ay adı`, async () => {
      render(<BookingSidebar {...PROPS} locale={locale} />);
      expect(screen.getByText(inLabel)).toBeInTheDocument();
      expect(screen.getByText(outLabel)).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByText(fmt(new Date(2026, 10, 5), locale))).toBeInTheDocument()
      );
      expect(screen.getByText(fmt(new Date(2026, 10, 11), locale))).toBeInTheDocument();
      expect(getDictionary(locale).booking.checkInPillLabel).toBe(inLabel);
    });
  }
});

describe("BookingSidebar — tarih alanı toggle", () => {
  const dateTrigger = () =>
    screen.getByText("Giriş").closest("div.cursor-pointer") as HTMLElement;
  /* Takvim açık durumu: tarih alanı chevron'u (openCalendar state) +
     popover (lazy chunk yüklenince). Chunk ilk soğuk yüklemede yavaş
     olabileceği için popover beklemeleri geniş timeout'lu. */
  const calendarOpen = (c: HTMLElement) =>
    !!dateTrigger().querySelector("svg.rotate-180") &&
    !!c.querySelector(".z-\\[999\\]");
  const calendarClosed = (c: HTMLElement) =>
    !dateTrigger().querySelector("svg.rotate-180") &&
    !c.querySelector(".z-\\[999\\]");
  const T = { timeout: 8000 };

  it("kapalıyken açılır, aynı alana tekrar tıklayınca kapanır, yeniden açılır", async () => {
    const { container } = render(<BookingSidebar {...PROPS} locale="tr" />);
    expect(calendarClosed(container)).toBe(true);
    fireEvent.click(dateTrigger());
    await waitFor(() => expect(calendarOpen(container)).toBe(true), T);
    fireEvent.click(dateTrigger());
    await waitFor(() => expect(calendarClosed(container)).toBe(true), T);
    fireEvent.click(dateTrigger());
    await waitFor(() => expect(calendarOpen(container)).toBe(true), T);
    /* Seçili tarihler korunur */
    expect(screen.getByText(fmt(new Date(2026, 10, 5), "tr"))).toBeInTheDocument();
  });

  it("açıkken misafir alanına geçiş: takvim kapanır (outside-click), misafir paneli açılır", async () => {
    const { container } = render(<BookingSidebar {...PROPS} locale="tr" />);
    fireEvent.click(dateTrigger());
    await waitFor(() => expect(calendarOpen(container)).toBe(true), T);
    const guests = screen.getByText(getDictionary("tr").booking.guestsLabel).closest("div.cursor-pointer") as HTMLElement;
    fireEvent.mouseDown(guests);
    fireEvent.click(guests);
    await waitFor(() => expect(calendarClosed(container)).toBe(true), T);
    expect(screen.getByText(getDictionary("tr").booking.adultsLabel)).toBeInTheDocument();
  });
});

describe("BookingSidebar — rezervasyon datepicker legend'ı", () => {
  const T = { timeout: 8000 };
  it("takvim açıkken 'Onaylı / Beklemede / Müsait' legend'ı GÖSTERİLMEZ", async () => {
    const { container } = render(<BookingSidebar {...PROPS} locale="tr" />);
    fireEvent.click(
      screen.getByText("Giriş").closest("div.cursor-pointer") as HTMLElement
    );
    await waitFor(
      () => expect(container.querySelector("button.rdp-day")).toBeTruthy(),
      T
    );
    const dict = getDictionary("tr");
    expect(screen.queryByText(dict.availability.legendConfirmed)).toBeNull();
    expect(screen.queryByText(dict.availability.legendPending)).toBeNull();
    expect(screen.queryByText(dict.availability.legendAvailable)).toBeNull();
  });
});
