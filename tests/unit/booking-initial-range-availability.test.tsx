/* ===============================================================
   🛡️ BAŞLANGIÇ ARALIĞI MÜSAİTLİK DOĞRULAMASI — REGRESYON KİLİDİ
   ===============================================================
   URL'den (normal/esnek arama, paylaşılan link) ya da
   VillaCardBookingModal'dan gelen initialStart/initialEnd aralığında
   dolu gece varsa:
     - seçim tüketicilere BOŞ verilir (dolu gün seçili kalmaz),
     - fiyat/özet oluşmaz, /rezervasyon'a yönlendirme olmaz,
     - MEVCUT `dict.booking.conflictError` mesajı gösterilir.
   Müsaitlik yüklenene kadar fiyat hesaplanmaz, CTA bekler.
   Temiz aralıkta mevcut davranış BİREBİR korunur.

   Senaryolar (kullanıcı spesifikasyonu):
     A) temiz 09–12            E) external block
     B) 09 dolu, 10–12 müsait  F) müsaitlik yüklenmeden
     C) aralık içi gece dolu   G) normal müsait tarih (eski davranış)
     D) manuel blok            H) VillaCardBookingModal
     I) TR / EN / DE mesajı
   Tarihler sistem saatinden bağımsız: "bugün + 2 ay" ayının günleri.
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
import BookingSidebar from "@/app/components/villa/BookingSidebar";
import VillaCardBookingModal from "@/app/components/villa/VillaCardBookingModal";
import type { VillaPriceEmbed } from "@/lib/villa-row.types";
import type { ExternalCalendarStringArrays } from "@/lib/external-calendar.public.shared";

/* ---------------- tarih yardımcıları ---------------- */
const base = new Date();
base.setDate(1);
base.setMonth(base.getMonth() + 2);
const Y = base.getFullYear();
const M = base.getMonth();
const ymd = (day: number) =>
  `${Y}-${String(M + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const S = ymd(9); // arama başlangıcı
const E = ymd(12); // arama çıkışı (3 gece)

const PRICES: VillaPriceEmbed[] = [
  { price: 5000, currency: "TRY", start_date: "2020-01-01", end_date: "2035-12-31" },
];

type Range = {
  kind: "reservation" | "manual";
  status: string | null;
  start_date: string;
  end_date: string;
};

/* blocked-ranges fetch'i: verilen aralıklar veya elle çözülen promise. */
let rangesImpl: () => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
function setRanges(ranges: Range[]) {
  rangesImpl = async () => ({ ok: true, json: async () => ({ ok: true, ranges }) });
}

function modalAvailability(external?: ExternalCalendarStringArrays) {
  return {
    config: {
      deposit: 0,
      cleaning_fee: 0,
      cleaning_currency: "TRY",
      cleaning_limit: 0,
      custom_prepayment_rate: 0,
      minimum_stay_nights: null,
      pool_heating_fee: null,
      pool_heating_currency: "TRY",
      pool_heating_months: null,
    },
    prices: PRICES,
    externalBlocks: external ?? { checkin: [], checkout: [], middle: [] },
  };
}

/* ---------------- window.location.href casusu ---------------- */
const hrefSet = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  hrefSet.mockReset();
  setRanges([]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/availability")) {
        return { ok: true, json: async () => modalAvailability() };
      }
      if (url.includes("/blocked-ranges")) return rangesImpl();
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch
  );
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...originalLocation,
      get href() {
        return "http://localhost/";
      },
      set href(v: string) {
        hrefSet(v);
      },
    },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.unstubAllGlobals();
});

function renderEngine(extra: Partial<Parameters<typeof useBookingEngine>[0]> = {}) {
  return renderHook(() =>
    useBookingEngine({
      villaSlug: "test-villa",
      villaId: "v1",
      prices: PRICES,
      initialStart: S,
      initialEnd: E,
      ...extra,
    })
  );
}

const TR_CONFLICT = "Bu tarih aralığı dolu gün içeriyor";

/* ===============================================================
   ENGINE
   =============================================================== */
describe("useBookingEngine — başlangıç aralığı", () => {
  it("A/G) temiz 09–12: seçim kalır, fiyat hesaplanır, rezervasyona gidilir", async () => {
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));

    expect(result.current.startDate?.getDate()).toBe(9);
    expect(result.current.endDate?.getDate()).toBe(12);
    expect(result.current.initialRangeConflict).toBe(false);
    expect(result.current.result?.total).toBe(15000);
    expect(result.current.reservationError).toBeNull();

    act(() => result.current.handleReservation());
    expect(hrefSet).toHaveBeenCalledTimes(1);
    expect(hrefSet.mock.calls[0][0]).toBe(
      `/rezervasyon/test-villa?start=${S}&end=${E}&adults=2&children=0&poolHeating=0`
    );
  });

  it("G) çıkış günü başka rezervasyonun girişi / giriş günü başkasının çıkışı → müsait", async () => {
    setRanges([
      { kind: "reservation", status: "confirmed", start_date: ymd(5), end_date: ymd(9) },
      { kind: "reservation", status: "confirmed", start_date: ymd(12), end_date: ymd(15) },
    ]);
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    expect(result.current.initialRangeConflict).toBe(false);
    expect(result.current.startDate?.getDate()).toBe(9);
    expect(result.current.result?.total).toBe(15000);
  });

  it("B) 09 dolu (onaylı rezervasyonun ara günü), 10–12 müsait → seçim geçersiz", async () => {
    setRanges([
      { kind: "reservation", status: "confirmed", start_date: ymd(5), end_date: ymd(10) },
    ]);
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.initialRangeConflict).toBe(true));

    expect(result.current.startDate).toBeNull();
    expect(result.current.endDate).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.priceUnavailable).toBe(false);
    expect(result.current.reservationError).toBe(TR_CONFLICT);

    act(() => result.current.handleReservation());
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it("C) aralık içindeki herhangi bir gece dolu → tüm aralık geçersiz", async () => {
    setRanges([
      { kind: "reservation", status: "confirmed", start_date: ymd(10), end_date: ymd(12) },
    ]);
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.initialRangeConflict).toBe(true));
    expect(result.current.startDate).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it("C) 1 gecelik rezervasyon (ara günü yok) aralığın içinde → geçersiz", async () => {
    setRanges([
      { kind: "reservation", status: "confirmed", start_date: ymd(10), end_date: ymd(11) },
    ]);
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.initialRangeConflict).toBe(true));
    expect(result.current.startDate).toBeNull();
  });

  it("D) manuel blok → aynı davranış", async () => {
    setRanges([{ kind: "manual", status: null, start_date: ymd(7), end_date: ymd(10) }]);
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.initialRangeConflict).toBe(true));
    expect(result.current.startDate).toBeNull();
    expect(result.current.result).toBeNull();
    act(() => result.current.handleReservation());
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it("E) external (iCal) blok — mergedBlockedDates'e dahil → aynı davranış", async () => {
    const { result } = renderEngine({
      externalBlocks: { checkin: [ymd(8)], middle: [ymd(9)], checkout: [ymd(10)] },
    });
    await waitFor(() => expect(result.current.initialRangeConflict).toBe(true));
    expect(result.current.startDate).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it("F) müsaitlik yüklenmeden: fiyat yok, rezervasyona geçilmez; yüklenince normal", async () => {
    let resolve!: (v: { ok: boolean; json: () => Promise<unknown> }) => void;
    rangesImpl = () => new Promise((r) => (resolve = r));
    const { result } = renderEngine();

    expect(result.current.availabilityPending).toBe(true);
    expect(result.current.startDate?.getDate()).toBe(9); // tarih görünür
    expect(result.current.result).toBeNull(); // fiyat kesinleşmez
    act(() => result.current.handleReservation());
    expect(hrefSet).not.toHaveBeenCalled();
    expect(result.current.reservationError).toBeNull();

    await act(async () => {
      resolve({ ok: true, json: async () => ({ ok: true, ranges: [] }) });
    });
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    expect(result.current.result?.total).toBe(15000);
  });

  it("F) müsaitlik alınamazsa MEVCUT fail-open davranış (server doğrulaması geçerli)", async () => {
    rangesImpl = async () => ({ ok: false, json: async () => ({}) });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    expect(result.current.startDate?.getDate()).toBe(9);
    expect(result.current.result?.total).toBe(15000);
    errSpy.mockRestore();
  });

  it("çakışmadan sonra kullanıcı yeni (müsait) aralık seçince normal akış", async () => {
    setRanges([{ kind: "manual", status: null, start_date: ymd(7), end_date: ymd(10) }]);
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.initialRangeConflict).toBe(true));

    act(() => {
      result.current.setStartDate(new Date(Y, M, 10));
      result.current.setEndDate(new Date(Y, M, 13));
    });
    expect(result.current.initialRangeConflict).toBe(false);
    expect(result.current.startDate?.getDate()).toBe(10);
    expect(result.current.result?.total).toBe(15000);
    expect(result.current.reservationError).toBeNull();
    act(() => result.current.handleReservation());
    expect(hrefSet.mock.calls[0][0]).toContain(`start=${ymd(10)}&end=${ymd(13)}`);
  });

  it("başlangıç tarihi yoksa: bekleme/çakışma bayrağı hiç devreye girmez", async () => {
    const { result } = renderEngine({ initialStart: null, initialEnd: null });
    expect(result.current.availabilityPending).toBe(false);
    expect(result.current.initialRangeConflict).toBe(false);
    expect(result.current.startDate).toBeNull();
  });

  it("pending rezervasyon davranışı DEĞİŞMEDİ (merged kümelere girmez)", async () => {
    setRanges([
      { kind: "reservation", status: "pending", start_date: ymd(8), end_date: ymd(11) },
    ]);
    const { result } = renderEngine();
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    expect(result.current.initialRangeConflict).toBe(false);
    expect(result.current.startDate?.getDate()).toBe(9);
  });

  it("handleReservation son kapı: kullanıcı seçimi dolu gece içeriyorsa yönlendirme yok", async () => {
    setRanges([
      { kind: "reservation", status: "confirmed", start_date: ymd(10), end_date: ymd(11) },
    ]);
    const { result } = renderEngine({ initialStart: null, initialEnd: null });
    await waitFor(() => expect(result.current.mergedCheckinDates.length).toBe(1));
    act(() => {
      result.current.setStartDate(new Date(Y, M, 9));
      result.current.setEndDate(new Date(Y, M, 12));
    });
    act(() => result.current.handleReservation());
    expect(hrefSet).not.toHaveBeenCalled();
    expect(result.current.reservationError).toBe(TR_CONFLICT);
  });
});

/* ===============================================================
   BookingSidebar (villa detay — TR/EN/DE, mobil CTA aynı sidebar'a kayar)
   =============================================================== */
describe("BookingSidebar", () => {
  const props = {
    villaSlug: "test-villa",
    villaId: "v1",
    prices: PRICES,
    initialStart: S,
    initialEnd: E,
  };

  it("B) dolu başlangıç: tarih seçili değil, özet yok, mesaj var, tıklama yönlendirmez", async () => {
    setRanges([{ kind: "manual", status: null, start_date: ymd(7), end_date: ymd(10) }]);
    render(<BookingSidebar {...props} />);
    await screen.findByText(TR_CONFLICT);
    expect(screen.queryByText(/Toplam Tutar/)).toBeNull();
    expect(screen.queryByText(/9 (Haz|Oca|Şub|Mar|Nis|May|Tem|Ağu|Eyl|Eki|Kas|Ara)/)).toBeNull();
    const cta = screen.getByRole("button", { name: "Rezervasyon Yap" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    fireEvent.click(cta);
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it("B) çakışmadan sonra takvim aranan ayda açılır (bugünün ayına düşmez), seçili gün yok", async () => {
    setRanges([{ kind: "manual", status: null, start_date: ymd(7), end_date: ymd(10) }]);
    const { container } = render(<BookingSidebar {...props} />);
    await screen.findByText(TR_CONFLICT);
    fireEvent.click(container.querySelector("#booking-date-field > div") as HTMLElement);
    const monthName = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(
      new Date(Y, M, 1)
    );
    await waitFor(() =>
      expect(container.textContent || "").toMatch(
        new RegExp(`${monthName}\\s*${Y}`, "i")
      )
    );
    expect(container.querySelectorAll(".rdp-day_selected").length).toBe(0);
  });

  it("F) müsaitlik yüklenirken CTA disabled ve özet yok; temiz çıkınca aktif + özet", async () => {
    let resolve!: (v: { ok: boolean; json: () => Promise<unknown> }) => void;
    rangesImpl = () => new Promise((r) => (resolve = r));
    render(<BookingSidebar {...props} />);
    const cta = screen.getByRole("button", { name: "Rezervasyon Yap" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(screen.queryByText(/Toplam Tutar/)).toBeNull();

    await act(async () => {
      resolve({ ok: true, json: async () => ({ ok: true, ranges: [] }) });
    });
    await screen.findByText(/Toplam Tutar/);
    expect(cta.disabled).toBe(false);
  });

  it("B) çakışmadan sonra kullanıcı takvimden müsait aralık seçince CTA tekrar aktif", async () => {
    setRanges([{ kind: "manual", status: null, start_date: ymd(7), end_date: ymd(10) }]);
    const { container } = render(<BookingSidebar {...props} />);
    await screen.findByText(TR_CONFLICT);
    fireEvent.click(container.querySelector("#booking-date-field > div") as HTMLElement);
    const day = async (n: number) => {
      const cells = await screen.findAllByRole("gridcell");
      const cell = cells.find((el) => new RegExp(`^${n}₺`).test(el.textContent || ""));
      if (!cell) throw new Error(`gün ${n} yok`);
      return cell;
    };
    fireEvent.click(await day(14));
    fireEvent.click(await day(17));
    await screen.findByText(/Toplam Tutar/);
    const cta = screen.getByRole("button", { name: "Rezervasyon Yap" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    expect(screen.queryByText(TR_CONFLICT)).toBeNull();
    fireEvent.click(cta);
    expect(hrefSet.mock.calls[0][0]).toContain(`start=${ymd(14)}&end=${ymd(17)}`);
  });

  it("I) EN / DE: mevcut locale sözlüğünün conflictError metni", async () => {
    setRanges([{ kind: "manual", status: null, start_date: ymd(7), end_date: ymd(10) }]);
    const { unmount } = render(<BookingSidebar {...props} locale="en" />);
    await screen.findByText("This date range contains unavailable days");
    unmount();
    render(<BookingSidebar {...props} locale="de" />);
    await screen.findByText("Dieser Zeitraum enthält nicht verfügbare Tage");
  });
});

/* ===============================================================
   H) VillaCardBookingModal (/arama kartı — normal ve esnek sonuç)
   =============================================================== */
describe("VillaCardBookingModal", () => {
  function renderModal() {
    return render(
      <VillaCardBookingModal
        isOpen={true}
        onClose={vi.fn()}
        villaId="v1"
        villaSlug="test-villa"
        villaTitle="Test Villa"
        initialStart={S}
        initialEnd={E}
      />
    );
  }

  it("H) dolu başlangıç: mesaj, seçili gün yok, özet yok, yönlendirme yok", async () => {
    setRanges([{ kind: "manual", status: null, start_date: ymd(7), end_date: ymd(10) }]);
    const { container } = renderModal();
    await screen.findByText(TR_CONFLICT);
    expect(container.querySelectorAll(".rdp-day_selected").length).toBe(0);
    expect(screen.queryByText(/Konaklama Tutarı/)).toBeNull();
    const cta = screen.getByRole("button", { name: "Rezervasyon Yap" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    fireEvent.click(cta);
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it("H) temiz başlangıç: mevcut davranış (seçili + özet + yönlendirme)", async () => {
    const { container } = renderModal();
    await screen.findByText("Konaklama Tutarı (3 Gece)");
    expect(container.querySelectorAll(".rdp-day_selected").length).toBeGreaterThan(0);
    expect(screen.queryByText(TR_CONFLICT)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Rezervasyon Yap" }));
    expect(hrefSet).toHaveBeenCalledTimes(1);
  });
});
