import {
  normalizeCustomPrepaymentRate,
  normalizeTourismDocumentNumber,
  normalizeMinimumStayNights,
  normalizeYouTubeVideosForDb,
  normalizeCommissionRate,
  normalizeBedroomLayoutForVilla,
  normalizeBathroomLayoutForVilla,
  normalizePoolHeatingFee,
  normalizePoolHeatingMonths,
} from "./normalizers";

/* 🛡️ Rich text description — KAYIT anında XSS-güvenli sanitize
   (defense-in-depth; render'da tekrar sanitize edilir). */
import { sanitizeHtml } from "@/lib/html-sanitize";

import type {
  BedroomLayoutItem,
  BathroomLayoutItem,
} from "@/lib/villa-layout.helper";

import type { VillaForm, VillaMapData } from "../types";

/* ===============================================================
   🛡️ FAZ 2 — buildVillaCorePayload (PURE)
   ===============================================================
   Eski villa-admin.service.ts içinde `createVillaFull` (INSERT)
   ve `updateVillaFull` (UPDATE) **birebir aynı 40+ alanlı payload
   object'i** ~150 satır × 2 = 300 LOC duplicate olarak yazılıydı.
   Bu helper'a taşındı.

   ⚠️ KESIN KURAL: payload key sırası + coercion + fallback chain
   BYTE-IDENTICAL korundu. Postgres satır sıralamasını etkilemez
   ama:
     - Audit log diff'i / future codegen sırası için stable
     - INSERT-RETURNING projeksiyon order'ı için stable

   COVERAGE (43 alan):
     Basic           : title, description
     Relation pointer: location_id
     Counts          : guests, bedrooms, bathrooms
     Pricing meta    : deposit, cleaning_fee, cleaning_currency, cleaning_limit
     Pool heating    : pool_heating_fee, pool_heating_currency (migration 074 —
                        3. adım, sadece veri modeli; hesaplama YAPILMAZ)
     Visual badge    : badge
     Slug            : slug (caller'dan input olarak gelir)
     Map             : map_type, latitude, longitude, map_embed
     Pool            : pool_type/depth/width/length
     Indoor pool     : indoor_pool/_depth/_width/_length
     Child pool      : child_pool/_depth/_width/_length
     Pool sheltered  : pool_sheltered
     SEO             : seo_title, seo_description, noindex
     Reservation cfg : custom_prepayment_rate
     Legal           : tourism_document_number
     Booking cfg     : minimum_stay_nights
     Media           : youtube_videos
     Accounting      : commission_rate

   ⚠️ map_type CONDITIONAL ENCODE:
     - "coords"  → latitude/longitude set, map_embed null
     - "iframe"  → map_embed set, latitude/longitude null
     Eski davranış aynen.

   NOT: Bu helper Insert + Update için kullanılır. Update'te
   `id` ve `is_active`/`deleted_at` ayrı yönetilir (lifecycle
   service'lerde). `slug` her iki path'te de caller'dan gelir
   (generateUniqueSlug çağrısı orchestrator'da).
=============================================================== */

/** Insert + Update için ortak shape. Postgres satır olarak
 *  loose; key set 40+ alanlı. */
export type VillaCorePayload = {
  title: VillaForm["title"];
  /* 🛡️ Migration 072 — admin-only, bilgi amaçlı. Public mapVilla()/
     VillaDTO'ya EKLENMEZ; slug üretiminde kullanılmaz. */
  real_title: string | null;
  description: VillaForm["description"];
  location_id: string | null;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  deposit: number;
  cleaning_fee: number;
  cleaning_currency: string;
  cleaning_limit: number;
  /* 🛡️ Migration 074 — Havuz Isıtma (3. adım, sadece veri modeli).
     NULL = hizmet sunulmuyor. Hesaplama YOK. */
  pool_heating_fee: number | null;
  pool_heating_currency: string;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL = kısıtlama yok. */
  pool_heating_months: number[] | null;
  badge: string;
  slug: string;
  map_type: VillaMapData["map_type"];
  latitude: VillaMapData["latitude"] | null;
  longitude: VillaMapData["longitude"] | null;
  map_embed: VillaMapData["map_embed"] | null;
  pool_type: VillaForm["pool_type"];
  pool_depth: VillaForm["pool_depth"];
  pool_width: VillaForm["pool_width"];
  pool_length: VillaForm["pool_length"];
  indoor_pool: VillaForm["indoor_pool"];
  indoor_pool_depth: VillaForm["indoor_pool_depth"];
  indoor_pool_width: VillaForm["indoor_pool_width"];
  indoor_pool_length: VillaForm["indoor_pool_length"];
  child_pool: VillaForm["child_pool"];
  child_pool_depth: VillaForm["child_pool_depth"];
  child_pool_width: VillaForm["child_pool_width"];
  child_pool_length: VillaForm["child_pool_length"];
  pool_sheltered: VillaForm["pool_sheltered"];
  seo_title: string | null;
  seo_description: string | null;
  noindex: boolean;
  custom_prepayment_rate: number | null;
  tourism_document_number: string | null;
  minimum_stay_nights: number | null;
  youtube_videos: { id: string; url: string }[] | null;
  commission_rate: number;
  /* 🛡️ MÜLK SAHİBİ (property_owners FK — migration 044, nullable). */
  owner_id: string | null;
  /* 🛡️ KONAKLAMA DÜZENİ (db/migrations/047 — JSONB). Boş → null. */
  bedroom_layout: BedroomLayoutItem[] | null;
  bathroom_layout: BathroomLayoutItem[] | null;
};

export type BuildVillaCorePayloadInput = {
  form: VillaForm;
  mapData: VillaMapData;
  selectedLocation?: string | null;
  slug: string;
};

export function buildVillaCorePayload(
  input: BuildVillaCorePayloadInput
): VillaCorePayload {
  const { form, mapData, selectedLocation, slug } = input;

  return {
    title: form.title,
    /* 🛡️ Migration 072 — trim + boş string → NULL (backfill/uydurma yok).
       ⚠️ `VillaForm` (app/services/villa-admin/types.ts) kapsam dışı
       (SADECE bu dosya + 4 dosya değiştirilecek); `real_title` orada
       tanımlı değil. Kaynak dosyayı değiştirmeden yerel intersection
       cast ile okunuyor — runtime davranışı `form.title` ile birebir
       aynı, yalnızca type-level bir genişletme. */
    real_title:
      (form as VillaForm & { real_title?: string }).real_title?.trim() ||
      null,
    description: sanitizeHtml(form.description),

    location_id:
      selectedLocation || null,

    guests:
      Number(form.guests) || 0,

    bedrooms:
      Number(form.bedrooms) || 0,

    bathrooms:
      Number(form.bathrooms) || 0,

    deposit:
      Number(form.deposit) || 0,

    cleaning_fee:
      Number(form.cleaning_fee) || 0,

    cleaning_currency:
      form.cleaning_currency || "TRY",

    cleaning_limit:
      Number(form.cleaning_limit) || 0,

    /* 🛡️ Migration 074 — Havuz Isıtma (3. adım, sadece veri modeli).
       normalizePoolHeatingFee: ""/null/undefined → null ("hizmet
       sunulmuyor"); 0 literal korunur; aksi → Number(raw).
       Hesaplama (nights × fee) BU ADIMDA YAPILMAZ. */
    pool_heating_fee: normalizePoolHeatingFee(form.pool_heating_fee),

    pool_heating_currency:
      form.pool_heating_currency || "TRY",

    /* 🛡️ Migration 076 — sezonluk ay kısıtı. normalizePoolHeatingMonths:
       null/undefined/dizi-değil → null ("kısıtlama yok"); aksi halde
       1-12 aralığına filtrelenmiş, tekilleştirilmiş, sıralı dizi.
       Hesaplama BU ADIMDA YAPILMAZ. */
    pool_heating_months: normalizePoolHeatingMonths(
      form.pool_heating_months
    ),

    badge:
      form.badge || "",

    slug,

    // 📍 MAP
    map_type:
      mapData.map_type,

    latitude:
      mapData.map_type === "coords"
        ? mapData.latitude
        : null,

    longitude:
      mapData.map_type === "coords"
        ? mapData.longitude
        : null,

    map_embed:
      mapData.map_type === "iframe"
        ? mapData.map_embed
        : null,

    // 🏊 HAVUZ
    pool_type:
      form.pool_type,

    pool_depth:
      form.pool_depth,

    pool_width:
      form.pool_width,

    pool_length:
      form.pool_length,

    indoor_pool:
      form.indoor_pool,

    indoor_pool_depth:
      form.indoor_pool_depth,

    indoor_pool_width:
      form.indoor_pool_width,

    indoor_pool_length:
      form.indoor_pool_length,

    child_pool:
      form.child_pool,

    child_pool_depth:
      form.child_pool_depth,

    child_pool_width:
      form.child_pool_width,

    child_pool_length:
      form.child_pool_length,

    pool_sheltered:
      !!form.pool_sheltered,

    // 🔥 SEO
    seo_title:
      form.seo_title || null,

    seo_description:
      form.seo_description || null,

    noindex:
      !!form.noindex,

    // 🔥 CUSTOM PREPAYMENT RATE (NULL = global fallback)
    custom_prepayment_rate: normalizeCustomPrepaymentRate(
      form.custom_prepayment_rate
    ),

    /* 🛡️ TOURISM DOCUMENT NO (db/migrations/017 — Faz 22). */
    tourism_document_number: normalizeTourismDocumentNumber(
      form.tourism_document_number
    ),

    /* 🛡️ MINIMUM STAY NIGHTS (Faz 26C). */
    minimum_stay_nights: normalizeMinimumStayNights(
      form.minimum_stay_nights
    ),

    /* 🛡️ YOUTUBE VIDEOS (db/migrations/033 — JSONB). */
    youtube_videos: normalizeYouTubeVideosForDb(
      form.youtube_videos
    ),

    /* 🛡️ COMMISSION RATE (% — accounting foundation). */
    commission_rate: normalizeCommissionRate(
      form.commission_rate
    ),

    /* 🛡️ MÜLK SAHİBİ — nullable FK. Seçilmemiş/boş → null. Booking/
       pricing/reservation engine'lerine etkisi YOK. */
    owner_id: form.owner_id ? String(form.owner_id) : null,

    /* 🛡️ KONAKLAMA DÜZENİ (db/migrations/047 — JSONB). Normalize +
       boş array → null (youtube_videos paterni). bedrooms/bathrooms
       toplam sayıları AYRI alanlar; bunlar ek detay. */
    bedroom_layout: normalizeBedroomLayoutForVilla(form.bedroom_layout),
    bathroom_layout: normalizeBathroomLayoutForVilla(form.bathroom_layout),
  };
}
