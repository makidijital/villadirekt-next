import { convertPrice } from "@/lib/currency";

/* ===============================================================
   🛡️ PAGINATION HELPERS — public + admin paylaşılabilir
   ===============================================================
   Public sayfalar (/arama, /kiralik-villalar) için constants +
   parse + window helper'ları. Admin tarafı (VillaOperationsList)
   şu an kendi inline `computePageWindow` ve allowed list'ini
   tutuyor — değişmez. Bu modül public için yeni; admin ileride
   migrate edilirse mevcut sözleşmeyi koruyarak buraya geçebilir.

   ⚠️ KESIN KURAL:
     - Admin pagination dosyalarına dokunma.
     - Repository / service / cache katmanına çıkma.
     - Yalnız pure helper'lar; side-effect yok.
=============================================================== */

/** Public pagination için izin verilen sayfa boyutları.
 *  Default 12 (URL'de yazılmaz; clean URL). 30/50/100 seçilirse
 *  URL'de `?pageSize=N` olarak görünür. */
export const ALLOWED_PUBLIC_PAGE_SIZES = [12, 30, 50, 100] as const;
export const DEFAULT_PUBLIC_PAGE_SIZE = 12;

/** Allow-list check + defansif clamp. Geçersiz değer (raw string
 *  parse hatası, allow-list dışı sayı) → default. */
export function parsePublicPageSize(raw: unknown): number {
  if (Array.isArray(raw)) raw = raw[0];
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (
    !Number.isFinite(n) ||
    !ALLOWED_PUBLIC_PAGE_SIZES.includes(
      n as (typeof ALLOWED_PUBLIC_PAGE_SIZES)[number]
    )
  ) {
    return DEFAULT_PUBLIC_PAGE_SIZE;
  }
  return n;
}

/** 1-based page parse — Number.parseInt + clamp(>=1).
 *  totalPages caller tarafında ayrıca clamp edilir (totalPages
 *  henüz hesaplanmamış olabilir burada). */
export function parsePublicPage(raw: unknown): number {
  if (Array.isArray(raw)) raw = raw[0];
  const n =
    typeof raw === "string"
      ? Number.parseInt(raw, 10)
      : Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/* ===============================================================
   🛡️ PAGE WINDOW — "1 ... 8 9 10 11 12 ... 42" pattern
   ===============================================================
   Admin'in `VillaOperationsList.computePageWindow` ile aynı
   algoritma; pure function olarak burada.
   Algoritma:
     - totalPages <= 7 → tüm sayfalar görünür
     - aksi halde: 1, last, page±1, ve uçlara yakınsa 2/3 veya
       last-1/last-2; aralarda "…" ellipsis.
=============================================================== */
export function computePageWindow(
  page: number,
  totalPages: number
): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) {
    set.add(2);
    set.add(3);
  }
  if (page >= totalPages - 2) {
    set.add(totalPages - 1);
    set.add(totalPages - 2);
  }
  const sorted = Array.from(set)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

/* ===============================================================
   🛡️ PUBLIC SORT — URL state + JS-side sort
   ===============================================================
   AMAÇ:
     /arama ve /kiralik-villalar için sıralama seçenekleri. Tüm
     sıralama JS-side, slice ÖNCESİ uygulanır → pagination'la
     birebir tutarlı, cache'siz, repository/service/availability'e
     dokunmaz.

   SEÇENEKLER:
     - smart         (default): mevcut DB sırası — sort_order ASC,
                     created_at DESC. URL'e YAZILMAZ.
     - price-asc:    villa.price (orijinal currency) artan
     - price-desc:   villa.price azalan
     - capacity-asc: villa.guests artan (tek alan — kapasite/kişi
                     ayrımı YOK; sistem `guests` kolonu kullanıyor)
     - capacity-desc: villa.guests azalan

   CURRENCY:
     İlk sürümde kur dönüşümü YOK. villa.price aynen sıralama
     anahtarı; villalar farklı currency olabilir ama mevcut
     pre-prod veride çoğunluk TRY. Karışım yönetimi ileride
     ayrı PR (Opsiyon A: TRY anchor).

   NULL HANDLING:
     price === null veya guests === null kayıtlar SONA gönderilir
     (asc: +Infinity; desc: -Infinity). Eski "fiyatsız" villalar
     üst sıraya çıkmaz.

   AKILLI SIRA (smart) DAVRANIŞI:
     `applyPublicSort(list, "smart")` array'i AYNEN döner — caller
     mevcut DB sırasına dokunmamış olur (no-op shortcut).
=============================================================== */
export const ALLOWED_PUBLIC_SORTS = [
  "smart",
  "price-asc",
  "price-desc",
  "capacity-asc",
  "capacity-desc",
] as const;
export type PublicSort = (typeof ALLOWED_PUBLIC_SORTS)[number];
export const DEFAULT_PUBLIC_SORT: PublicSort = "smart";

/** Allow-list parse + defansif fallback. Geçersiz değer (raw string,
 *  array, allow-list dışı) → default ("smart"). URL'de default yazılı
 *  gelse bile aynı no-op sonucu döner. */
export function parsePublicSort(raw: unknown): PublicSort {
  if (Array.isArray(raw)) raw = raw[0];
  if (
    typeof raw === "string" &&
    (ALLOWED_PUBLIC_SORTS as readonly string[]).includes(raw)
  ) {
    return raw as PublicSort;
  }
  return DEFAULT_PUBLIC_SORT;
}

/** Sıralanabilir minimum villa shape — VillaDTO ve /arama normalized
 *  villa tipiyle yapısal uyumlu. Kart prop sözleşmesini değiştirmez.
 *  `currency` opsiyonel: verilirse currency-aware sıralama için
 *  villa.currency olarak kullanılır; verilmezse "TRY" varsayılır.
 *  `_sortPrice` opsiyonel: caller önceden hesaplanmış sıralama
 *  anahtarı verirse (örn. /arama tarihli durumda calculateGrandTotal
 *  toplamı), priceKey doğrudan onu kullanır → kart gösterimi ile
 *  birebir aynı sayı. Yoksa mevcut convertPrice path'i çalışır. */
export type SortableVilla = {
  price: number | null | undefined;
  guests: number | null | undefined;
  currency?: string | null | undefined;
  _sortPrice?: number | null | undefined;
};

/** Currency-aware sort opsiyonları. Verilmezse sıralama raw `price`
 *  ile çalışır (mevcut geriye dönük davranış). Verilirse her villa'nın
 *  fiyatı `convertPrice(price, villa.currency, userCurrency, rates)`
 *  ile **kullanıcının seçtiği para birimine** normalize edilir;
 *  VillaCard'ın gösterdiği değerle birebir aynı sayı olur. */
export type PublicSortPriceOptions = {
  userCurrency: string;
  rates: Record<string, number>;
};

/**
 * JS-side stable sort. `smart` → no-op (caller'ın mevcut sırasını koru).
 * Diğer modlar pure comparator; null/undefined değerleri "sona"
 * gönderir (asc: +∞ key; desc: -∞ key).
 *
 * Davranış garantileri:
 *  - Input array MUTATE EDİLMEZ; yeni array döner.
 *  - smart için referans korunur (no allocation) → cache-friendly.
 *  - VillaCard prop'ları hiçbir şekilde değiştirilmez.
 *  - `priceOpts` verilmezse mevcut raw-price davranışı (geriye uyum).
 */
export function applyPublicSort<T extends SortableVilla>(
  list: T[],
  sort: PublicSort,
  priceOpts?: PublicSortPriceOptions
): T[] {
  if (sort === "smart") return list;
  const arr = [...list];

  /* 🛡️ CURRENCY-AWARE PRICE KEY — VillaCard convertPrice ile aynı
     formül + aynı rates → gösterilen sayı === sıralama anahtarı.
     priceOpts yoksa raw price (eski davranış; admin/diğer caller
     uyumu).

     🛡️ STAY-TOTAL OVERRIDE — caller `_sortPrice` (önceden hesaplanmış
     toplam, user currency'sinde) verirse onu doğrudan kullan; convertPrice
     çağrılmaz çünkü değer zaten user currency'sinde. /arama tarihli
     durumda calculateGrandTotal().total burada ekonomik anahtardır. */
  const priceKey = (v: T): number => {
    if (typeof v._sortPrice === "number" && Number.isFinite(v._sortPrice)) {
      return v._sortPrice;
    }
    const p = v.price;
    if (typeof p !== "number" || !Number.isFinite(p)) return NaN;
    if (!priceOpts) return p;
    const villaCurrency =
      typeof v.currency === "string" && v.currency.length > 0
        ? v.currency
        : "TRY";
    return convertPrice(
      p,
      villaCurrency,
      priceOpts.userCurrency,
      priceOpts.rates
    );
  };

  const priceAsc = (v: T): number => {
    const k = priceKey(v);
    return Number.isFinite(k) ? k : Number.POSITIVE_INFINITY;
  };
  const priceDesc = (v: T): number => {
    const k = priceKey(v);
    return Number.isFinite(k) ? k : Number.NEGATIVE_INFINITY;
  };
  const guestsAsc = (v: T): number => {
    const g = v.guests;
    if (typeof g !== "number" || !Number.isFinite(g)) {
      return Number.POSITIVE_INFINITY;
    }
    return g;
  };
  const guestsDesc = (v: T): number => {
    const g = v.guests;
    if (typeof g !== "number" || !Number.isFinite(g)) {
      return Number.NEGATIVE_INFINITY;
    }
    return g;
  };

  switch (sort) {
    case "price-asc":
      arr.sort((a, b) => priceAsc(a) - priceAsc(b));
      break;
    case "price-desc":
      arr.sort((a, b) => priceDesc(b) - priceDesc(a));
      break;
    case "capacity-asc":
      arr.sort((a, b) => guestsAsc(a) - guestsAsc(b));
      break;
    case "capacity-desc":
      arr.sort((a, b) => guestsDesc(b) - guestsDesc(a));
      break;
  }
  return arr;
}

/** UI label map — toolbar selector ve a11y için tek source-of-truth. */
export const PUBLIC_SORT_LABELS: Record<PublicSort, string> = {
  smart: "Akıllı Sıralama",
  "price-asc": "Fiyat (Düşükten Yükseğe)",
  "price-desc": "Fiyat (Yüksekten Düşüğe)",
  "capacity-asc": "Kapasite (Küçükten Büyüğe)",
  "capacity-desc": "Kapasite (Büyükten Küçüğe)",
};
