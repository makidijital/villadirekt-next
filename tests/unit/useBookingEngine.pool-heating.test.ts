/* ===============================================================
   🛡️ HAVUZ ISITMA — 4. adım (public booking engine altyapısı)
   ===============================================================
   Hedef: app/components/villa/booking/useBookingEngine.ts — YENİ
   pool heating wiring (poolHeatingSelected/setPoolHeatingSelected/
   poolHeatingTotal + calculateGrandTotal/accommodationBase'e geçirilen
   parametreler). lib/price.engine.ts BU DOSYADA DEĞİŞTİRİLMEDİ —
   burada yalnız hook'un price.engine'i DOĞRU parametrelerle çağırdığı
   doğrulanıyor (temel hesaplama semantiği zaten tests/unit/price-engine
   .test.ts içinde ayrıntılı test edilmiş durumda).

   "No network" house kuralı (tests/setup.ts) korunuyor:
     - global.fetch mock'lanır (reservations/blocked-ranges fetch'i
       gerçek network'e ÇIKMAZ, boş ranges döner).
     - getPublicSettingsAction mock'lanır (gerçek DB/RPC'ye ÇIKMAZ).
   CurrencyContext Provider'a SARILMADI — context'in kendi default
   değeri zaten { currency: "TRY", rates: {} } (bkz.
   app/context/CurrencyContext.tsx), testler TRY display currency
   varsayımıyla yazıldı (conversion'sız, doğrudan karşılaştırılabilir).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
import type { VillaPriceEmbed } from "@/lib/villa-row.types";

/* 4.000 TL/gece — 5 gece × 4.000 = 20.000 TL stay (kullanıcı spesifikasyonundaki
   örnekle birebir aynı: stay 20.000 + cleaning 3.500 + pool heating 5.000). */
const PRICES: VillaPriceEmbed[] = [
  { price: 4000, currency: "TRY", start_date: "2026-10-01", end_date: "2026-12-31" },
];

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
  mockFetchEmptyRanges();
});

describe("useBookingEngine — pool heating (4. adım)", () => {
  it("1) seçim false → poolHeatingTotal = 0", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        pool_heating_fee: 1000,
        pool_heating_currency: "TRY",
        initialStart: "2026-10-05",
        initialEnd: "2026-10-10", // 5 gece
      })
    );

    await waitFor(() => expect(result.current.selectedNights).toBe(5));
    /* URL/prop başlangıç aralığında fiyat, müsaitlik (blocked-ranges)
       doğrulandıktan SONRA hesaplanır (başlangıç aralığı doğrulaması). */
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));

    expect(result.current.poolHeatingSelected).toBe(false);
    expect(result.current.poolHeatingTotal).toBe(0);
    // Mevcut rezervasyon hesapları eskisiyle aynı (senaryo 7): total = stay + cleaning
    expect(result.current.result?.total).toBe(23500);
  });

  it("2) seçim true → 5 gece × 1.000 TL = 5.000 TL", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        pool_heating_fee: 1000,
        pool_heating_currency: "TRY",
        initialStart: "2026-10-05",
        initialEnd: "2026-10-10", // 5 gece
      })
    );

    await waitFor(() => expect(result.current.selectedNights).toBe(5));

    act(() => {
      result.current.setPoolHeatingSelected(true);
    });

    await waitFor(() => expect(result.current.poolHeatingSelected).toBe(true));
    expect(result.current.poolHeatingTotal).toBe(5000);
    expect(result.current.result?.total).toBe(28500); // 20.000 + 3.500 + 5.000
  });

  it("3) tarih değişirse (5 gece → 6 gece) havuz ısıtma otomatik 6.000 TL olmalı", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        pool_heating_fee: 1000,
        pool_heating_currency: "TRY",
        initialStart: "2026-10-05",
        initialEnd: "2026-10-10", // 5 gece
      })
    );

    await waitFor(() => expect(result.current.selectedNights).toBe(5));

    act(() => {
      result.current.setPoolHeatingSelected(true);
    });
    await waitFor(() => expect(result.current.poolHeatingTotal).toBe(5000));

    // 10 Ekim → 11 Ekim (checkout +1 gün) → 6 gece
    act(() => {
      result.current.setEndDate(new Date(2026, 9, 11));
    });

    await waitFor(() => expect(result.current.selectedNights).toBe(6));
    expect(result.current.poolHeatingTotal).toBe(6000);
  });

  it("4) villa değişirse: selection false ve total 0", async () => {
    const { result, rerender } = renderHook(
      (props: { villaId: string }) =>
        useBookingEngine({
          villaSlug: "test-villa",
          villaId: props.villaId,
          prices: PRICES,
          cleaning_fee: 3500,
          cleaning_currency: "TRY",
          pool_heating_fee: 1000,
          pool_heating_currency: "TRY",
          initialStart: "2026-10-05",
          initialEnd: "2026-10-10",
        }),
      { initialProps: { villaId: "v1" } }
    );

    await waitFor(() => expect(result.current.selectedNights).toBe(5));

    act(() => {
      result.current.setPoolHeatingSelected(true);
    });
    await waitFor(() => expect(result.current.poolHeatingTotal).toBe(5000));

    // Villa değişti (yeni villaId prop) → reset effect [villaId] tetiklenir
    rerender({ villaId: "v2" });

    await waitFor(() => expect(result.current.poolHeatingSelected).toBe(false));
    expect(result.current.poolHeatingTotal).toBe(0);
  });

  it("5) pool heating fee NULL/0 → total 0 (seçili olsa dahi)", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        pool_heating_fee: null, // NULL — migration 074 semantiği: hizmet yok
        pool_heating_currency: "TRY",
        initialStart: "2026-10-05",
        initialEnd: "2026-10-10",
      })
    );

    await waitFor(() => expect(result.current.selectedNights).toBe(5));

    act(() => {
      result.current.setPoolHeatingSelected(true);
    });

    // effect flush + re-render bekle
    await waitFor(() => expect(result.current.poolHeatingSelected).toBe(true));
    expect(result.current.poolHeatingTotal).toBe(0);
    expect(result.current.result?.total).toBe(23500); // pool heating katkısı yok
  });

  it("6) prepayment: stay 20.000, cleaning 3.500, pool heating 5.000 → grand 28.500, base 20.000, %20=4.000, kalan 24.500", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        custom_prepayment_rate: 20, // villa-level override → prepaymentRate=20 senkron
        pool_heating_fee: 1000,
        pool_heating_currency: "TRY",
        initialStart: "2026-10-05",
        initialEnd: "2026-10-10", // 5 gece
      })
    );

    await waitFor(() => expect(result.current.prepaymentRate).toBe(20));
    await waitFor(() => expect(result.current.selectedNights).toBe(5));

    act(() => {
      result.current.setPoolHeatingSelected(true);
    });

    await waitFor(() => expect(result.current.poolHeatingTotal).toBe(5000));

    expect(result.current.result?.stay).toBe(20000);
    expect(result.current.result?.cleaning).toBe(3500);
    expect(result.current.result?.total).toBe(28500);
    expect(result.current.prepayment).toBe(4000); // 20.000 × %20
    expect(result.current.result!.total - result.current.prepayment).toBe(24500);
  });

  it("7) havuz ısıtma seçili değilken mevcut rezervasyon hesapları eskisiyle aynı (regresyon kontrolü)", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "test-villa",
        villaId: "v1",
        prices: PRICES,
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        custom_prepayment_rate: 20,
        // pool_heating_fee / pool_heating_currency HİÇ geçilmedi (eski caller senaryosu)
        initialStart: "2026-10-05",
        initialEnd: "2026-10-10",
      })
    );

    await waitFor(() => expect(result.current.prepaymentRate).toBe(20));
    await waitFor(() => expect(result.current.selectedNights).toBe(5));

    expect(result.current.poolHeatingSelected).toBe(false);
    expect(result.current.poolHeatingTotal).toBe(0);
    expect(result.current.result?.stay).toBe(20000);
    expect(result.current.result?.cleaning).toBe(3500);
    expect(result.current.result?.total).toBe(23500); // eski formül: stay+cleaning
    expect(result.current.prepayment).toBe(4000); // accommodationBase(23500,3500,0)=20000 → %20
  });
});
