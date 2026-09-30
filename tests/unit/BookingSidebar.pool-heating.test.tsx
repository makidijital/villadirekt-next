/* ===============================================================
   🛡️ HAVUZ ISITMA — 5. adım (public villa detail UI entegrasyonu)
   ===============================================================
   Hedef: app/components/villa/BookingSidebar.tsx — YENİ checkbox UI
   bağlantısı (poolHeatingSelected / setPoolHeatingSelected /
   poolHeatingTotal — useBookingEngine'den, 4. adımda zaten test
   edilmiş durumda). Burada temel hesaplama semantiği YENİDEN test
   EDİLMİYOR (bkz. tests/unit/price-engine.test.ts ve
   tests/unit/useBookingEngine.pool-heating.test.ts) — yalnız UI'ın
   doğru engine değerlerini OKUDUĞU ve setPoolHeatingSelected'i
   DOĞRU tetiklediği doğrulanıyor.

   "No network" house kuralı (tests/setup.ts) korunuyor:
     - global.fetch mock'lanır (blocked-ranges fetch'i gerçek
       network'e ÇIKMAZ, boş ranges döner).
     - getPublicSettingsAction mock'lanır (gerçek DB/RPC'ye ÇIKMAZ).
   CurrencyContext Provider'a SARILMADI — context'in kendi default
   değeri zaten { currency: "TRY", rates: {} } (bkz.
   app/context/CurrencyContext.tsx) — useBookingEngine.pool-heating
   .test.ts ile AYNI gerekçe/desen.

   NOT — tarih seçimi: initialStart/initialEnd yalnız useBookingEngine
   içinde useState LAZY initializer'dır (yalnız ilk render'da okunur).
   Bu yüzden "tarih değişince UI yeni toplamı gösterir" (senaryo 7),
   AYNI takvim etkileşimini (DayPicker) tetiklemek yerine, FARKLI bir
   initialEnd (6 gece) ile TAZE bir mount üzerinden doğrulanıyor —
   gerçek tarih-değişimi reaktivitesi zaten hook seviyesinde
   (useBookingEngine.pool-heating.test.ts, senaryo 3, setEndDate ile)
   test edilmiş durumda. Buradaki amaç: component'in selectedNights/
   poolHeatingTotal için KENDİ gece sayımını YAPMADIĞINI, yalnız
   engine'in ürettiği değerleri render ettiğini kanıtlamak.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import BookingSidebar from "@/app/components/villa/BookingSidebar";
import type { VillaPriceEmbed } from "@/lib/villa-row.types";

/* 4.000 TL/gece — kullanıcı spesifikasyonundaki örnekle birebir aynı
   (stay 20.000 + cleaning 3.500 + pool heating 5.000 @ 5 gece). */
const PRICES: VillaPriceEmbed[] = [
  {
    price: 4000,
    currency: "TRY",
    start_date: "2026-10-01",
    end_date: "2026-12-31",
  },
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

const BASE_PROPS = {
  villaSlug: "test-villa",
  villaId: "v1",
  prices: PRICES,
  cleaning_fee: 3500,
  cleaning_currency: "TRY",
  custom_prepayment_rate: 20,
  initialStart: "2026-10-05",
  initialEnd: "2026-10-10", // 5 gece
};

describe("BookingSidebar — havuz ısıtma UI (5. adım)", () => {
  it("1) pool_heating_fee NULL → seçenek render edilmez", async () => {
    render(
      <BookingSidebar
        {...BASE_PROPS}
        pool_heating_fee={null}
        pool_heating_currency="TRY"
      />
    );

    // Engine settle olsun (SUMMARY göründüğünde result hazır demektir).
    await screen.findByText("Toplam Tutar");

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
  });

  it("2) pool_heating_fee = 0 → seçenek render edilmez", async () => {
    render(
      <BookingSidebar
        {...BASE_PROPS}
        pool_heating_fee={0}
        pool_heating_currency="TRY"
      />
    );

    await screen.findByText("Toplam Tutar");

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
  });

  it("2b) fee>0 ama tarih seçilmemiş → seçenek render edilmez", async () => {
    render(
      <BookingSidebar
        villaSlug="test-villa"
        villaId="v1"
        prices={PRICES}
        cleaning_fee={3500}
        cleaning_currency="TRY"
        pool_heating_fee={1000}
        pool_heating_currency="TRY"
        // initialStart/initialEnd verilmedi → tarih seçilmemiş
      />
    );

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
  });

  it("3) fee=1000 + geçerli tarih → seçenek görünür, oran villa para biriminde", async () => {
    render(
      <BookingSidebar
        {...BASE_PROPS}
        pool_heating_fee={1000}
        pool_heating_currency="TRY"
      />
    );

    /* 🛡️ Metin standardizasyonu turu: "Havuz Isıtma" → "Havuz Isıtma
       Ücreti" (yalnız BookingSummary.tsx'teki görünen metin değişti —
       state/handler/hesap AYNEN). */
    expect(
      await screen.findByText("Havuz Isıtma Ücreti")
    ).toBeInTheDocument();
    /* 🛡️ HAVUZ ISITMA — yerleşim turu. Eski "Gece başına ₺1.000" metni
       artık "₺1.000 / gece" (SUMMARY içindeki kompakt satır — bkz.
       BookingSummary.tsx). Yalnız görünen metin/konum değişti; oran
       değeri/kaynağı AYNEN. */
    expect(screen.getByText(/\/ gece/)).toHaveTextContent("₺1.000");
  });

  it("4) checkbox işaretlenince seçim true olur ve çalışma toplamı görünür", async () => {
    render(
      <BookingSidebar
        {...BASE_PROPS}
        pool_heating_fee={1000}
        pool_heating_currency="TRY"
      />
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: /Havuz Isıtma/i,
    });
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText("₺5.000")).not.toBeInTheDocument();

    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    // 5 gece × 1.000 TL = 5.000 TL (poolHeatingTotal — engine'den, YENİDEN hesaplanmadı)
    await waitFor(() =>
      expect(screen.getByText("₺5.000")).toBeInTheDocument()
    );
    expect(screen.getByText(/5 gece/)).toBeInTheDocument();
  });

  it("5) checkbox işareti kaldırılınca seçim false olur ve çalışma toplamı kaybolur", async () => {
    render(
      <BookingSidebar
        {...BASE_PROPS}
        pool_heating_fee={1000}
        pool_heating_currency="TRY"
      />
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: /Havuz Isıtma/i,
    });

    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    await waitFor(() =>
      expect(screen.getByText("₺5.000")).toBeInTheDocument()
    );

    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(screen.queryByText("₺5.000")).not.toBeInTheDocument();
  });

  it("6) poolHeatingTotal doğru gösterilir (engine değeri — yeniden hesaplanmadı)", async () => {
    render(
      <BookingSidebar
        {...BASE_PROPS}
        pool_heating_fee={1000}
        pool_heating_currency="TRY"
      />
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: /Havuz Isıtma/i,
    });
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(screen.getByText("₺5.000")).toBeInTheDocument()
    );
    // Toplam Tutar da pool heating'i içerir: 20.000 + 3.500 + 5.000 = 28.500
    await waitFor(() =>
      expect(screen.getByText("₺28.500")).toBeInTheDocument()
    );
  });

  it("7) farklı gece sayısı (6 gece) → UI yeni toplamı engine'den gösterir (kendi gece sayımı YOK)", async () => {
    render(
      <BookingSidebar
        villaSlug="test-villa"
        villaId="v1"
        prices={PRICES}
        cleaning_fee={3500}
        cleaning_currency="TRY"
        custom_prepayment_rate={20}
        pool_heating_fee={1000}
        pool_heating_currency="TRY"
        initialStart="2026-10-05"
        initialEnd="2026-10-11" // 6 gece
      />
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: /Havuz Isıtma/i,
    });
    fireEvent.click(checkbox);

    // 6 gece × 1.000 TL = 6.000 TL
    await waitFor(() =>
      expect(screen.getByText("₺6.000")).toBeInTheDocument()
    );
    expect(screen.getByText(/6 gece/)).toBeInTheDocument();
  });

  it("8) havuz ısıtma yokken mevcut rezervasyon UI davranışı bozulmadı (regresyon)", async () => {
    render(
      <BookingSidebar
        {...BASE_PROPS}
        pool_heating_fee={null}
        pool_heating_currency="TRY"
      />
    );

    await screen.findByText("Toplam Tutar");

    // Eski formül: stay(20.000) + cleaning(3.500) = 23.500 — pool heating katkısı YOK.
    expect(screen.getByText("₺23.500")).toBeInTheDocument();
    // Ön ödeme %20 × 20.000 (accommodationBase, cleaning hariç) = 4.000
    expect(screen.getByText("₺4.000")).toBeInTheDocument();
    // CTA hâlâ mevcut ve etkin.
    expect(
      screen.getByRole("button", { name: "Rezervasyon Yap" })
    ).toBeEnabled();
  });
});
