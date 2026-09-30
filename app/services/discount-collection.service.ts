import { discountRepository } from "@/lib/db/discount.repository";
import { parseLocalDate, formatLocalDate } from "@/lib/date-format";

/* ===============================================================
   🛡️ DISCOUNT COLLECTION SERVICE (migration 062)
   ===============================================================
   Admin "İndirimli Koleksiyon" sayfası için CRUD. homepage-collection
   .service.ts'in BİREBİR klonu; tek fark repository (discountRepository)
   ve cache tag ("discount"). Public read yolu
   `lib/cache.helpers > getCachedDiscountCollectionVillas` (tag: "discount").

   Tüm mutation'lar caller tarafında revalidateDiscount() ile
   invalidate edilir (separation of concerns: service DB, caller cache).
   Yeni pricing/availability/reservation semantic'i YOK.
   =============================================================== */

/** 🔗 Section başlık default'u — frontend section hardcoded başlık.
    (Alt başlık kaldırıldı — client copy revizyonu.) */
export const DISCOUNT_COLLECTION_DEFAULTS = {
  title: "İndirimli Kiralık Villalar",
} as const;

/** 🛡️ MIGRATION 092 — public'te gösterilecek indirim dönemi seçimi.
 *  Tarih çifti ile saklanır (`villa_discounts.id` DEĞİL), çünkü
 *  `replace_villa_discounts` DELETE+INSERT yapıp id'leri değiştirir;
 *  `(start_date, end_date)` ise `villa_discounts_no_overlap` EXCLUDE
 *  constraint'i sayesinde villa içinde KARARLI ve BENZERSİZDİR. */
export type SelectedDiscountRange = { start: string; end: string };

/** Ham jsonb → güvenli `SelectedDiscountRange[]`. NULL/bozuk/boş değer
 *  `null` döner = "seçim yok" = TÜM görünür dönemler (legacy davranış).
 *  Hiçbir zaman throw etmez (projenin savunmacı okuma konvansiyonu). */
export function normalizeSelectedDiscountRanges(
  raw: unknown
): SelectedDiscountRange[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SelectedDiscountRange[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as { start?: unknown; end?: unknown };
    const start = typeof r.start === "string" ? r.start.slice(0, 10) : "";
    const end = typeof r.end === "string" ? r.end.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    const key = `${start}|${end}`;
    if (seen.has(key)) continue; // aynı dönem iki kez seçilemez
    seen.add(key);
    out.push({ start, end });
  }
  /* Boş dizi → "hiçbiri" DEĞİL; NULL ile AYNI (tüm dönemler). Admin
     yanlışlıkla tüm kutuları kaldırırsa kart sessizce kaybolmasın;
     "gösterme" isteği zaten `is_active = false` ile karşılanıyor. */
  return out.length > 0 ? out : null;
}

export type DiscountCollectionItem = {
  id: string;
  villa_id: string;
  sort_order: number;
  is_active: boolean;
  custom_title: string | null;
  custom_cover_image: string | null;
  /* 🛡️ MIGRATION 092 — ham jsonb (admin UI normalize ederek kullanır). */
  selected_discount_ranges: SelectedDiscountRange[] | null;
  created_at: string | null;
  villa?: {
    id: string;
    slug: string | null;
    title: string | null;
    is_active: boolean | null;
    deleted_at: string | null;
    villa_images?: Array<{
      image_url: string | null;
      is_cover: boolean | null;
      sort_order: number | null;
    }> | null;
    villa_discounts?: Array<{
      end_date: string | null;
    }> | null;
  } | null;
};

/* ----- LIST (admin) — aktif+pasif tümü, sort_order ASC.
   🛡️ TARİH-BAZLI GÖRÜNÜRLÜK FİLTRESİ (bu tur) — bir villa yalnızca
   EN AZ 1 villa_discounts kaydı varsa VE bu kayıtlardan EN AZ BİRİNİN
   end_date >= bugün ise sonuç listesinde kalır. Tüm kayıtlar geçmişse
   VEYA hiç villa_discounts kaydı yoksa item sonuçtan ÇIKARILIR —
   `discount_collections` satırı SİLİNMEZ (yalnız bu okuma sonucunda
   görünmez kalır; villa'ya ileride yeni bir gelecek-tarihli
   villa_discounts eklenirse otomatik geri görünür), villa_discounts
   kayıtlarına HİÇ DOKUNULMAZ. `end_date` alanı LIST_SELECT'e
   (discount.repository.ts) eklenen TEK yeni alan — ek sorgu/N+1 YOK,
   aynı embed'den okunuyor. Homepage collection
   (cache.helpers.ts > getCachedDiscountCollectionVillas), VillaCard ve
   mevcut indirim hesaplama sistemi (price.engine.ts) bu filtreden HİÇ
   ETKİLENMEZ — ayrı fonksiyon, ayrı sorgu yolu, dokunulmadı. ----- */
export async function listDiscountCollection(): Promise<
  DiscountCollectionItem[]
> {
  const { data, error } = await discountRepository.findAllForAdmin();
  if (error) {
    console.error("❌ listDiscountCollection error:", error.message);
    return [];
  }
  const items = (data || []) as unknown as DiscountCollectionItem[];

  /* Bugün — LOCAL tarih, TZ kaymasına karşı formatLocalDate → parseLocalDate
     round-trip'i (lib/date-format.ts'in kendi standardı); villa_discounts.
     end_date ile AYNI "YYYY-MM-DD" local semantiğiyle karşılaştırılabilir
     bir Date üretir (price.engine.ts > getActiveDiscount'un normalizeDate
     yaklaşımıyla AYNI local-midnight anlamına gelir). */
  const today = parseLocalDate(formatLocalDate(new Date()));

  return items.filter((item) => {
    const discounts = item.villa?.villa_discounts ?? [];
    return discounts.some((d) => {
      if (!d?.end_date) return false;
      const end = parseLocalDate(d.end_date);
      /* Geçersiz parse (Invalid Date) → bu kayıt geçerli SAYILMAZ,
         güvenli şekilde filtre dışı bırakılır (parseLocalDate hiçbir
         zaman throw etmez — bkz. lib/date-format.ts doc-comment'i). */
      if (Number.isNaN(end.getTime())) return false;
      return end >= today;
    });
  });
}

/* ----- ADD villa to collection ----- */
export async function addToDiscountCollection(
  villa_id: string
): Promise<boolean> {
  const { data: maxRow } = await discountRepository.findMaxSortOrder();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await discountRepository.insert({
    villa_id,
    sort_order: nextOrder,
    is_active: true,
  });
  if (error) {
    console.error("❌ addToDiscountCollection:", error.message);
    return false;
  }
  return true;
}

/* ----- REMOVE (hard delete satır) ----- */
export async function removeFromDiscountCollection(
  id: string
): Promise<boolean> {
  const { error } = await discountRepository.deleteById(id);
  if (error) {
    console.error("❌ removeFromDiscountCollection:", error.message);
    return false;
  }
  return true;
}

/* ----- TOGGLE is_active ----- */
export async function toggleDiscountCollectionActive(
  id: string,
  is_active: boolean
): Promise<boolean> {
  const { error } = await discountRepository.updateById(id, { is_active });
  if (error) {
    console.error("❌ toggleDiscountCollectionActive:", error.message);
    return false;
  }
  return true;
}

/* ----- UPDATE custom fields ----- */
export async function updateDiscountCollectionItem(
  id: string,
  fields: {
    custom_title?: string | null;
    custom_cover_image?: string | null;
    /* 🛡️ MIGRATION 092 — küratörlük seçimi. `null` → seçim temizlenir
       (tüm görünür dönemler). `villa_discounts` kayıtlarına DOKUNMAZ. */
    selected_discount_ranges?: SelectedDiscountRange[] | null;
  }
): Promise<boolean> {
  const payload: Record<string, unknown> = {};
  if ("selected_discount_ranges" in fields) {
    const normalized = normalizeSelectedDiscountRanges(
      fields.selected_discount_ranges
    );
    /* normalize `[]`'i null'a indirger → "tüm dönemler" semantiği DB'de
       de tek bir gösterimle (NULL) saklanır. */
    payload.selected_discount_ranges = normalized;
  }
  if ("custom_title" in fields) {
    payload.custom_title =
      (fields.custom_title ?? null) === null
        ? null
        : (fields.custom_title as string).trim() || null;
  }
  if ("custom_cover_image" in fields) {
    payload.custom_cover_image = fields.custom_cover_image ?? null;
  }
  if (Object.keys(payload).length === 0) return true;
  const { error } = await discountRepository.updateById(id, payload);
  if (error) {
    console.error("❌ updateDiscountCollectionItem:", error.message);
    return false;
  }
  return true;
}

/* ----- REORDER — yeni sıraya göre sort_order set et. ----- */
export async function reorderDiscountCollection(
  orderedIds: string[]
): Promise<boolean> {
  const ops = orderedIds.map((id, idx) =>
    discountRepository.updateById(id, { sort_order: idx })
  );
  const results = await Promise.all(ops);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) {
    console.error("❌ reorderDiscountCollection:", firstErr.error.message);
    return false;
  }
  return true;
}
