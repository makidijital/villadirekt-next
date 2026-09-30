/* ===============================================================
   🛡️ HAVUZ ISITMA — Admin rezervasyon detay ekranı (PriceCard)
   ===============================================================
   Kapsam: SADECE gösterim (mevcut kayıtların doğru render edilmesi).
   Admin create/edit/recalculate akışı (priceDetail üretimi, page.tsx
   business logic) burada TEST EDİLMİYOR — PriceCard yalnız `data`
   (reservations tablosu snapshot'ı) + `priceDetail` (dışarıdan
   verilen, mock'lanan display state) alıp render eden saf component.

   Doğrulanan davranış:
     1) pool_heating_selected=false → "Havuz Isıtma" satırı YOK,
        "Konaklama" eski formülle (total - cleaning) aynı.
     2) pool_heating_selected=true + pool_heating_total_try>0 →
        "Havuz Isıtma" satırı görünür (₺ TRY karşılığı), "Konaklama"
        satırı pool heating'i de düşer (total - cleaning - poolHeating).
     3) Eski rezervasyon (pool_heating_total_try NULL/undefined,
        pool_heating_selected undefined) → regresyon YOK, satır
        gösterilmez, Konaklama eski davranışla BİREBİR aynı.
=============================================================== */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import PriceCard from "@/app/(admin)/maki-admin/reservations/[id]/_components/PriceCard";

const basePaymentDisplay = {
  payNow: 4000,
  remainingOnArrival: 24500,
  isFullPayment: false,
};

const basePriceDetail = {
  nights: 5,
  cleaning: 3500,
  total: 23500,
};

function renderPriceCard(dataOverrides: Record<string, unknown>) {
  return render(
    <PriceCard
      data={{
        total_price_try: 28500,
        cleaning_fee_try: 3500,
        original_cleaning_currency: "TRY",
        custom_price: false,
        ...dataOverrides,
      }}
      setData={() => {}}
      priceDetail={basePriceDetail}
      paymentDisplay={basePaymentDisplay}
      paymentDisplayPayNowLabel="Ön ödeme (%20)"
      onCustomPriceToggle={() => {}}
      onCustomPriceAmountChange={() => {}}
    />
  );
}

describe("PriceCard — havuz ısıtma gösterimi (admin detay ekranı)", () => {
  it("1) pool_heating_selected=false → 'Havuz Isıtma' satırı render edilmez, Konaklama eski formül", () => {
    renderPriceCard({
      pool_heating_selected: false,
      pool_heating_total_try: 0,
    });

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
    // Konaklama = 28.500 - 3.500 = 25.000 (pool heating katkısı YOK)
    expect(screen.getByText("₺25.000")).toBeInTheDocument();
  });

  it("2) pool_heating_selected=true + total_try=5000 → 'Havuz Isıtma' satırı görünür, Konaklama pool heating'i de düşer", () => {
    renderPriceCard({
      pool_heating_selected: true,
      pool_heating_total_try: 5000,
    });

    /* 🛡️ Metin standardizasyonu turu: "Havuz Isıtma" → "Havuz Isıtma
       Ücreti" (yalnız görünen label metni — hesap/veri AYNEN). */
    expect(screen.getByText("Havuz Isıtma Ücreti")).toBeInTheDocument();
    expect(screen.getByText("₺5.000")).toBeInTheDocument();
    // Konaklama = 28.500 - 3.500 - 5.000 = 20.000
    expect(screen.getByText("₺20.000")).toBeInTheDocument();
  });

  it("3) eski rezervasyon (pool_heating alanları hiç yok) → regresyon yok", () => {
    renderPriceCard({});

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
    // Konaklama = 28.500 - 3.500 = 25.000 (undefined → 0 fallback, eski davranış)
    expect(screen.getByText("₺25.000")).toBeInTheDocument();
  });

  it("4) pool_heating_selected=true ama total_try=0 (fee NULL/0 idi) → satır gösterilmez", () => {
    renderPriceCard({
      pool_heating_selected: true,
      pool_heating_total_try: 0,
    });

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
  });
});
