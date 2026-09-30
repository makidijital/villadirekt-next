import { normalizeYouTubeVideos } from "@/lib/youtube.helper";
import {
  normalizeBedroomLayoutForDb,
  normalizeBathroomLayoutForDb,
  type BedroomLayoutItem,
  type BathroomLayoutItem,
} from "@/lib/villa-layout.helper";

import type { VillaForm } from "../types";

/* ===============================================================
   🛡️ FAZ 2 — VILLA FORM NORMALIZERS (PURE)
   ===============================================================
   Eski villa-admin.service.ts içinde `createVillaFull` + `updateVillaFull`
   INSERT/UPDATE payload object'lerinde **birebir aynı şekilde** 2x
   tekrarlanan inline normalizasyon mantığı. Pure, deterministic,
   zero-side-effect.

   ⚠️ KESIN KURAL: Coercion semantic'i BYTE-IDENTICAL.
     - `=== "" || === null || === undefined` üçleme guard'ı korundu
     - `Number(...)` cast'i korundu (NaN → fallback chain)
     - `Math.floor(...)` integer normalize korundu
     - `Number.isFinite + range check (0-100)` aralık kuralı korundu
     - `DEFAULT_COMMISSION_RATE = 20` korundu
     - Empty-array → null fallback (youtube) korundu

   KULLANIM:
     buildVillaCorePayload (payload.ts) tek caller.
     createVillaFull + updateVillaFull artık tek helper'dan akar.
=============================================================== */

/** Komisyon oranı fallback'i. UI ve service-side tutarlı (eski
 *  inline `DEFAULT_COMMISSION_RATE = 20` aynen). */
export const DEFAULT_COMMISSION_RATE = 20;

/* ---------------------------------------------------------------
   🔥 CUSTOM PREPAYMENT RATE
   ---------------------------------------------------------------
   NULL = global fallback (settings.prepayment_rate).
   Boş string / null / undefined → null.
   Diğer her şey → Number(raw). (NaN için ek koruma YOK — eski
   davranış aynen; admin form normalize ile validasyonu UI'da.)
*/
export function normalizeCustomPrepaymentRate(
  raw: VillaForm["custom_prepayment_rate"]
): number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  return Number(raw);
}

/* ---------------------------------------------------------------
   🛡️ HAVUZ ISITMA GECELİK ÜCRETİ (db/migrations/074 — 3. adım)
   ---------------------------------------------------------------
   NULL = "villa havuz ısıtma hizmeti sunmuyor" (migration 074
   semantiği). Boş string / null / undefined → null. 0 LİTERAL
   olarak korunur (normalizeMinimumStayNights'ın aksine 0'ı null'a
   düşürmez — admin 0 girebilir, NULL ile fonksiyonel eşdeğerdir
   ama veri modelinde ayrı bir değerdir). Diğer her şey → Number(raw).
   normalizeCustomPrepaymentRate ile BİREBİR AYNI desen.
   ⚠️ Bu adımda sadece veri modeli/form hazırlığı — hesaplama
   (nights × fee) price.engine.ts'te (2. adımda) zaten hazır, burada
   TEKRARLANMAZ.
*/
export function normalizePoolHeatingFee(
  raw: VillaForm["pool_heating_fee"]
): number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  return Number(raw);
}

/* ---------------------------------------------------------------
   🛡️ HAVUZ ISITMA — SEZONLUK AY KISITI (Migration 076, İLK KULLANIM)
   ---------------------------------------------------------------
   NULL/undefined → null ("ay kısıtlaması yok", 12 ay aktif — mevcut
   ~1595 villa için geriye dönük uyumlu varsayılan; bu villalarda
   admin formu bu alana hiç dokunmadığı sürece NULL kalır).
   Dizi değilse (ör. yanlışlıkla obje/string gelirse) → null
   (defansif — normalizePoolHeatingFee'nin "" → null davranışıyla
   aynı temkinli yaklaşım).
   Dizi ise: 1-12 aralığı dışındaki değerler ELENIR, tekrarlar
   ELENIR, sonuç sayısal olarak SIRALANIR — admin formunun
   checkbox sırası ile DB'deki temsil arasında stabil/deterministik
   bir eşleme sağlar (ör. [9,1,1,3] → [1,3,9]).
   Boş dizi [] → [] olarak KORUNUR (silinmez/null'a düşürülmez) —
   "hiçbir ay aktif değil" admin'in BİLİNÇLİ olarak üretebileceği
   bir durum; isPoolHeatingActiveForRange (price.engine.ts) bunu
   "asla aktif değil" olarak yorumlar. Hesaplama BU ADIMDA YAPILMAZ.
*/
export function normalizePoolHeatingMonths(
  raw: VillaForm["pool_heating_months"]
): number[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return null;

  const unique = new Set<number>();
  for (const item of raw) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 1 && n <= 12) {
      unique.add(n);
    }
  }

  return Array.from(unique).sort((a, b) => a - b);
}

/* ---------------------------------------------------------------
   🛡️ TOURISM DOCUMENT NUMBER (db/migrations/017 — Faz 22)
   ---------------------------------------------------------------
   T.C. Kültür ve Turizm Bakanlığı belge no — ham text passthrough.
   Boş string / null / undefined → null (DB tutarlılığı).
   Sanitize / uppercase / formatting YAPILMIYOR.
*/
export function normalizeTourismDocumentNumber(
  raw: VillaForm["tourism_document_number"]
): string | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  return String(raw);
}

/* ---------------------------------------------------------------
   🛡️ MINIMUM STAY NIGHTS (Faz 26B/C)
   ---------------------------------------------------------------
   NULL / non-number / <=0 / non-finite → null (enforcement YOK).
   >0 → Math.floor(int).
*/
export function normalizeMinimumStayNights(
  raw: VillaForm["minimum_stay_nights"]
): number | null {
  if (
    typeof raw === "number" &&
    Number.isFinite(raw) &&
    raw > 0
  ) {
    return Math.floor(raw);
  }
  return null;
}

/* ---------------------------------------------------------------
   🛡️ YOUTUBE VIDEOS (db/migrations/033 — JSONB)
   ---------------------------------------------------------------
   - `normalizeYouTubeVideos` (lib/youtube.helper) — invalid item
     drop + duplicate ID dedup + ID 11-char pattern enforce.
   - Sonuç boş array ise NULL'a düşer ("hiç video yok" semantic'i).
*/
export function normalizeYouTubeVideosForDb(
  raw: VillaForm["youtube_videos"]
): { id: string; url: string }[] | null {
  const normalized = normalizeYouTubeVideos(raw);
  return normalized.length > 0 ? normalized : null;
}

/* ---------------------------------------------------------------
   🛡️ KONAKLAMA DÜZENİ (db/migrations/047 — JSONB)
   ---------------------------------------------------------------
   - lib/villa-layout.helper > normalize*ForDb: geçersiz tip/satır
     drop + count clamp; boş array → NULL ("düzen yok" semantic'i,
     youtube_videos ile birebir).
   - youtube_videos pattern'iyle aynı: DB write öncesi sanitize.
*/
export function normalizeBedroomLayoutForVilla(
  raw: VillaForm["bedroom_layout"]
): BedroomLayoutItem[] | null {
  return normalizeBedroomLayoutForDb(raw);
}

export function normalizeBathroomLayoutForVilla(
  raw: VillaForm["bathroom_layout"]
): BathroomLayoutItem[] | null {
  return normalizeBathroomLayoutForDb(raw);
}

/* ---------------------------------------------------------------
   🛡️ COMMISSION RATE — accounting foundation
   ---------------------------------------------------------------
   - null/undefined/"" → DEFAULT_COMMISSION_RATE (20)
   - 0-100 aralığında finite number → as-is (0 izinli)
   - Aksi (NaN, negatif, >100, non-finite) → DEFAULT_COMMISSION_RATE
*/
export function normalizeCommissionRate(
  raw: VillaForm["commission_rate"]
): number {
  const n =
    raw === null || raw === undefined || raw === ""
      ? DEFAULT_COMMISSION_RATE
      : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100
    ? n
    : DEFAULT_COMMISSION_RATE;
}
