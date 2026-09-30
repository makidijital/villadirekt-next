/* ===============================================================
   🔥 CURRENCY / MONEY FORMAT — TEK MERKEZİ HELPER
   ===============================================================
   Tüm projede para gösterim formatı için tek source-of-truth.
   Önceden currencySymbol map / switch + formatTRY + formatMoney
   pricing canvas, voucher, voucher template, mail route'ları
   içinde birebir kopyalanmıştı.

   Bu modül DAVRANIŞI DEĞİŞTİRMEZ — yalnız tekrar eden formatter
   kodunu tek noktaya taşır. tr-TR rounding, "₺" default fallback,
   compactPrice "k" eşiği — hepsi aynen korunur.

   Not: lib/currency.ts içindeki convertPrice / formatCurrency
   currency conversion engine'i (rate'ler ile çevirir); bu modül
   yalnız display formatter'ı. İkisi farklı sorumlulukta.
   =============================================================== */

/* ---------------------------------------------
   🔥 currencySymbol(code) → "₺/$/€/£"
   - Bilinmeyen / null / undefined input → "₺" (default)
   - Mail route'larında kullanılan
       const CURRENCY_SYMBOL: Record<string, string> = { TRY:"₺", USD:"$", ... }
     ile, canvas içinde kullanılan switch ifadesinin DAVRANIŞI
     birebir aynı: aynı 4 kod → aynı 4 sembol, diğer her input → "₺".
---------------------------------------------- */
export function currencySymbol(code?: string | null): string {
  switch ((code || "TRY").toString().toUpperCase()) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "TRY":
    default:
      return "₺";
  }
}

/* ---------------------------------------------
   🔥 formatMoney(amount, currency) → "{symbol}{tr-TR rounded}"
   - Math.round(Number(amount) || 0) → invalid input 0'a düşer
   - tr-TR locale, maximumFractionDigits: 0 (kuruş yok)
   - currency sembolü currencySymbol() ile alınır
   - Mail route'larındaki formatMoney ile birebir aynı output.
---------------------------------------------- */
export function formatMoney(
  amount: number,
  currency: string
): string {
  const symbol = currencySymbol(currency);
  return `${symbol}${new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  }).format(Math.round(Number(amount) || 0))}`;
}

/* ---------------------------------------------
   🔥 formatTRY(amount) → "₺{tr-TR rounded}"
   - formatMoney(amount, "TRY") kısayolu
   - voucher/mail templates en sık kullanılan format
---------------------------------------------- */
export function formatTRY(amount: number): string {
  return formatMoney(amount, "TRY");
}

/* ---------------------------------------------
   🔥 compactPrice(n, currency?) → "₺2.5k" / "$350" gibi
   - 10000 ve üzeri → "{symbol}{(n/1000).toLocaleString tr-TR, max 1 frac}k"
   - 10000 altı     → formatMoney(n, currency) (k YOK, full integer)
   - Pricing canvas day-cell render'ında kullanılan eşik (≥10000 → k).
   - Şu an sadece canvas tüketicisi var; helper olarak burada tutmak
     gelecekte yeni tüketicilerin (admin reservation list, mail vb.)
     aynı formatı kullanmasını kolaylaştırır.
---------------------------------------------- */
export function compactPrice(
  n: number,
  currency?: string | null
): string {
  const sym = currencySymbol(currency);
  const v = Number(n) || 0;
  if (v >= 10000) {
    return `${sym}${(v / 1000).toLocaleString("tr-TR", {
      maximumFractionDigits: 1,
    })}k`;
  }
  return formatMoney(v, currency || "TRY");
}

/* ---------------------------------------------
   🔥 formatCompactPrice(price, currency?) → "₺9K" / "₺14.5K"
   - PURE DISPLAY formatter (DB/state/price logic'e dokunmaz).
   - Pricing calendar 5-ay (compact) day-cell render'ında kullanılır;
     dar hücrede uzun fiyat metnini ("₺14.000") kısaltır.
   - Kural:
       • < 1000  → formatMoney (kısaltma YOK, tam değer)
       • >= 1000 → "{symbol}{k}K"  (k = price/1000)
       • en fazla 1 ondalık; gereksiz ".0" gizlenir ("17K", "14.5K")
       • ondalık ayıracı nokta (locale-bağımsız).
   Örnek: 6000→₺6K · 9500→₺9.5K · 12000→₺12K · 17500→₺17.5K
---------------------------------------------- */
export function formatCompactPrice(
  price: number,
  currency?: string | null
): string {
  const sym = currencySymbol(currency);
  const v = Number(price) || 0;
  if (v < 1000) return formatMoney(v, currency || "TRY");
  const str = (v / 1000).toFixed(1).replace(/\.0$/, "");
  return `${sym}${str}K`;
}
