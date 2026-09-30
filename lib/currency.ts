import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  type Locale,
} from "@/lib/i18n/config";

/* ===============================================================
   🛡️ SAFE RATE RESOLVER (Faz 2A)
   ===============================================================
   Önceden `Number(rates?.[code] || 1)` kullanılıyordu. JS truthy
   kuralı gereği `0 || 1 → 1` olduğu için DB/feed'den 0 gelen kur
   sessizce 1'e düşüyordu (kur henüz gelmemişse fiyat hatalı
   şekilde "1:1" çevriliyordu — özellikle USD↔TRY büyük drift).
   `NaN`, `null`, `undefined` durumlarında da aynı sessiz fallback
   vardı.

   resolveRate açıkça:
     - finite ve > 0 olan kur değerini döner
     - aksi halde fallback (default 1) döner
   Geçerli, pozitif, finite kur input'ları için çıktı BYTE-IDENTICAL
   aynı; yalnız invalid kurlar artık explicit fallback'e düşürülüyor.

   Davranış değişmediği yerler:
     - amount === 0 (early return 0)
     - rates === null/undefined (early return amount)
     - from === to (Number(amount.toFixed(2)))
     - geçerli rate'ler (USD: 30, EUR: 33 vb.)
   =============================================================== */
function resolveRate(
  rates: Record<string, number> | null | undefined,
  code: string,
  fallback = 1
): number {
  const raw = rates?.[code];
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function convertPrice(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
) {

  if (!amount) {
    return 0;
  }

  if (!rates) {
    return amount;
  }

  // aynı currency
  if (from === to) {
    return Number(
      amount.toFixed(2)
    );
  }

  // TRY -> USD/EUR
  if (from === "TRY") {

    const targetRate = resolveRate(rates, to);

    return Number(
      (amount / targetRate).toFixed(2)
    );
  }

  // USD/EUR -> TRY
  if (to === "TRY") {

    const sourceRate = resolveRate(rates, from);

    return Number(
      (amount * sourceRate).toFixed(2)
    );
  }

  // USD -> EUR vb
  const sourceRate = resolveRate(rates, from);

  const targetRate = resolveRate(rates, to);

  const tryAmount =
    amount * sourceRate;

  return Number(
    (tryAmount / targetRate).toFixed(2)
  );
}

/* ===============================================================
   🛡️ PUBLIC ÇOKLU DİL — formatCurrency locale-aware
   ===============================================================
   `locale` OPSİYONEL ve son parametre → mevcut `formatCurrency(a, c)`
   çağrılarının TAMAMI (admin, mail, voucher, offer humanize, testler)
   `DEFAULT_LOCALE` = "tr" ile eskisiyle BYTE-IDENTICAL çalışır.

   Değişen TEK şey görüntüleme biçimi: BCP-47 etiketi MEVCUT
   `LOCALE_BCP47` haritasından gelir (tr → "tr-TR" AYNEN). Tutarın
   DEĞERİ, `currency` kodu, `style`/`maximumFractionDigits` ayarları
   ve tüm fiyat/kur hesaplama mantığı DEĞİŞMEDİ.
   =============================================================== */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: Locale = DEFAULT_LOCALE
) {

  return new Intl.NumberFormat(
    LOCALE_BCP47[locale],
    {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }
  ).format(amount);
}