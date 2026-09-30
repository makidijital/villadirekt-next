/* ===============================================================
   🛡️ HAVUZ ISITMA — VillaCardBookingModal fix turu
   ===============================================================
   Hedef: app/components/villa/VillaCardBookingModal.tsx — modal
   BookingSidebar ile AYNI useBookingEngine + AYNI checkbox JSX'i
   kullanıyordu (önceki tur), ama /api/public/villas/[id]/availability
   route'u pool_heating_fee/currency döndürmediği için checkbox HİÇBİR
   ZAMAN görünmüyordu. Bu tur yalnız VERİ ZİNCİRİNİ (repository select
   → route mapping) düzeltti; UI/engine kodu DEĞİŞMEDİ (BookingSidebar.
   pool-heating.test.tsx'te zaten kapsamlı test edildi).

   Burada doğrulanan: modal'ın /availability fetch'inden aldığı
   config.pool_heating_fee/currency değerlerini engine'e doğru
   akıttığı ve gerçek tarih seçimiyle (takvim tıklaması) checkbox'ın
   render olup doğru toplamı gösterdiği — yani UÇTAN UCA veri zinciri.
   Temel hesaplama semantiği (accommodationBase, calculateGrandTotal,
   calculatePoolHeatingFee) burada YENİDEN test EDİLMİYOR (bkz.
   tests/unit/price-engine.test.ts, useBookingEngine.pool-heating.test.ts).

   "No network" house kuralı: global.fetch mock'lanır — hem
   /availability hem /blocked-ranges endpoint'i URL'e göre ayrı yanıt
   döner, gerçek network'e ÇIKMAZ. getPublicSettingsAction mock'lanır.

   TAKVİM ETKİLEŞİMİ: react-day-picker (v8) her gün hücresini
   `role="gridcell"` olan bir `<button name="day">` olarak render eder
   (RTL `getByRole("button")` bunları YAKALAMAZ — explicit gridcell
   role, implicit button role'ü override eder). DayContent custom
   render'ı gün numarasını + gecelik fiyatı YAPIŞIK render eder (örn.
   "20₺4.000") → gün seçimi regex ile (`^${day}₺`) tekil eşleştirilir.
   Sistem saatine bağımlılığı kaldırmak için (test hangi gün çalışırsa
   çalışsın kararlı olsun diye) hedef tarihler HER ZAMAN "gelecek ay"ın
   20. ve 25. günleri — bu yüzden ay `disabled: before today` kuralına
   asla takılmaz ve tam olarak TEK "Sonraki ay" tıklaması yeterli olur. */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import VillaCardBookingModal from "@/app/components/villa/VillaCardBookingModal";

/* Geniş fiyat aralığı — hangi ay render edilirse edilsin (gerçek
   "bugün"e bağlı) kapsar; villa_prices'ın gerçek gecelik ücreti. */
const PRICE_TRY = 4000;

/* 4.000 TL/gece — BookingSidebar.pool-heating.test.tsx ile AYNI
   worked example (stay 20.000 + cleaning 3.500 + pool heating 5.000
   @ 5 gece), böylece iki testin sonuçları çapraz doğrulanabilir. */
function availabilityResponse(poolHeatingFee: number | null) {
  return {
    config: {
      deposit: 0,
      cleaning_fee: 3500,
      cleaning_currency: "TRY",
      cleaning_limit: 0,
      custom_prepayment_rate: 20,
      minimum_stay_nights: null,
      pool_heating_fee: poolHeatingFee,
      pool_heating_currency: "TRY",
    },
    prices: [
      {
        price: PRICE_TRY,
        currency: "TRY",
        start_date: "2020-01-01",
        end_date: "2030-12-31",
      },
    ],
    externalBlocks: { checkin: [], checkout: [], middle: [] },
  };
}

function mockFetch(poolHeatingFee: number | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/availability")) {
        return {
          ok: true,
          json: async () => availabilityResponse(poolHeatingFee),
        };
      }
      if (url.includes("/blocked-ranges")) {
        return { ok: true, json: async () => ({ ok: true, ranges: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch
  );
}

/* Bir "gün" gridcell'ini (button, role=gridcell) gün numarasına göre
   TEKİL bulur — DayContent metni "{gün}{fiyat}" yapışık render eder
   (örn. "20₺4.000"); regex `^${day}₺` iki haneli/tek haneli günleri
   birbirine karıştırmaz (örn. "2" deseni "20"yi YAKALAMAZ). */
function findDayGridcell(day: number): HTMLElement {
  const cells = screen.getAllByRole("gridcell");
  const pattern = new RegExp(`^${day}₺`);
  const match = cells.find((el) => pattern.test(el.textContent || ""));
  if (!match) {
    throw new Error(`Gün ${day} için gridcell bulunamadı`);
  }
  return match;
}

/* Takvimi tam olarak bir ay ileri alır ("Sonraki ay" — BookingCalendar'ın
   kendi custom nav button'ı, RDP'nin dahili nav'ı DEĞİL) sonra 20. ve
   25. günleri check-in/check-out olarak tıklar (5 gece). Hedef ay HER
   ZAMAN "bugün + 1 ay" olduğundan tüm günleri `disabled: before today`
   kuralına asla takılmaz — sistem saatine bakılmaksızın kararlı. */
async function selectFutureDateRange() {
  const nextMonthBtn = screen.getByRole("button", { name: "Sonraki ay" });
  fireEvent.click(nextMonthBtn);

  await waitFor(() => findDayGridcell(20));

  fireEvent.click(findDayGridcell(20));
  fireEvent.click(findDayGridcell(25));
}

async function openModalAndSelectDates(poolHeatingFee: number | null) {
  mockFetch(poolHeatingFee);
  render(
    <VillaCardBookingModal
      isOpen={true}
      onClose={vi.fn()}
      villaId="v1"
      villaSlug="test-villa"
      villaTitle="Test Villa"
    />
  );

  /* Skeleton → apiData yüklenene kadar bekle. ⚠️ Eski sync-point
     ("Tarih seç" placeholder'ı) UI turunda KALDIRILDI (takvim ikonu +
     "Tarih" + "Tarih seç" bloğu); yerine takvimin kendisi (gridcell)
     beklenir. Testin AMACI ve assertion'ları DEĞİŞMEDİ. */
  await screen.findAllByRole("gridcell");

  await selectFutureDateRange();
  // Engine settle olsun (BookingSummary — "Toplam Tutar" satırı result hazır
  // olduğunda render edilir; BookingSidebar.pool-heating.test.tsx'teki AYNI
  // sync-point deseni — modal'da ayrı bir "X gece" metni YOK, bkz. yorum #29).
  await waitFor(() => expect(screen.getByText("Toplam Tutar")).toBeInTheDocument());
}

describe("VillaCardBookingModal — havuz ısıtma veri zinciri (availability API fix)", () => {
  it("1) API config.pool_heating_fee=null → checkbox render edilmez (regresyon)", async () => {
    await openModalAndSelectDates(null);

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
  });

  it("2) API config.pool_heating_fee=1000 + tarih seçili → checkbox görünür, gecelik ücret doğru", async () => {
    await openModalAndSelectDates(1000);

    /* 🛡️ Metin standardizasyonu turu: "Havuz Isıtma" → "Havuz Isıtma
       Ücreti" (yalnız BookingSummary.tsx'teki görünen metin değişti —
       state/handler/hesap AYNEN). */
    expect(
      await screen.findByText("Havuz Isıtma Ücreti")
    ).toBeInTheDocument();
    /* 🛡️ HAVUZ ISITMA — yerleşim turu. Eski "Gece başına ₺1.000" metni
       artık "₺1.000 / gece" (SUMMARY içindeki kompakt satır — bkz.
       BookingSummary.tsx). Yalnız görünen metin/konum değişti; oran
       değeri/kaynağı AYNEN. Regex villa'nın üst özet bandındaki
       (ilgisiz) "₺4.000 / gece" başlangıç fiyatıyla ÇAKIŞMASIN diye
       tutarı da kapsayacak şekilde daraltıldı (yalnız test seçici —
       component'te değişiklik YOK). */
    expect(screen.getByText(/₺1\.000\s*\/\s*gece/)).toBeInTheDocument();
  });

  it("3) checkbox işaretlenince 5 gece × 1.000 TL = 5.000 TL gösterilir (engine — yeniden hesaplanmadı)", async () => {
    await openModalAndSelectDates(1000);

    const checkbox = await screen.findByRole("checkbox", {
      name: /Havuz Isıtma/i,
    });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    await waitFor(() =>
      expect(screen.getByText("₺5.000")).toBeInTheDocument()
    );
    // Toplam Tutar da pool heating'i içerir: 20.000 + 3.500 + 5.000 = 28.500
    // (BookingSummary — BookingSidebar ile AYNI component/engine sonucu).
    await waitFor(() =>
      expect(screen.getByText("₺28.500")).toBeInTheDocument()
    );
  });

  it("4) tarih henüz seçilmemişken (fee>0 olsa bile) checkbox render edilmez", async () => {
    mockFetch(1000);
    render(
      <VillaCardBookingModal
        isOpen={true}
        onClose={vi.fn()}
        villaId="v1"
        villaSlug="test-villa"
        villaTitle="Test Villa"
      />
    );

    /* Sync-point güncellendi (bkz. yukarıdaki not); assertion AYNI. */
    await screen.findAllByRole("gridcell");

    expect(screen.queryByText("Havuz Isıtma")).not.toBeInTheDocument();
  });
});
