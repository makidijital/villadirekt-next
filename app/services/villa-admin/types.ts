/* ===============================================================
   🛡️ FAZ 3 — VILLA ADMIN SERVICE TYPES
   ===============================================================
   Eski villa-admin.service.ts top-level type export'ları aynen
   buraya taşındı. Facade (villa-admin.service.ts) bu dosyadan
   re-export eder → caller import path'leri kırılmaz.

   ⚠️ ŞEKİL DEĞİŞMEZ: alan adları, opsiyonel'leri, union'ları
   eski tip ile birebir aynı. Compile-time drift YOK.
=============================================================== */

/** Wizard form state'inin service-side görünümü. Tüm alanlar
 *  opsiyonel (admin partial save yapabilir; defensive). */
export type VillaForm = {
  title?: string;
  description?: string;
  guests?: number | string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  deposit?: number | string;
  cleaning_fee?: number | string;
  cleaning_currency?: string;
  cleaning_limit?: number | string;

  /* 🛡️ HAVUZ ISITMA — 3. adım (admin form hazırlığı, hesaplama YOK).
   *  NULL = "hizmet sunulmuyor" (migration 074 semantiği). Boş string/
   *  null/undefined → normalizePoolHeatingFee ile NULL'a normalize
   *  edilir (custom_prepayment_rate ile aynı desen); 0 literal olarak
   *  korunur. */
  pool_heating_fee?: number | string | null;
  pool_heating_currency?: string | null;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL/undefined = "ay
   *  kısıtlaması yok" (12 ay aktif). [1..12] = yalnız listelenen
   *  aylarda aktif. Ay numarası: 1=Ocak. */
  pool_heating_months?: number[] | null;

  badge?: string;

  pool_type?: string;
  pool_depth?: string;
  pool_width?: string;
  pool_length?: string;

  indoor_pool?: boolean;
  indoor_pool_depth?: string;
  indoor_pool_width?: string;
  indoor_pool_length?: string;

  child_pool?: boolean;
  child_pool_depth?: string;
  child_pool_width?: string;
  child_pool_length?: string;

  pool_sheltered?: boolean;

  seo_title?: string | null;
  seo_description?: string | null;
  noindex?: boolean;

  /** Boş string runtime'da → null fallback (global rate). */
  custom_prepayment_rate?: number | string | null;

  /* 🛡️ TOURISM DOCUMENT NO (db/migrations/017 — Faz 22).
   *  T.C. Kültür ve Turizm Bakanlığı belge no, ham text.
   *  Opsiyonel; UI input bu fazda eklenmedi (sadece pipeline). */
  tourism_document_number?: string | null;

  /* 🛡️ MINIMUM STAY NIGHTS (Faz 26B/C).
   *  Admin number input → null veya >=1 integer.
   *  BookingSidebar enforcement: >=2 ise aktif.
   *  Boş input → null (eski davranış / "enforcement yok"). */
  minimum_stay_nights?: number | null;

  /* 🛡️ YOUTUBE VIDEOS (db/migrations/033 — JSONB).
   *  Admin form'dan gelen normalize edilmiş video listesi.
   *  - Eleman: { id: 11-char video ID, url: original entered URL }
   *  - Boş/undefined/null → DB'ye `null` yazılır (sıfır video)
   *  - Service layer ek normalize uygular (defansif dedup + validate).
   *  Detay: lib/youtube.helper > VillaYouTubeVideo / normalizeYouTubeVideos */
  youtube_videos?: { id: string; url: string }[] | null;

  /* 🛡️ COMMISSION RATE (% — accounting foundation).
   *  DB kolonu (villa.commission_rate) production'da MEVCUT;
   *  bu type yalnız admin form payload'ı için passthrough.
   *  Booking/pricing/availability/reservation engine'lere etki YOK.
   *  Range: 0-100; invalid/boş → 20 fallback (DEFAULT_COMMISSION_RATE). */
  commission_rate?: number | string | null;

  /* 🛡️ MÜLK SAHİBİ (property_owners FK — migration 044, nullable).
   *  "Bu villa kimin?" bağlantısı. Booking/pricing/availability/
   *  reservation engine'lerine etkisi YOK; yalnız admin form passthrough.
   *  Boş/seçilmemiş → null. */
  owner_id?: string | null;

  /* 🛡️ KONAKLAMA DÜZENİ (db/migrations/047 — JSONB).
   *  Airbnb tarzı detaylı oda düzeni. Mevcut bedrooms/bathrooms
   *  toplam sayıları AYRI; bunlar ek detay. Service layer normalize
   *  edip boşsa null yazar. Detay: lib/villa-layout.helper.ts */
  bedroom_layout?: unknown;
  bathroom_layout?: unknown;
};

export type VillaMapData = {
  map_type: "coords" | "iframe" | string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  map_embed?: string | null;
};

export type VillaDistanceInput = {
  title?: string | null;
  distance?: string | null;
};

export type VillaPriceInput = {
  start_date: string | Date;
  end_date: string | Date;
  price: number;
  currency?: string;
};

/** create + update için ortak payload. */
export type VillaFormPayload = {
  form: VillaForm;
  selectedLocation?: string | null;
  selectedTypes?: string[];
  selectedFeatures?: string[];
  mapData: VillaMapData;
  distances?: VillaDistanceInput[];
  prices?: VillaPriceInput[];
  /** undefined → relation'a dokunulmaz (update). */
  selectedRules?: string[];
  /** undefined → relation'a dokunulmaz (update). */
  selectedPriceIncludes?: string[];
};

/** updateVillaFull için VillaFormPayload + zorunlu id. */
export type VillaUpdatePayload = VillaFormPayload & { id: string };

/* ===============================================================
   🛡️ BULK SORT ORDER — setVillaSortOrders
   =============================================================== */
export type VillaSortOrderUpdate = {
  id: string;
  sort_order: number;
};

export type VillaServiceResult = { ok: true } | { ok: false; error: string };

/* ===============================================================
   🛡️ FAZ 31 — PRIVATE / TEMPORARY VILLA URL TOKEN
   =============================================================== */
export type PrivateTokenResult =
  | { ok: true; token: string }
  | { ok: false; error: string };
