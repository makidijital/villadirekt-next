import { NextResponse } from "next/server";

import { villaLocationRepository } from "@/lib/db/villa-location.repository";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { villaFeatureRepository } from "@/lib/db/villa-feature.repository";

/* 🛡️ ADDITIVE çoklu dil — `name` alanı AYNEN korunur; cevaba YALNIZ
   `name_by_locale` EKLENİR (`/api/public/payment-methods`, migration
   088 ile BİREBİR aynı desen). */
import { getCachedSettings } from "@/lib/cache.helpers";
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import { getVillaFeatureNamesByLocale } from "@/lib/i18n/get-villa-feature-translations.server";
import type { TaxonomyNameByLocale } from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ /api/public/taxonomies — PUBLIC TAXONOMY LOOKUPS
   ===============================================================
   GET → 3 paralel taxonomy fetch:
     - villa_locations { id, name, slug }
     - villa_types     { id, name, slug }
     - villa_features  { id, name }

   AUTH: PUBLIC (RLS-public read; bu tablolar zaten anon erişime
   açık RLS phase 1 / migration 037). Route yalnız client-side
   `@/lib/db` direct erişimini API boundary arkasına alır;
   güvenlik semantiği değişmez.

   FAZ 2 frontend purge — public form'lar (teklif-al vb.) için
   dropdown options. Davranış BYTE-IDENTICAL: aynı select shape'leri
   tek route response'unda birleştirilir.

   RATE-LIMIT: bu route public-read taxonomy; mevcut anon DB client
   path'inde rate-limit yoktu, korumayı çoğaltmıyor. Üzerine rate-
   limit eklemek behavior değiştirir; eklenmiyor.

   🛡️ ADDITIVE ÇOKLU DİL — `types` ve `features` satırlarına
   `name_by_locale` (`{ en?, de? }`) EKLENİR. MEVCUT ALANLARIN
   HİÇBİRİ DEĞİŞTİRİLMEZ/KALDIRILMAZ — özellikle canonical `name`
   ve `slug` AYNEN döner (submit payload'ı `slug || id` token'ını
   kullanır; görünen etiketin çevrilmesi payload'ı ETKİLEMEZ).

   ⚠️ `locations` (bölgeler) ÇEVRİLMEZ: Kalkan/Kaş/Fethiye gibi
   bölge adları ÖZEL İSİMDİR (Phase 10I kararı — `villa_location`
   çeviri entity'si registry'den KALDIRILDI). Bu satırlara
   `name_by_locale` EKLENMEZ; tüketici tarafta `resolveTaxonomyName`
   doğal olarak canonical ada düşer.

   SORGU SAYISI: `multilingual_enabled = false` iken çeviri sorgusu
   HİÇ atılmaz (bugünkü davranış birebir). Açıkken entity başına
   locale başına TEK batch `.in()` sorgusu (villa_type en+de,
   villa_feature en+de = 4 sorgu, hepsi PARALEL) — kayıt başına
   sorgu YOK. Çeviri okuma hatası cevabı BOZMAZ (fail-soft → boş
   harita → TR fallback).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const [locsRes, typesRes, featsRes] = await Promise.all([
    villaLocationRepository.findAllForPublicTaxonomy(),
    villaTypeRepository.findAllForPublicTaxonomy(),
    villaFeatureRepository.findAllForPublicTaxonomy(),
  ]);

  const types = typesRes.data || [];
  const features = featsRes.data || [];

  /* 🛡️ ADDITIVE ÇOKLU DİL — `name` / `slug` alanlarına DOKUNULMAZ. */
  const { typeNames, featureNames } = await resolveTaxonomyNames(
    types,
    features
  );

  return NextResponse.json({
    ok: true,
    /* Bölgeler ÖZEL İSİM → çeviri EKLENMEZ (Phase 10I). */
    locations: locsRes.data || [],
    types: types.map((row) => withNameByLocale(row, typeNames)),
    features: features.map((row) => withNameByLocale(row, featureNames)),
  });
}

type TaxonomyRow = Record<string, unknown>;

function rowId(row: TaxonomyRow): string {
  return String(row?.id ?? "");
}

function withNameByLocale(
  row: TaxonomyRow,
  names: Record<string, TaxonomyNameByLocale>
): TaxonomyRow {
  return { ...row, name_by_locale: names[rowId(row)] || {} };
}

/* Fail-soft: çeviri katmanındaki herhangi bir sorun public teklif
   formunu ÇÖKERTMEZ — boş harita döner, tüketici TR'ye düşer. */
async function resolveTaxonomyNames(
  types: readonly TaxonomyRow[],
  features: readonly TaxonomyRow[]
): Promise<{
  typeNames: Record<string, TaxonomyNameByLocale>;
  featureNames: Record<string, TaxonomyNameByLocale>;
}> {
  const empty = { typeNames: {}, featureNames: {} };
  try {
    const settings = await getCachedSettings().catch(() => null);
    if (!isMultilingualEnabled(settings)) return empty;

    const typeIds = types.map(rowId).filter((id) => id.length > 0);
    const featureIds = features.map(rowId).filter((id) => id.length > 0);

    /* İki entity PARALEL; her biri kendi içinde en+de batch'i yapar. */
    const [typeNames, featureNames] = await Promise.all([
      getVillaTypeNamesByLocale(typeIds),
      getVillaFeatureNamesByLocale(featureIds),
    ]);
    return { typeNames, featureNames };
  } catch {
    return empty;
  }
}
