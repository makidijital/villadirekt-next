/* ===============================================================
   🛡️ HAVUZ ISITMA — Admin canlı fiyat önizlemesi (ÇOK ÖNEMLİ)
   ===============================================================
   Hedef: app/components/admin/reservation-form/LiveDatePriceSummary.tsx
   — hem admin YENİ REZERVASYON (/ekle) hem admin MEVCUT REZERVASYON
   DÜZENLEME ([id]/_components/DateRangeCard.tsx) tarafından paylaşılan
   TEK component. Kapsam: SADECE gösterim — page'in date-change/villa-
   change recalculation'ı burada test EDİLMİYOR (bkz.
   computeReservationPriceRecalc.pool-heating.test.ts ve admin-create
   buildCreateNormalPayload.pool-heating.test.ts) — yalnız component'in
   poolHeatingTRY prop'unu doğru render ettiği + toplam/ön ödeme
   satırlarını bozmadığı doğrulanır.
=============================================================== */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import LiveDatePriceSummary from "@/app/components/admin/reservation-form/LiveDatePriceSummary";

const startDate = new Date("2026-07-01T00:00:00Z");
const endDate = new Date("2026-07-06T00:00:00Z");

function renderSummary(poolHeatingTRY?: number) {
  return render(
    <LiveDatePriceSummary
      startDate={startDate}
      endDate={endDate}
      nights={5}
      stayTRY={20000}
      cleaningTRY={3500}
      poolHeatingTRY={poolHeatingTRY}
      totalTRY={poolHeatingTRY ? 28500 : 23500}
      payNow={poolHeatingTRY ? 4000 : 4000}
      remainingOnArrival={poolHeatingTRY ? 24500 : 19500}
      payNowLabel="Ön ödeme (%20)"
      isFullPayment={false}
      isCustomPrice={false}
      hasForeignCurrency={false}
    />
  );
}

describe("LiveDatePriceSummary — havuz ısıtma canlı önizleme", () => {
  it("1) poolHeatingTRY prop verilmezse (eski caller) — 'Havuz Isıtma' satırı yok, regresyon YOK", () => {
    render(
      <LiveDatePriceSummary
        startDate={startDate}
        endDate={endDate}
        nights={5}
        stayTRY={20000}
        cleaningTRY={3500}
        totalTRY={23500}
        payNow={4000}
        remainingOnArrival={19500}
        payNowLabel="Ön ödeme (%20)"
        isFullPayment={false}
        isCustomPrice={false}
        hasForeignCurrency={false}
      />
    );

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
    expect(screen.getByText("₺23.500")).toBeInTheDocument();
  });

  it("2) poolHeatingTRY=5000 → 'Havuz Isıtma' satırı görünür, Toplam/Ön ödeme worked example ile tutarlı", () => {
    renderSummary(5000);

    /* 🛡️ Metin standardizasyonu turu: "Havuz Isıtma" → "Havuz Isıtma
       Ücreti" (yalnız görünen label metni — hesap/veri AYNEN). */
    expect(screen.getByText("Havuz Isıtma Ücreti")).toBeInTheDocument();
    expect(screen.getByText("₺5.000")).toBeInTheDocument();
    expect(screen.getByText("₺20.000")).toBeInTheDocument(); // Konaklama
    expect(screen.getByText("₺3.500")).toBeInTheDocument(); // Temizlik
    expect(screen.getByText("₺28.500")).toBeInTheDocument(); // Toplam
    expect(screen.getByText("₺4.000")).toBeInTheDocument(); // Ön ödeme
    expect(screen.getByText("₺24.500")).toBeInTheDocument(); // Girişte ödenecek
  });

  it("3) poolHeatingTRY=0 → satır gösterilmez (villa'da ücret yok / seçili değil)", () => {
    renderSummary(0);

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
  });

  it("4) tarih değişince (farklı mount) gece sayısı + toplam güncellenir", () => {
    const { unmount } = renderSummary(5000);
    expect(screen.getByText("5 gece")).toBeInTheDocument();
    unmount();

    render(
      <LiveDatePriceSummary
        startDate={startDate}
        endDate={new Date("2026-07-11T00:00:00Z")}
        nights={10}
        stayTRY={40000}
        cleaningTRY={3500}
        poolHeatingTRY={10000}
        totalTRY={53500}
        payNow={8000}
        remainingOnArrival={45500}
        payNowLabel="Ön ödeme (%20)"
        isFullPayment={false}
        isCustomPrice={false}
        hasForeignCurrency={false}
      />
    );
    expect(screen.getByText("10 gece")).toBeInTheDocument();
    expect(screen.getByText("₺10.000")).toBeInTheDocument();
    expect(screen.getByText("₺53.500")).toBeInTheDocument();
  });
});
