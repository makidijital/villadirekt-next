import { slugifyTr } from "@/lib/slug";

import type {
  VillaFormData,
  VillaPriceRowState,
  VillaDistanceItem,
} from "../_types/villa-form-data";

/* ===============================================================
   🛡️ FAZ 2 — VILLA AUDIT SNAPSHOT BUILDERS (PURE)
   ===============================================================
   Eski:
     - ekle/handleCreate logActivity({after_data: ~25 LOC inline})
     - [id]/handleUpdate beforeSnapshot + logActivity({after_data: ~35 LOC inline})
   BYTE-IDENTICAL bu helper'lara çıkarıldı.

   ⚠️ KESIN KURAL:
     - Alan adları + tipler + Array.isArray guard'lar AYNEN.
     - Boolean count-summary pattern AYNEN.
     - `typeof form.description === "string" ? form.description.length : 0` AYNEN.

   PURE: input alır, audit shape object'i döner. logActivity çağrısı
   orchestrator'da kalır (fire-forget pattern dokunulmaz).
=============================================================== */

/* ---------------- CREATE AUDIT — after_data shape ---------------- */

export type VillaCreateAuditAfter = {
  id: string;
  title: string;
  slug: string;
  location_id: string;
  guests: VillaFormData["guests"];
  bedrooms: VillaFormData["bedrooms"];
  bathrooms: VillaFormData["bathrooms"];
  deposit: VillaFormData["deposit"];
  cleaning_fee: VillaFormData["cleaning_fee"];
  cleaning_currency: VillaFormData["cleaning_currency"];
  minimum_stay_nights: VillaFormData["minimum_stay_nights"];
  is_active: true;
  description_length: number;
  types_count: number;
  features_count: number;
  rules_count: number;
  price_includes_count: number;
  distances_count: number;
  prices_count: number;
};

export type BuildVillaCreateAuditAfterInput = {
  newId: string;
  form: VillaFormData;
  selectedLocation: string;
  selectedTypes: string[];
  selectedFeatures: string[];
  selectedRules: string[];
  selectedPriceIncludes: string[];
  distances: VillaDistanceItem[];
  prices: VillaPriceRowState[];
};

export function buildVillaCreateAuditAfter(
  input: BuildVillaCreateAuditAfterInput
): VillaCreateAuditAfter {
  const {
    newId,
    form,
    selectedLocation,
    selectedTypes,
    selectedFeatures,
    selectedRules,
    selectedPriceIncludes,
    distances,
    prices,
  } = input;

  return {
    id: newId,
    title: form.title,
    slug: slugifyTr(form.title),
    location_id: selectedLocation,
    guests: form.guests,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    deposit: form.deposit,
    cleaning_fee: form.cleaning_fee,
    cleaning_currency: form.cleaning_currency,
    minimum_stay_nights: form.minimum_stay_nights,
    is_active: true,
    description_length:
      typeof form.description === "string"
        ? form.description.length
        : 0,
    types_count: Array.isArray(selectedTypes)
      ? selectedTypes.length
      : 0,
    features_count: Array.isArray(selectedFeatures)
      ? selectedFeatures.length
      : 0,
    rules_count: Array.isArray(selectedRules)
      ? selectedRules.length
      : 0,
    price_includes_count: Array.isArray(selectedPriceIncludes)
      ? selectedPriceIncludes.length
      : 0,
    distances_count: Array.isArray(distances)
      ? distances.filter((d) => d.title && d.distance).length
      : 0,
    prices_count: Array.isArray(prices)
      ? prices.filter(
          (p) => p.start_date && p.end_date && p.price > 0
        ).length
      : 0,
  };
}

/* ---------------- UPDATE AUDIT — before+after shape ---------------- */

/** Update before/after AYNI shape — eski inline'da iki kez tekrarlanan
 *  16-alan object'in tek tanımı. */
export type VillaUpdateAuditSnapshot = {
  id: string;
  title: string;
  slug: string;
  location_id: string;
  guests: VillaFormData["guests"];
  bedrooms: VillaFormData["bedrooms"];
  bathrooms: VillaFormData["bathrooms"];
  deposit: VillaFormData["deposit"];
  cleaning_fee: VillaFormData["cleaning_fee"];
  cleaning_currency: VillaFormData["cleaning_currency"];
  minimum_stay_nights: VillaFormData["minimum_stay_nights"];
  /* is_active eski inline'da `form.is_active` (state'te tip yoktu
     ama runtime'da DB row'dan akıyor). `VillaFormShape` Record
     index sig'den okuyabilir. */
  is_active: unknown;
  seo_title: VillaFormData["seo_title"];
  seo_description: VillaFormData["seo_description"];
  noindex: VillaFormData["noindex"];
  description_length: number;
  types_count: number;
  features_count: number;
  rules_count: number;
  price_includes_count: number;
  distances_count: number;
  prices_count: number;
};

export type BuildVillaUpdateAuditSnapshotInput = {
  id: string;
  form: VillaFormData;
  slug: string;
  selectedLocation: string;
  selectedTypes: string[];
  selectedFeatures: string[];
  selectedRules: string[];
  selectedPriceIncludes: string[];
  distances: VillaDistanceItem[];
  prices: VillaPriceRowState[];
};

/** Update flow BEFORE snapshot — handleUpdate başında, updateVillaFull
 *  AWAIT'inden önce çağrılır. */
export function buildVillaUpdateAuditBefore(
  input: BuildVillaUpdateAuditSnapshotInput
): VillaUpdateAuditSnapshot {
  return buildSnapshot(input);
}

/** Update flow AFTER snapshot — updateVillaFull AWAIT'inden SONRA,
 *  logActivity'ye gider. Shape `before` ile birebir aynı. */
export function buildVillaUpdateAuditAfter(
  input: BuildVillaUpdateAuditSnapshotInput
): VillaUpdateAuditSnapshot {
  return buildSnapshot(input);
}

/* Internal — before/after aynı body. */
function buildSnapshot(
  input: BuildVillaUpdateAuditSnapshotInput
): VillaUpdateAuditSnapshot {
  const {
    id,
    form,
    slug,
    selectedLocation,
    selectedTypes,
    selectedFeatures,
    selectedRules,
    selectedPriceIncludes,
    distances,
    prices,
  } = input;

  return {
    id,
    title: form.title,
    slug,
    location_id: selectedLocation,
    guests: form.guests,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    deposit: form.deposit,
    cleaning_fee: form.cleaning_fee,
    cleaning_currency: form.cleaning_currency,
    minimum_stay_nights: form.minimum_stay_nights,
    is_active: (form as Record<string, unknown>).is_active,
    seo_title: form.seo_title,
    seo_description: form.seo_description,
    noindex: form.noindex,
    description_length:
      typeof form.description === "string"
        ? form.description.length
        : 0,
    types_count: Array.isArray(selectedTypes)
      ? selectedTypes.length
      : 0,
    features_count: Array.isArray(selectedFeatures)
      ? selectedFeatures.length
      : 0,
    rules_count: Array.isArray(selectedRules) ? selectedRules.length : 0,
    price_includes_count: Array.isArray(selectedPriceIncludes)
      ? selectedPriceIncludes.length
      : 0,
    distances_count: Array.isArray(distances) ? distances.length : 0,
    prices_count: Array.isArray(prices) ? prices.length : 0,
  };
}
