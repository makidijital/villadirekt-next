/* ===============================================================
   🛡️ FAZ 1 — PRICING CALENDAR TYPES (extracted)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde inline tipler.
   Tek source-of-truth; sub-component'lerin tek noktadan import'u.
=============================================================== */

/** Bir fiyat aralığı: [start_date, end_date] kapalı interval +
 *  gecelik fiyat + opsiyonel currency. DB shape ile birebir
 *  (villa_prices tablosu projeksiyonu). */
export type PricingCanvasRange = {
  start_date: string;
  end_date: string;
  price: number;
  currency?: string | null;
};

/** Main component props.
 *  EDIT mode (villaId verili): canvas DB ile sync.
 *  CREATE mode (villaId yok): controlled local-state + onPricesChanged. */
export type PricingCalendarCanvasProps = {
  /**
   * EDIT MODE (villaId verili): canvas DB ile sync çalışır;
   *   - load: getVillaPrices(villaId)
   *   - save/delete: setVillaPrices(villaId, ...)
   *
   * CREATE MODE (villaId verilmedi): canvas controlled local-state mode;
   *   - DB write YOK
   *   - initialPrices ile bir kez seed olur
   *   - her save/delete sonrası onPricesChanged(updated) ile parent
   *     state'e yansıtılır; gerçek persist parent'in submit flow'unda
   *     (örn: createVillaFull payload'ı) gerçekleşir.
   */
  villaId?: string;
  /** CREATE mode için başlangıç fiyatları (mount'ta bir kez seed edilir). */
  initialPrices?: PricingCanvasRange[];
  /** Save/delete sonrası güncel prices array'i parent'a aktarır. */
  onPricesChanged?: (prices: PricingCanvasRange[]) => void;
  /** Yan yana gösterilecek ardışık ay sayısı. Default 3 (backward-compat —
   *  tüm mevcut kullanımlar aynen kalır). Yalnız fiyatlandırma adımı
   *  (villa ekle/düzenle) 5 geçer; dış grid 2xl breakpoint'inde 5 kolona
   *  çıkar, daha küçük ekranlarda satıra sarar (horizontal overflow yok). */
  visibleMonths?: number;
};

/** loadData() içinde DB'den alınan villa snapshot. */
export type VillaMeta = {
  id: string;
  title: string | null;
  currency: string | null;
};

/** priceColorTone(price, min, max) çıktısı. Day cell inline style
 *  background + text rengi. */
export type ColorTone = { bg: string; text: string };

/** isRangeBoundary çıktısı — boundary classification. */
export type RangeBoundary = "start" | "end" | "both" | null;
