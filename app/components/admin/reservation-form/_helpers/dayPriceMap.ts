/* ===============================================================
   🛡️ dayPriceMap — ADMIN REZERVASYON TAKVİMİ GÜNLÜK FİYAT HARİTASI
   ===============================================================
   AMAÇ: 3 aylık takvimde her gün hücresine "normal fiyat" ve (varsa)
   "indirimli fiyat" dağıtmak. SALT GÖSTERİM.

   ⚠️ YENİ FİYAT/İNDİRİM MOTORU YOK — hepsi `lib/price.engine.ts`'in
     ZATEN export ettiği pure fonksiyonlar:
       getDailyPrice(date, prices, currency, rates)
         → PUBLIC `useBookingEngine.getPriceForDate` ile AYNI kapalı
           interval semantiği (start_date/end_date İKİSİ DE DAHİL) ve
           AYNI `convertPrice` dönüşümü. `calculateGrandTotal` de
           gecelik fiyatı bu fonksiyondan alır → takvim ile toplam
           AYNI kaynaktan beslenir.
       getActiveDiscount(date, discounts)
       applyDiscountToDailyPrice(daily, discount, currency, rates)
         → PUBLIC `useBookingEngine.getDiscountedPriceForDate` ve
           `PriceList.tsx` ile BİREBİR AYNI desen.

   ⚠️ "SAHTE İNDİRİM" KORUMASI — public ile birebir: indirimli tutar
     normal tutardan GERÇEKTEN düşük değilse `discounted` üretilmez
     (public `getDiscountedPriceForDate`'in son satırındaki kuralın
     aynısı). Böylece iki tarafta aynı gün için aynı sonuç çıkar.

   ⚠️ PERFORMANS: hücre başına DB/API sorgusu YOK. Tüm görünür günler
     için TEK seferde `Map<"YYYY-MM-DD", DayPrice>` üretilir; çağıran
     bunu `useMemo` ile sarar. `prices`/`discounts` dizileri zaten
     sayfada mevcut (villa seçilince TEK fetch ile gelir).

   ⚠️ Fiyatı olmayan gün haritaya HİÇ girmez → hücre mevcut (fiyatsız)
     görünümünde kalır.
=============================================================== */

import {
  getDailyPrice,
  getActiveDiscount,
  applyDiscountToDailyPrice,
  type DiscountRange,
} from "@/lib/price.engine";

/** `getDailyPrice`'ın beklediği minimum satır şekli (villa_prices). */
export type DayPriceRange = {
  start_date: string;
  end_date: string;
  price: number;
  currency?: string | null;
};

export type DayPrice = {
  /** Normal (indirimsiz) gecelik fiyat — display currency'ye çevrilmiş. */
  price: number;
  /** İndirimli gecelik fiyat; indirim yoksa/gerçekten düşük değilse null. */
  discounted: number | null;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Verilen günler için fiyat haritası üretir.
 * @param days       Takvimde görünen tüm günler (3 ay × 42 hücre gibi).
 * @param prices     villa_prices satırları (admin sayfasında zaten var).
 * @param discounts  villa_discounts → DiscountRange[] (aynı fetch'ten).
 * @param currency   Admin görüntüleme para birimi (mevcut davranış: "TRY").
 * @param rates      /api/exchange-rates çıktısı (admin sayfasında zaten var).
 */
export function buildDayPriceMap(
  days: ReadonlyArray<Date>,
  prices: ReadonlyArray<DayPriceRange> | null | undefined,
  discounts: ReadonlyArray<DiscountRange> | null | undefined,
  currency: string,
  rates: Record<string, number>
): Map<string, DayPrice> {
  const map = new Map<string, DayPrice>();
  if (!Array.isArray(prices) || prices.length === 0) return map;

  const priceRows = prices as DayPriceRange[];
  const discountRows =
    Array.isArray(discounts) && discounts.length > 0
      ? (discounts as DiscountRange[])
      : null;

  for (const date of days) {
    const key = ymd(date);
    if (map.has(key)) continue;

    /* price.engine — fiyatsız gün `converted: 0` döner. */
    const daily = getDailyPrice(date, priceRows as never, currency, rates);
    if (!daily || !(daily.converted > 0)) continue;

    let discounted: number | null = null;
    const activeDiscount = discountRows
      ? getActiveDiscount(date, discountRows)
      : null;

    if (activeDiscount) {
      const result = applyDiscountToDailyPrice(
        daily,
        activeDiscount,
        currency,
        rates
      );
      /* Public ile AYNI guard: yalnız GERÇEKTEN düşükse indirim say. */
      discounted = result.converted < daily.converted ? result.converted : null;
    }

    map.set(key, { price: daily.converted, discounted });
  }

  return map;
}
