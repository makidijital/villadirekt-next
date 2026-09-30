/* 🛡️ FAZ 2 STABILIZATION — server-role repo (dbAdmin) RLS bypass.
   ⚠️ DATA-INTEGRITY FIX — bkz. create.service.ts üst header. Aynı
   silent-fail tuzağı update path'inde de vardı (eski `setVillaPrices`
   + `setVillaDistances` anon repo + console.error swallow). Server-only
   variant'a geçildi. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { setVillaDistancesServer } from "../villa-distance.service.server";
import { setVillaPricesServer } from "../villa-price.service.server";

import { buildVillaCorePayload } from "./_helpers/payload";
import { generateUniqueSlug } from "./_helpers/slug";
import { sanitizeDistances } from "./_helpers/distances";
import {
  replaceVillaTypeRelations,
  replaceVillaFeatureRelations,
  replaceVillaRuleRelations,
  replaceVillaPriceIncludeRelations,
} from "./_helpers/relations";

import type { VillaUpdatePayload } from "./types";

/* ===============================================================
   🛡️ FAZ 3 — updateVillaFull (ORCHESTRATOR)
   ===============================================================
   Eski villa-admin.service.ts > updateVillaFull'un BYTE-IDENTICAL
   karşılığı; tüm pure body helper'lara delege edildi. Orchestrator
   yalnız:
     - validate (title zorunlu)
     - slug üretimi (id exclude)
     - villa UPDATE
     - 2 relation ALWAYS replace_* RPC
     - distances / prices ALWAYS sync
     - 2 relation CONDITIONAL replace_* RPC (`!== undefined` guard)
   sırasını yönetir.

   ⚠️ ORCHESTRATION SIRASI BYTE-IDENTICAL (AST contract FAZ 5):
     1. validate form.title
     2. await generateUniqueSlug(title, id)
     3. await db.update(buildVillaCorePayload(...))
     4. ALWAYS await replaceVillaTypeRelations(id, typeIds)
     5. ALWAYS await replaceVillaFeatureRelations(id, featureIds)
     6. ALWAYS await setVillaDistances(id, sanitizeDistances(...))
     7. ALWAYS await setVillaPrices(id, prices ?? [])
     8. CONDITIONAL await replaceVillaRuleRelations (if !== undefined)
     9. CONDITIONAL await replaceVillaPriceIncludeRelations (if !== undefined)
    10. return true

   ⚠️ ASIMETRİ (BİLİNÇLİ — preserved):
     - Create: relation'lar `.length > 0` koşullu INSERT
     - Update: ilk 2 relation ALWAYS replace_* RPC (empty array OK),
               son 2 relation CONDITIONAL replace_* (`!== undefined`)
     - distances / prices Update'te ALWAYS (boş array fallback)
=============================================================== */

export async function updateVillaFull({
  id,
  form,
  selectedLocation,
  selectedTypes,
  selectedFeatures,
  mapData,
  distances,
  prices,
  selectedRules,
  selectedPriceIncludes,
}: VillaUpdatePayload): Promise<true> {

  if (!form.title) {
    throw new Error("Villa adı zorunlu");
  }

  // ✅ UNIQUE SLUG
  const slug =
    await generateUniqueSlug(
      form.title,
      id
    );

  // 🔥 UPDATE
  /* FAZ 37: DB I/O villaAdminRepository.updateVillaById delege.
     Predicate (.eq("id", id)) repo içinde aynen. */
  const { error } = await villaAdminRepository.updateVillaById(
    id,
    buildVillaCorePayload({
      form,
      mapData,
      selectedLocation,
      slug,
    })
  );

  if (error) {
    console.error(
      "❌ Villa update error:",
      error.message
    );

    throw error;
  }

  // 🔥 RESET TYPES
  // 🛡️ ATOMIC REPLACE-ALL (db/migrations/002): DELETE+INSERT artık
  // tek RPC içinde transactional; insert fail olursa rollback.
  {
    const typeIds: string[] = Array.isArray(selectedTypes)
      ? selectedTypes
      : [];
    await replaceVillaTypeRelations(id, typeIds);
  }

  // 🔥 RESET FEATURES
  // 🛡️ ATOMIC REPLACE-ALL (db/migrations/002).
  {
    const featureIds: string[] = Array.isArray(selectedFeatures)
      ? selectedFeatures
      : [];
    await replaceVillaFeatureRelations(id, featureIds);
  }

  // 🔥 DISTANCES
  /* 🛡️ Server-only variant — RLS bypass + throws on error. */
  await setVillaDistancesServer(
    id,
    sanitizeDistances(distances)
  );

  // 🔥 PRICES
  /* 🛡️ Server-only variant — RLS bypass + throws on error. */
  await setVillaPricesServer(
    id,
    prices ?? []
  );

  /* ===============================================================
     🔥 RULES — relation sync
     ===============================================================
     selectedRules: string[] (rule_items.id).
     undefined geçilirse hiç dokunulmaz (geri uyumluluk).
     🛡️ ATOMIC REPLACE-ALL (db/migrations/002): replace_villa_rule_relations
     RPC DELETE+INSERT'i tek transaction'da çalıştırır.
     =============================================================== */
  if (selectedRules !== undefined) {
    const ruleIds: string[] = Array.isArray(selectedRules)
      ? selectedRules
      : [];
    await replaceVillaRuleRelations(id, ruleIds);
  }

  /* ===============================================================
     🔥 PRICE INCLUDES — relation sync
     ===============================================================
     selectedPriceIncludes: string[] (price_include_items.id).
     ⚠️ Relation kolonu "include_id" — "price_include_id" DEĞİL.
     🛡️ ATOMIC REPLACE-ALL (db/migrations/002): replace_villa_price_include_relations
     RPC DELETE+INSERT'i tek transaction'da çalıştırır.
     =============================================================== */
  if (selectedPriceIncludes !== undefined) {
    const includeIds: string[] = Array.isArray(selectedPriceIncludes)
      ? selectedPriceIncludes
      : [];
    await replaceVillaPriceIncludeRelations(id, includeIds);
  }

  return true;
}
