import { parseLocalDate } from "./date-math";

import {
  getActiveDiscount,
  applyDiscountToDailyPrice,
  type DiscountRange,
} from "@/lib/price.engine";

import type { PricingCanvasRange } from "../_types/pricing-calendar";

/* ===============================================================
   🛡️ discount-day-map.ts — ADMIN PRICING CALENDAR İNDİRİM ÖNİZLEMESİ
   ===============================================================
   AMAÇ: Fiyat takvimindeki bir günün fiyatı gösterilirken, o gün için
   aktif bir villa_discounts kaydı varsa nihai (indirimli) gecelik
   fiyatı üretmek — SADECE görsel önizleme, hiçbir DB yazması/reservation
   akışı YOK.

   ⚠️ KESIN KURAL — YENİ HESAPLAMA MANTIĞI YOK:
     Hangi günün hangi indirime girdiği SADECE `getActiveDiscount`
     (lib/price.engine.ts) ile bulunur; nihai fiyat SADECE
     `applyDiscountToDailyPrice` (aynı dosya) ile hesaplanır. Burada
     percent/fixed ayrımı, tarih karşılaştırması vb. TEKRAR YAZILMAZ.

   ⚠️ CURRENCY — GERÇEK KARŞILAŞTIRMA price RANGE'İN currency'Sİ İLE:
   `saveDiscountData` fixed discount.currency'yi villa.currency'ye
   eşitliyor — AMA `applyDiscountToDailyPrice` currency uyumunu
   villa.currency ile DEĞİL, kendisine verilen `daily.original_currency`
   (yani BURADA o günün ait olduğu price RANGE'in `currency` alanı) ile
   karşılaştırıyor. villa_prices'taki bir aralığa (mevcut, bu işten
   ÖNCEKİ, PricingRangeDrawer'ın serbest currency seçimi nedeniyle)
   villa.currency'den FARKLI bir currency girilmiş olabilir. Böyle bir
   günde `discount.currency (=villa.currency) !== range.currency` olur;
   `rates={}` ile bu durumda `convertPrice` sessizce 1:1 fallback kur
   uygulayıp YANLIŞ bir sayı üretirdi.

   ⚠️ FIX — CONVERSION YOK, FAIL-SAFE SKIP VAR:
     Fixed tipte, `applyDiscountToDailyPrice` çağrılmadan ÖNCE
     `discount.currency !== range.currency` kontrol edilir; eşleşmiyorsa
     o gün için discountedPrice ÜRETİLMEZ (map'e hiç girmez) — DayCell
     o günü indirimsizmiş gibi, mevcut normal fiyatıyla göstermeye devam
     eder (sessiz fallback, hata/uyarı YOK). Percent tipte currency
     kavramı yok (`discount.currency` zaten null) — bu kontrol SADECE
     fixed'i etkiler, percent akışı hiç değişmedi. `rates` hâlâ `{}`
     geçiliyor ama artık yalnızca zaten eşleşen (aynı currency)
     durumlarda çağrıldığı için `convertPrice` yine hiç devreye girmiyor
     — currency dönüşümü YAZILMADI, sadece uyumsuz günler ELENIYOR.

   Yalnız fiyatı OLAN günler için hesap yapılır (dayPriceMap üzerinden
   iterate edilir) — fiyatsız bir günde indirim olsa bile gösterilecek
   bir "eski fiyat" olmadığından anlamsızdır (DayCell zaten "—" gösterir).
=============================================================== */

export function buildDayDiscountedPriceMap(
  dayPriceMap: Map<string, PricingCanvasRange>,
  discounts: DiscountRange[]
): Map<string, number> {
  const map = new Map<string, number>();
  if (!Array.isArray(discounts) || discounts.length === 0) {
    return map;
  }

  for (const [key, range] of dayPriceMap.entries()) {
    const date = parseLocalDate(key);
    const discount = getActiveDiscount(date, discounts);
    if (!discount) continue;

    const currency = range.currency || "TRY";

    // 🛡️ FAIL-SAFE — fixed discount'ta currency, o günün price RANGE'iyle
    // BİREBİR aynı olmak zorunda (percent'te discount.currency zaten null,
    // bu kontrol percent'i hiç etkilemez). Uyuşmuyorsa (villa_prices'a
    // villa.currency'den farklı bir currency girilmiş olabilir) sessizce
    // atla — o gün indirimsizmiş gibi normal fiyatıyla kalır. Yeni bir
    // conversion YOK; yalnızca uyumsuz günler hesaba hiç sokulmuyor.
    if (discount.discount_type === "fixed" && discount.currency !== currency) {
      continue;
    }

    const result = applyDiscountToDailyPrice(
      {
        converted: range.price,
        original: range.price,
        original_currency: currency,
      },
      discount,
      currency,
      {}
    );
    map.set(key, result.original);
  }

  return map;
}
