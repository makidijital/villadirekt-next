"use server";

/* 🛡️ Villa Migration S8J — findRawByIdSingle native twin'e (S8I, byte-
   identical `.single()` + PGRST116) repoint. Bu dosya "use server" →
   server-only native repo import'u güvenli. villaRepository yalnız
   findRawByIdSingle için; call-site aynı (villaAdminRepository → villaRepository alias). */
import { requirePermission } from "@/lib/auth/action-authz";
import { villaAdminRepository as villaRepository } from "@/lib/db/villa.repository.server";
import { villaLocationRepository } from "@/lib/db/villa-location.repository";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { villaFeatureRepository } from "@/lib/db/villa-feature.repository";
import { ruleItemRepository } from "@/lib/db/rule-item.repository";
import { priceIncludeItemRepository } from "@/lib/db/price-include-item.repository";
import { getVillaDistances } from "@/app/services/villa-distance.service";
import { getVillaPrices } from "@/app/services/villa-price.service";

/* ===============================================================
   🛡️ VILLA EDIT — READ ORCHESTRATION (SERVER ACTION)
   ===============================================================
   villas/[id]/page (client) düzenleme formunun tüm okumalarını artık
   DOĞRUDAN repository/service yerine bu server action üzerinden yapar
   → 6 repository + 2 service (ve `@/lib/db`) client bundle'ına GİRMEZ.

   ⚠️ ORCHESTRATION-ONLY: yeni sorgu/mantık YOK; mevcut repo/service
   fonksiyonları tek gerçek kaynak. Hepsi public RLS okuması → server
   tarafında anon ile birebir çalışır. Hidrate/filter/map mantığı
   bileşende AYNEN kalır (bu action ham veriyi döndürür).

   ⚠️ Yazma (kaydet) bu action'da DEĞİL — mevcut `PUT /api/admin/villas/
   [id]/full` route'u (server-side, dbAdmin) aynen kullanılır.
   =============================================================== */
export async function loadVillaEditData(id: string) {
  await requirePermission("villas");
  const [
    villa,
    locations,
    types,
    selectedTypes,
    features,
    selectedFeatures,
    distances,
    prices,
    ruleItems,
    selectedRules,
    priceIncludeItems,
    selectedIncludes,
  ] = await Promise.all([
    villaRepository.findRawByIdSingle(id),
    villaLocationRepository.findAllStar(),
    villaTypeRepository.findAllStarUnordered(),
    villaTypeRepository.findTypeIdsByVilla(id),
    villaFeatureRepository.findAllStar(),
    villaFeatureRepository.findFeatureIdsByVilla(id),
    getVillaDistances(id),
    getVillaPrices(id),
    ruleItemRepository.findAllOrderedAsc(),
    ruleItemRepository.findRuleIdsByVilla(id),
    priceIncludeItemRepository.findAllOrderedAsc(),
    priceIncludeItemRepository.findIncludeIdsByVilla(id),
  ]);

  return {
    villa: villa.data,
    locations: locations.data,
    types: types.data,
    selectedTypes: selectedTypes.data,
    features: features.data,
    selectedFeatures: selectedFeatures.data,
    distances,
    prices,
    ruleItems: ruleItems.data,
    selectedRules: selectedRules.data,
    priceIncludeItems: priceIncludeItems.data,
    selectedIncludes: selectedIncludes.data,
  };
}
