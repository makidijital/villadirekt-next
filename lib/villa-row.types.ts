/* ===============================================================
   🛡️ VILLA ROW TYPES — Shared DTO / Embed Shapes
   ===============================================================
   Bu dosya eski sağlayıcı embed-select pattern'inde tekrarlanan satır
   shape'lerini merkezileştirir. Aynı tip /arama, cache.helpers,
   villa.service > mapVilla, VillaList ve homepage collection
   katmanlarında lokal olarak yeniden tanımlanıyordu — drift
   kaynağıydı.

   FELSEFE (Faz 9):
     - Bu tipler `types/database.ts` Row'larından TÜRETİLMEZ
       (eski sağlayıcı embed-select inference'ı v2.105'te `never` üretiyor;
       Database generic bind YOK — bkz. lib/db/index.ts).
     - Bunun yerine MANUAL "embed shape" tipleri: caller'lar zaten
       embedded select sonuçlarını bu shape'lere narrow ediyordu.
       Tek source-of-truth artık burası.
     - Tüm field'lar `| null` olarak işaretli (defansif): Postgres
       nullable kolonlar + embed-select için sane default.

   KULLANIM:
     import type { VillaImageEmbed, VillaPriceEmbed } from "@/lib/villa-row.types";

   RUNTIME ETKİSİ: SIFIR. Bu dosya yalnız TypeScript level.
   =============================================================== */

/* ---------------------------------------------------------------
   IMAGE EMBED — `villa_images (image_url, is_cover, sort_order)`
   --------------------------------------------------------------- */
export type VillaImageEmbed = {
  image_url: string | null;
  is_cover: boolean | null;
  sort_order: number | null;
};

/* ---------------------------------------------------------------
   PRICE EMBED — `villa_prices (price, currency, start_date, end_date?)`
   --------------------------------------------------------------- */
export type VillaPriceEmbed = {
  price: number | null;
  currency: string | null;
  start_date: string | null;
  /** end_date opsiyonel — getCachedHomepageCollectionVillas
   *  yalnız start_date ile çekiyor; /arama ve villa detail end_date
   *  de çekiyor. Tek tip iki kullanımı kapsasın. */
  end_date?: string | null;
};

/* ---------------------------------------------------------------
   PRICE RANGE — price.engine için strict (caller validated)
   ---------------------------------------------------------------
   `calculateGrandTotal` ve eşlikçileri gerçek hesaplamaya girmeden
   önce caller bu shape'i hazırlıyor. Null geçmediği için engine
   içinde tek tek normalize gerekmez. */
export type PriceRange = {
  start_date: string;
  end_date: string;
  price: number;
  currency: string;
};

/* ---------------------------------------------------------------
   LOCATION EMBED — `location:villa_locations(name)`
   --------------------------------------------------------------- */
export type VillaLocationEmbed = {
  name: string | null;
};

/* ---------------------------------------------------------------
   VILLA RAW (read) — service / cache embed çıktısının minimum shape
   ---------------------------------------------------------------
   Bu tip mapVilla / cache helpers içindeki lokal `Row` tiplerinin
   ortak alanlarını barındırır. Her caller kendi extra-field'larını
   bu tipi extend ederek tanımlar — DRY + drift-safe.

   Bu tip eski sağlayıcının DÖNDÜRDÜĞÜ shape; `types/database.ts > VillaRow`
   ile birebir aynı kolonlar fakat embed alanları + nullable
   tolerans dahil. */
export type VillaEmbedBase = {
  id: string;
  slug: string | null;
  title: string | null;
  badge?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  guests?: number | null;
  location?: VillaLocationEmbed | null;
  villa_images?: VillaImageEmbed[] | null;
  villa_prices?: VillaPriceEmbed[] | null;
};

/* ---------------------------------------------------------------
   PURE HELPERS — null-safe array narrowing
   ---------------------------------------------------------------
   Embed-select pattern, optional veya null array dönebiliyor.
   Caller'lar her çağrıda `Array.isArray(...) ? ... : []` ile
   kalkanlıyor. Bu helper tek satıra indirir.
   Çağrı sıklığı düşük; allocation yok (mevcut array referansı). */
export function asEmbedArray<T>(
  value: T[] | null | undefined
): T[] {
  return Array.isArray(value) ? value : [];
}

/* ---------------------------------------------------------------
   IMAGE SORTING — TEK kural (mapVilla / cache / arama / homepage)
   ---------------------------------------------------------------
   Daha önce bu kural 5+ yerde inline duplike ediliyordu. Tek
   helper ile centralize:
     1) is_cover === true önce
     2) sort_order ASC fallback (null → 0)
   Davranış byte-identical. Mutation YOK; yeni array döner.

   Type guarantee: input nullable embed; output non-null URL'li
   filter callerlar tarafından ayrı yapılır (zaten ediliyordu).
*/
export function sortImagesByCover(
  images: ReadonlyArray<VillaImageEmbed | null | undefined>
): VillaImageEmbed[] {
  const clean = images.filter(
    (i): i is VillaImageEmbed => !!i && typeof i === "object"
  );
  return [...clean].sort((a, b) => {
    if (a.is_cover) return -1;
    if (b.is_cover) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

/* ---------------------------------------------------------------
   IMAGE URLs — embed'den valid string URL array
   ---------------------------------------------------------------
   sortImagesByCover sonrası filter+map birleşik. Caller tek satır:
     const urls = extractImageUrls(v.villa_images);
*/
export function extractImageUrls(
  images: VillaImageEmbed[] | null | undefined
): string[] {
  const sorted = sortImagesByCover(asEmbedArray(images));
  return sorted
    .map((i) => i.image_url)
    .filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    );
}

/* ---------------------------------------------------------------
   PRICE NORMALIZE — embed → strict PriceRange[]
   ---------------------------------------------------------------
   `null/empty` price kayıtlarını filter eder; engine'ın non-null
   shape'ine getirir. Davranış birebir önceki inline mantıkla aynı.
*/
export function normalizePriceRanges(
  prices: VillaPriceEmbed[] | null | undefined
): PriceRange[] {
  const rows = asEmbedArray(prices);
  const out: PriceRange[] = [];
  for (const p of rows) {
    if (!p) continue;
    if (
      typeof p.start_date !== "string" ||
      typeof p.end_date !== "string" ||
      p.start_date.length === 0 ||
      p.end_date.length === 0
    ) {
      continue;
    }
    out.push({
      start_date: p.start_date,
      end_date: p.end_date,
      price: Number(p.price || 0),
      currency: p.currency || "TRY",
    });
  }
  return out;
}
