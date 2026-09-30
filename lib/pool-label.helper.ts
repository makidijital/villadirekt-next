/* ===============================================================
   🛡️ POOL LABEL HELPER — PHASE 10E BATCH 5
   ===============================================================
   Canonical havuz tipinin (lib/pool.helper.ts → PoolTypeKey)
   locale'e göre etiketini çözer.

   MİMARİ: Batch 1'in `lib/villa-layout-label.helper.ts` ve Batch 4'ün
   `lib/distance-label.helper.ts` deseniyle BİREBİR aynı — mevcut i18n
   dictionary sistemi (getDictionary) reuse edilir, yeni çeviri
   mekanizması İCAT EDİLMEZ.

   TEK YÖN: tip → etiket. Etiketten tipe dönüş YOKTUR; ikon/davranış
   her zaman canonical `PoolTypeKey` üzerinden belirlenir.

   DB erişimi YOK. Saf (pure), server ve client'ta çağrılabilir.
   =============================================================== */

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import type { PoolTypeKey } from "@/lib/pool.helper";

/**
 * Havuz tipi etiketini locale'e göre döner.
 *   getPoolTypeLabel("private", "tr")           → "Özel Havuz"
 *   getPoolTypeLabel("private_sheltered", "tr") → "Özel Korunaklı Havuz"
 *   getPoolTypeLabel("shared", "en")            → "Shared Pool"
 *   getPoolTypeLabel("indoor", "de")            → "Hallenbad"
 *
 * Savunmacı fallback: dictionary'de (beklenmedik şekilde) yoksa tip
 * anahtarının kendisi döner — asla undefined/boş render edilmez.
 */
export function getPoolTypeLabel(type: PoolTypeKey, locale: Locale): string {
  const dict = getDictionary(locale);
  return dict.poolTypeLabels[type] || type;
}
