/* ===============================================================
   🛡️ PHASE 10B, Section 14 — YENİ TESTLER: paylaşılan component'lerin
   locale-aware davranışı + TR default (regresyon) davranışı
   ===============================================================
   Standing "PHASE 10B IMPLEMENTATION" talimatının Section 14 maddesi
   şunu AÇIKÇA istiyor: "TR default behavior (verify all touched
   shared components remain byte-identical for TR when locale prop
   is omitted — critical regression-prevention tests)" + "EN/DE date
   locale" + "booking locale text" + "reservation navigation behavior".

   Bu dosya PriceList / AvailabilityInlineCalendar / BookingCalendar /
   BookingMinStayWarning / BookingSummary / useBookingEngine'i hedefler.
   price.engine.ts / calendar.engine.ts / villa-availability.helper.ts
   İÇİNDE HİÇBİR ŞEY DEĞİŞTİRİLMEDİ — yalnız GERÇEK (mock'lanmamış)
   pure fonksiyonları (calculateGrandTotal, formatDateForLocale)
   kullanılıyor; DB/network'e giden tek nokta (blocked-ranges fetch +
   villa-availability fetch) mock'lanıyor ("No network" house kuralı).
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";

import { formatDateForLocale, formatDateTr } from "@/lib/date-format";
import { calculateGrandTotal } from "@/lib/price.engine";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { PriceRange } from "@/lib/villa-row.types";

import PriceList from "@/app/components/villa/PriceList";
import BookingMinStayWarning from "@/app/components/villa/booking/BookingMinStayWarning";
import BookingSummary from "@/app/components/villa/booking/BookingSummary";
import BookingCalendar from "@/app/components/villa/booking/BookingCalendar";
import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";

/* 🛡️ AvailabilityInlineCalendar — villa-availability.helper'in GERÇEK
   fetch/DB çağrısına gitmesin diye mock'lanıyor (mevcut proje
   convention'ı — bkz. locale-routes.test.tsx'teki benzer mock'lar).
   `villa-availability.helper.ts`'in KENDİSİ DEĞİŞTİRİLMEDİ. */
const fetchAndExpandVillaAvailabilityMock = vi.fn();
vi.mock("@/lib/villa-availability.helper", () => ({
  fetchAndExpandVillaAvailability: (...args: unknown[]) =>
    fetchAndExpandVillaAvailabilityMock(...args),
}));

import AvailabilityInlineCalendar from "@/app/components/villa/AvailabilityInlineCalendar";

/* 🛡️ useBookingEngine — getPublicSettingsAction mock'lanır (gerçek
   DB/RPC'ye ÇIKMAZ), aynı desen tests/unit/useBookingEngine.pool-heating
   .test.ts'te kullanılıyor. */
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

const EMPTY_AVAILABILITY = {
  blockedDates: [],
  checkinDates: [],
  checkoutDates: [],
  pendingCheckinDates: [],
  pendingCheckoutDates: [],
  pendingMiddleDates: [],
  manualBlockedDates: [],
  manualCheckinDates: [],
  manualCheckoutDates: [],
};

function mockFetchEmptyRanges() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, ranges: [] }),
    })) as unknown as typeof fetch
  );
}

beforeEach(() => {
  fetchAndExpandVillaAvailabilityMock.mockReset();
  fetchAndExpandVillaAvailabilityMock.mockResolvedValue(EMPTY_AVAILABILITY);
  mockFetchEmptyRanges();
});

/* ===============================================================
   1) formatDateForLocale — SAF FONKSİYON (lib/date-format.ts)
   =============================================================== */
describe("formatDateForLocale — Phase 10B", () => {
  it("locale='tr' → formatDateTr ile BYTE-IDENTICAL çıktı", () => {
    expect(formatDateForLocale("2026-05-11", "tr")).toBe(
      formatDateTr("2026-05-11")
    );
    expect(formatDateForLocale("2026-05-11", "tr")).toBe("11 May 2026");
  });

  it("locale='en' → İngilizce ay kısaltması", () => {
    expect(formatDateForLocale("2026-10-01", "en")).toBe("1 Oct 2026");
    expect(formatDateForLocale("2026-01-05", "en")).toBe("5 Jan 2026");
  });

  it("locale='de' → Almanca ay kısaltması (Mär/Mai/Okt/Dez TR/EN'den FARKLI)", () => {
    expect(formatDateForLocale("2026-10-01", "de")).toBe("1 Okt 2026");
    expect(formatDateForLocale("2026-03-11", "de")).toBe("11 Mär 2026");
  });

  it("boş/null/undefined değer → '—' (formatDateTr ile aynı fallback, TÜM locale'lerde)", () => {
    expect(formatDateForLocale(null, "en")).toBe("—");
    expect(formatDateForLocale(undefined, "de")).toBe("—");
    expect(formatDateForLocale("", "tr")).toBe("—");
  });
});

/* ===============================================================
   2) PriceList — TR default (regresyon) + EN/DE locale metinleri
   =============================================================== */
describe("PriceList — Phase 10B locale (component visibility + TR default)", () => {
  const OCTOBER_PRICE = [
    {
      id: "p1",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      price: 1000,
      currency: "TRY",
    },
  ];

  it("locale verilmezse (TR default): boş prices → 'Fiyat bilgisi yok' (mevcut TR literal AYNEN)", () => {
    render(<PriceList prices={[]} />);
    expect(screen.getByText("Fiyat bilgisi yok")).toBeInTheDocument();
  });

  it("locale verilmezse (TR default): tarih 'Eki' (Ekim) ay kısaltmasıyla, 'Gecelik' caption'ıyla render edilir", () => {
    render(<PriceList prices={OCTOBER_PRICE} />);
    expect(screen.getByText(/1 Eki 2026/)).toBeInTheDocument();
    expect(screen.getByText(/31 Eki 2026/)).toBeInTheDocument();
    expect(screen.getAllByText("Gecelik").length).toBeGreaterThan(0);
  });

  it("locale='en': boş prices → 'No price information'; tarih 'Oct' ay kısaltmasıyla, caption 'Nightly'", () => {
    render(<PriceList prices={[]} locale="en" />);
    expect(screen.getByText("No price information")).toBeInTheDocument();

    render(<PriceList prices={OCTOBER_PRICE} locale="en" />);
    expect(screen.getByText(/1 Oct 2026/)).toBeInTheDocument();
    expect(screen.getAllByText("Nightly").length).toBeGreaterThan(0);
  });

  it("locale='de': boş prices → 'Keine Preisinformationen'; tarih 'Okt' ay kısaltmasıyla, caption 'Pro Nacht'", () => {
    render(<PriceList prices={[]} locale="de" />);
    expect(
      screen.getByText("Keine Preisinformationen")
    ).toBeInTheDocument();

    render(<PriceList prices={OCTOBER_PRICE} locale="de" />);
    expect(screen.getByText(/1 Okt 2026/)).toBeInTheDocument();
    expect(screen.getAllByText("Pro Nacht").length).toBeGreaterThan(0);
  });

  it("Bilgi butonu aria-label'ı locale'e göre değişir (minStay+deposit verilince görünür)", () => {
    const { unmount } = render(
      <PriceList prices={OCTOBER_PRICE} minimumStayNights={3} deposit={1000} />
    );
    expect(screen.getByLabelText("Bilgi")).toBeInTheDocument();
    unmount();

    render(
      <PriceList
        prices={OCTOBER_PRICE}
        minimumStayNights={3}
        deposit={1000}
        locale="en"
      />
    );
    expect(screen.getByLabelText("Info")).toBeInTheDocument();
  });
});

/* ===============================================================
   3) AvailabilityInlineCalendar — TR default + EN/DE aria-label'lar
   =============================================================== */
describe("AvailabilityInlineCalendar — Phase 10B locale (component visibility + TR default)", () => {
  it("locale verilmezse (TR default): 'Önceki ay'/'Sonraki ay' aria-label'ları AYNEN render edilir", async () => {
    render(<AvailabilityInlineCalendar villaId="v1" prices={[]} />);
    expect(screen.getByLabelText("Önceki ay")).toBeInTheDocument();
    expect(screen.getByLabelText("Sonraki ay")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchAndExpandVillaAvailabilityMock).toHaveBeenCalledWith("v1")
    );
  });

  it("locale='en': 'Previous month'/'Next month'", async () => {
    render(<AvailabilityInlineCalendar villaId="v1" prices={[]} locale="en" />);
    expect(screen.getByLabelText("Previous month")).toBeInTheDocument();
    expect(screen.getByLabelText("Next month")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchAndExpandVillaAvailabilityMock).toHaveBeenCalledWith("v1")
    );
  });

  it("locale='de': 'Vorheriger Monat'/'Nächster Monat'", async () => {
    render(<AvailabilityInlineCalendar villaId="v1" prices={[]} locale="de" />);
    expect(screen.getByLabelText("Vorheriger Monat")).toBeInTheDocument();
    expect(screen.getByLabelText("Nächster Monat")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchAndExpandVillaAvailabilityMock).toHaveBeenCalledWith("v1")
    );
  });
});

/* ===============================================================
   4) BookingCalendar — TR default + EN/DE legend/today + date-fns
      locale seçimi gerçekten değişiyor mu (haftaGünü header'ları
      locale'ler arasında FARKLI mı — snapshot değil, tutarlılık
      kontrolü)
   =============================================================== */
describe("BookingCalendar — Phase 10B locale (component visibility + TR default + date-fns locale)", () => {
  const PRICES: PriceRange[] = [
    { start_date: "2026-01-01", end_date: "2026-12-31", price: 1000, currency: "TRY" },
  ];

  async function setupEngine() {
    const { result } = renderHook(() =>
      useBookingEngine({ villaSlug: "test-villa", villaId: "v1", prices: PRICES })
    );
    await waitFor(() => expect(result.current.selectedNights).toBe(0));
    return result;
  }

  function headCellTexts(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll(".rdp-head_cell")).map(
      (el) => (el.textContent || "").trim()
    );
  }

  it("locale verilmezse (TR default): legend 'Onaylı'/'Beklemede'/'Müsait' + TR nav etiketleri AYNEN render edilir", async () => {
    const engine = await setupEngine();
    render(
      <BookingCalendar
        engine={engine.current}
        currentMonth={new Date(2026, 9, 1)}
        onCurrentMonthChange={() => {}}
      />
    );
    expect(screen.getByText("Onaylı")).toBeInTheDocument();
    expect(screen.getByText("Beklemede")).toBeInTheDocument();
    expect(screen.getByText("Müsait")).toBeInTheDocument();
    /* ⚠️ UI turu: dış "[Ay Yıl … Bugün]" şeridi KALDIRILDI → "Bugün"
       butonu artık YOK. Locale kontratı GEVŞETİLMEDİ, aksine daha güçlü
       doğrulanıyor: ay navigasyonu aria-label'ları MEVCUT TR sözlüğünden
       gelmeye devam ediyor VE takvimin iç caption'ı TR ay adını basıyor. */
    expect(screen.queryByText("Bugün")).toBeNull();
    expect(screen.getByLabelText("Önceki ay")).toBeInTheDocument();
    expect(screen.getByLabelText("Sonraki ay")).toBeInTheDocument();
    expect(
      screen.getByText((t) => /Ekim\s*2026/i.test(t))
    ).toBeInTheDocument();
  });

  it("locale='en': legend 'Confirmed'/'Pending'/'Available' + EN nav etiketleri", async () => {
    const engine = await setupEngine();
    render(
      <BookingCalendar
        engine={engine.current}
        currentMonth={new Date(2026, 9, 1)}
        onCurrentMonthChange={() => {}}
        locale="en"
      />
    );
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    /* Dış "Today" butonu kaldırıldı; EN locale kontratı nav
       aria-label'ları üzerinden (aynı sözlük) doğrulanır. */
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.getByLabelText("Previous month")).toBeInTheDocument();
    expect(screen.getByLabelText("Next month")).toBeInTheDocument();
  });

  it("locale='de': legend 'Bestätigt'/'Ausstehend'/'Verfügbar' + DE nav etiketleri", async () => {
    const engine = await setupEngine();
    render(
      <BookingCalendar
        engine={engine.current}
        currentMonth={new Date(2026, 9, 1)}
        onCurrentMonthChange={() => {}}
        locale="de"
      />
    );
    expect(screen.getByText("Bestätigt")).toBeInTheDocument();
    expect(screen.getByText("Ausstehend")).toBeInTheDocument();
    expect(screen.getByText("Verfügbar")).toBeInTheDocument();
    /* Dış "Heute" butonu kaldırıldı; DE locale kontratı nav
       aria-label'ları üzerinden (aynı sözlük) doğrulanır. */
    expect(screen.queryByText("Heute")).toBeNull();
    expect(screen.getByLabelText("Vorheriger Monat")).toBeInTheDocument();
    expect(screen.getByLabelText("Nächster Monat")).toBeInTheDocument();
  });

  it("date-fns locale seçimi GERÇEKTEN değişiyor: TR/EN/DE hafta günü header'ları birbirinden FARKLI diziler üretir", async () => {
    const engineTr = await setupEngine();
    const { container: containerTr } = render(
      <BookingCalendar
        engine={engineTr.current}
        currentMonth={new Date(2026, 9, 1)}
        onCurrentMonthChange={() => {}}
      />
    );
    const engineEn = await setupEngine();
    const { container: containerEn } = render(
      <BookingCalendar
        engine={engineEn.current}
        currentMonth={new Date(2026, 9, 1)}
        onCurrentMonthChange={() => {}}
        locale="en"
      />
    );
    const engineDe = await setupEngine();
    const { container: containerDe } = render(
      <BookingCalendar
        engine={engineDe.current}
        currentMonth={new Date(2026, 9, 1)}
        onCurrentMonthChange={() => {}}
        locale="de"
      />
    );

    const trHeaders = headCellTexts(containerTr);
    const enHeaders = headCellTexts(containerEn);
    const deHeaders = headCellTexts(containerDe);

    expect(trHeaders.length).toBe(7);
    expect(enHeaders.length).toBe(7);
    expect(deHeaders.length).toBe(7);
    /* `dateFnsLocale` ternary'sinin (tr/enUS/de) GERÇEKTEN DayPicker'a
       geçtiğinin kanıtı — üç dizi birbirinden FARKLI (React-day-picker
       her locale için kendi haftaGünü formatını üretir). Tam string
       eşleşmesi date-fns sürüm/format token'ına kırılgan olacağı için
       BİLEREK hardcode edilmedi; yalnız "locale gerçekten prop'a göre
       değişiyor" doğrulanıyor. */
    expect(trHeaders).not.toEqual(enHeaders);
    expect(enHeaders).not.toEqual(deHeaders);
  });

  it("🔲 gün hücresi: 40×40 / min-width 40 / radius 6 / 10px AYNEN; #E5E7EB çerçeve görünen alana (yanlardan 2px içeride) dört kenarda çizilir", async () => {
    const engine = await setupEngine();
    const { container } = render(
      <BookingCalendar
        engine={engine.current}
        currentMonth={new Date(2026, 9, 1)}
        onCurrentMonthChange={() => {}}
      />
    );
    const buttons = Array.from(
      container.querySelectorAll<HTMLElement>("button.rdp-day")
    );
    expect(buttons.length).toBeGreaterThanOrEqual(28);
    for (const btn of buttons) {
      const cell = btn.firstElementChild as HTMLElement;
      /* Hücre ölçüsü / radius / font AYNEN. */
      expect(cell.style.width).toBe("40px");
      expect(cell.style.height).toBe("40px");
      expect(cell.style.minWidth).toBe("40px");
      expect(cell.style.borderRadius).toBe("6px");
      expect(cell.style.fontSize).toBe("10px");
      /* Çerçeve artık hücrenin KENDİSİNDE değil (RDP içerik alanı 36px →
         yanlar kırpılıyordu); görünen alana oturan overlay'de. */
      expect(cell.style.boxShadow).toBe("");
      expect(cell.style.position).toBe("relative");
      const frame = cell.querySelector<HTMLElement>(
        ':scope > span[aria-hidden="true"]'
      );
      expect(frame).toBeTruthy();
      expect(frame!.style.position).toBe("absolute");
      expect(frame!.style.top).toBe("0px");
      expect(frame!.style.bottom).toBe("0px");
      expect(frame!.style.left).toBe("2px");
      expect(frame!.style.right).toBe("2px");
      expect(frame!.style.borderRadius).toBe("6px");
      expect(frame!.style.boxShadow).toBe("inset 0 0 0 1px #E5E7EB");
      expect(frame!.style.pointerEvents).toBe("none");
      /* Tarih rakamı overlay'in içinde değil — metin/okunabilirlik AYNEN. */
      expect(frame!.textContent).toBe("");
    }
  });
});

/* ===============================================================
   5) BookingMinStayWarning — TR default + EN/DE
   =============================================================== */
describe("BookingMinStayWarning — Phase 10B locale (TR default + EN/DE)", () => {
  it("locale verilmezse (TR default): 'Minimum Konaklama' + gövde metni + 'Seçilen: N gece' AYNEN", () => {
    const { container } = render(
      <BookingMinStayWarning minStayThreshold={3} selectedNights={2} />
    );
    expect(screen.getByText("Minimum Konaklama")).toBeInTheDocument();
    expect(container.textContent).toContain(
      "Bu villa için minimum konaklama süresi"
    );
    expect(container.textContent).toContain("gecedir.");
    expect(container.textContent).toContain("Seçilen: 2 gece");
  });

  it("locale='en': 'Minimum Stay' + 'Selected: 2 nights'", () => {
    const { container } = render(
      <BookingMinStayWarning
        minStayThreshold={3}
        selectedNights={2}
        locale="en"
      />
    );
    expect(screen.getByText("Minimum Stay")).toBeInTheDocument();
    expect(container.textContent).toContain(
      "The minimum stay for this villa is"
    );
    expect(container.textContent).toContain("Selected: 2 nights");
  });

  it("locale='de': 'Mindestaufenthalt' + 'Ausgewählt: 2 Nächte'", () => {
    const { container } = render(
      <BookingMinStayWarning
        minStayThreshold={3}
        selectedNights={2}
        locale="de"
      />
    );
    expect(screen.getByText("Mindestaufenthalt")).toBeInTheDocument();
    expect(container.textContent).toContain(
      "Der Mindestaufenthalt für diese Villa beträgt"
    );
    expect(container.textContent).toContain("Ausgewählt: 2 Nächte");
  });
});

/* ===============================================================
   6) BookingSummary — TR default + EN/DE (yeni shortStayFeeLabel dahil)
   =============================================================== */
describe("BookingSummary — Phase 10B locale (TR default + EN/DE, yeni shortStayFeeLabel key dahil)", () => {
  const PRICES: PriceRange[] = [
    { start_date: "2026-10-01", end_date: "2026-12-31", price: 1000, currency: "TRY" },
  ];

  function buildResult() {
    return calculateGrandTotal({
      start: "2026-10-05",
      end: "2026-10-08", // 3 gece
      prices: PRICES,
      currency: "TRY",
      rates: {},
      cleaning_fee: 500,
      cleaning_currency: "TRY",
      cleaning_limit: 0,
    });
  }

  it("locale verilmezse (TR default): 'Kısa Süreli Konaklama Ücreti' / 'Toplam Tutar' / 'Girişte ödenecek' / 'Hasar Depozitosu' AYNEN", () => {
    const result = buildResult();
    render(
      <BookingSummary
        result={result}
        prepayment={300}
        prepaymentRate={30}
        convertedDeposit={1000}
        deposit={1000}
      />
    );
    expect(
      screen.getByText("Kısa Süreli Konaklama Ücreti")
    ).toBeInTheDocument();
    expect(screen.getByText("Toplam Tutar")).toBeInTheDocument();
    expect(screen.getByText("Girişte ödenecek")).toBeInTheDocument();
    expect(screen.getByText("Hasar Depozitosu")).toBeInTheDocument();
    expect(
      screen.getByText(/Konaklama Tutarı \(3 Gece\)/)
    ).toBeInTheDocument();
  });

  it("locale='en': 'Short-Stay Fee' / 'Total Amount' / 'Due at Check-in' / 'Damage Deposit'", () => {
    const result = buildResult();
    render(
      <BookingSummary
        result={result}
        prepayment={300}
        prepaymentRate={30}
        convertedDeposit={1000}
        deposit={1000}
        locale="en"
      />
    );
    expect(screen.getByText("Short-Stay Fee")).toBeInTheDocument();
    expect(screen.getByText("Total Amount")).toBeInTheDocument();
    expect(screen.getByText("Due at Check-in")).toBeInTheDocument();
    expect(screen.getByText("Damage Deposit")).toBeInTheDocument();
    expect(
      screen.getByText(/Accommodation Total \(3 Nights\)/)
    ).toBeInTheDocument();
  });

  it("locale='de': 'Kurzaufenthaltsgebühr' / 'Gesamtbetrag' / 'Bei Anreise fällig' / 'Kaution'", () => {
    const result = buildResult();
    render(
      <BookingSummary
        result={result}
        prepayment={300}
        prepaymentRate={30}
        convertedDeposit={1000}
        deposit={1000}
        locale="de"
      />
    );
    expect(screen.getByText("Kurzaufenthaltsgebühr")).toBeInTheDocument();
    expect(screen.getByText("Gesamtbetrag")).toBeInTheDocument();
    expect(screen.getByText("Bei Anreise fällig")).toBeInTheDocument();
    expect(screen.getByText("Kaution")).toBeInTheDocument();
    expect(
      screen.getByText(/Unterkunftsbetrag \(3 Nächte\)/)
    ).toBeInTheDocument();
  });
});

/* ===============================================================
   7) useBookingEngine — reservationError locale metinleri +
      handleReservation navigation URL '&locale=' davranışı
      (Section 7'nin YATIRIMI — TR byte-identical, EN/DE ek param)

      🔄 GÜNCELLEME (navigation locale kaybı düzeltmesi):
      Bu testler yazıldığında `/en|/de/rezervasyon/[slug]` route'ları
      `LocaleRouteComingSoon` placeholder'ıydı; bu yüzden EN/DE hedefi
      bilinçli olarak PREFİX'SİZ TR route'uydu. O route'lar artık gerçek
      gövdeyi render ettiği için hedef `localeHref` ile prefix'lenir.
      `&locale=` param'ı davranışı AYNEN KORUNDU (aşağıda ayrıca
      `toContain` ile doğrulanıyor); TR beklentisi DEĞİŞMEDİ.
   =============================================================== */
describe("useBookingEngine — Phase 10B locale (reservationError metinleri)", () => {
  const PRICES: PriceRange[] = [
    { start_date: "2026-01-01", end_date: "2026-12-31", price: 1000, currency: "TRY" },
  ];

  it("locale verilmezse (TR default): tarih seçilmeden handleReservation → 'Lütfen tarih seçiniz.'", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({ villaSlug: "test-villa", villaId: "v1", prices: PRICES })
    );
    await waitFor(() => expect(result.current.selectedNights).toBe(0));

    act(() => {
      result.current.handleReservation();
    });

    expect(result.current.reservationError).toBe("Lütfen tarih seçiniz.");
  });

  it("locale='en': 'Please select your dates.'", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        locale: "en",
      })
    );
    await waitFor(() => expect(result.current.selectedNights).toBe(0));

    act(() => {
      result.current.handleReservation();
    });

    expect(result.current.reservationError).toBe(
      "Please select your dates."
    );
  });

  it("locale='de': 'Bitte wählen Sie ein Datum.'", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        locale: "de",
      })
    );
    await waitFor(() => expect(result.current.selectedNights).toBe(0));

    act(() => {
      result.current.handleReservation();
    });

    expect(result.current.reservationError).toBe(
      "Bitte wählen Sie ein Datum."
    );
  });

  it("min-stay hata mesajı locale-aware ('en' → 'Minimum stay is {n} nights.' benzeri, gerçek dict metniyle)", async () => {
    const dict = getDictionary("en");
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        minimum_stay_nights: 5,
        initialStart: "2026-10-05",
        initialEnd: "2026-10-07", // 2 gece — 5'ten az
        locale: "en",
      })
    );
    await waitFor(() => expect(result.current.selectedNights).toBe(2));
    expect(result.current.minimumStayValid).toBe(false);

    act(() => {
      result.current.handleReservation();
    });

    expect(result.current.reservationError).toBe(
      dict.booking.reservationErrorMinStay.replace("{n}", "5")
    );
  });
});

describe("useBookingEngine — Phase 10B handleReservation navigation URL '&locale=' davranışı", () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // @ts-expect-error - test-only: window.location gerçek navigation
    // yapmadan href assignment'ı yakalamak için düz bir objeyle
    // değiştiriliyor (jsdom gerçek navigasyonu desteklemiyor).
    delete window.location;
    // @ts-expect-error - bkz. yukarı yorum.
    window.location = { href: "" };
  });

  afterEach(() => {
    // @ts-expect-error - test-only: bkz. beforeEach yorumu.
    window.location = originalLocation;
  });

  it("TR'de (locale verilmemiş): URL'e HİÇ '&locale=' EKLENMEZ — mevcut format BYTE-IDENTICAL", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: [
          { start_date: "2026-01-01", end_date: "2026-12-31", price: 1000, currency: "TRY" },
        ],
        initialStart: "2026-10-05",
        initialEnd: "2026-10-08",
      })
    );
    await waitFor(() => expect(result.current.selectedNights).toBe(3));
    /* Başlangıç aralığı müsaitliği doğrulanana kadar rezervasyona
       geçilmez (useBookingEngine başlangıç aralığı doğrulaması). */
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));

    act(() => {
      result.current.handleReservation();
    });

    expect(window.location.href).toBe(
      "/rezervasyon/test-villa?start=2026-10-05&end=2026-10-08&adults=2&children=0&poolHeating=0"
    );
    expect(window.location.href).not.toContain("locale=");
  });

  it("locale='en': URL'e '&locale=en' EKLENİR", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: [
          { start_date: "2026-01-01", end_date: "2026-12-31", price: 1000, currency: "TRY" },
        ],
        initialStart: "2026-10-05",
        initialEnd: "2026-10-08",
        locale: "en",
      })
    );
    await waitFor(() => expect(result.current.selectedNights).toBe(3));
    /* Başlangıç aralığı müsaitliği doğrulanana kadar rezervasyona
       geçilmez (useBookingEngine başlangıç aralığı doğrulaması). */
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));

    act(() => {
      result.current.handleReservation();
    });

    /* `&locale=en` EKLENİR (bu testin ASIL iddiası — korundu). */
    expect(window.location.href).toContain("&locale=en");
    /* Hedef artık EN route'u (locale kaybı düzeltmesi). */
    expect(window.location.href).toBe(
      "/en/rezervasyon/test-villa?start=2026-10-05&end=2026-10-08&adults=2&children=0&poolHeating=0&locale=en"
    );
  });

  it("locale='de': URL'e '&locale=de' EKLENİR", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: [
          { start_date: "2026-01-01", end_date: "2026-12-31", price: 1000, currency: "TRY" },
        ],
        initialStart: "2026-10-05",
        initialEnd: "2026-10-08",
        locale: "de",
      })
    );
    await waitFor(() => expect(result.current.selectedNights).toBe(3));
    /* Başlangıç aralığı müsaitliği doğrulanana kadar rezervasyona
       geçilmez (useBookingEngine başlangıç aralığı doğrulaması). */
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));

    act(() => {
      result.current.handleReservation();
    });

    /* `&locale=de` EKLENİR (bu testin ASIL iddiası — korundu). */
    expect(window.location.href).toContain("&locale=de");
    /* Hedef artık DE route'u (locale kaybı düzeltmesi). */
    expect(window.location.href).toBe(
      "/de/rezervasyon/test-villa?start=2026-10-05&end=2026-10-08&adults=2&children=0&poolHeating=0&locale=de"
    );
  });
});
