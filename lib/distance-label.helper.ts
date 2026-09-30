/* ===============================================================
   🛡️ DISTANCE LABEL HELPER — PHASE 10D BATCH 4
   ===============================================================
   AMAÇ: LocationStep'teki 12 canonical mesafe TITLE'ının (bkz.
   lib/distance.helper.ts → DISTANCE_OPTIONS/isCanonicalDistanceTitle)
   public EN/DE sayfalarında locale'e göre çözülmesi.

   KAPSAM DIŞI: Mesafe DEĞERİ ("5 km", "500 m") bu helper'a hiç
   girmez ve ASLA çevrilmez — çağıran taraf ham `distance.distance`
   alanını DOĞRUDAN kullanmalı (bkz. page.tsx'teki displayDistance).

   MİMARİ KARAR: Mevcut `lib/distance.helper.ts` "PURE & SSR-SAFE:
   React/DOM bağımlılığı yok... Yalnız string + array sabitleri"
   olarak dokümante edilmiş ve i18n/Locale'e hiç bağımlı değil — bu
   helper'ı ORAYA eklemek yerine (gereksiz dokunma/scope genişletme
   riski) AYRI bir dosyada tutuluyor; `lib/distance.helper.ts`'e bu
   batch'te HİÇ dokunulmadı. `getDictionary`/`Dictionary` DIŞINDA
   yeni bir çeviri mekanizması İCAT EDİLMEDİ — mevcut i18n dictionary
   sistemi (lib/i18n/get-dictionary.ts) reuse edildi.

   DB'YE HİÇBİR YAZMA/OKUMA YOK. `villa_distance_translations`
   TABLOSU KULLANILMIYOR — yalnız statik dictionary lookup. Saf
   (pure), server ve client'ta güvenle çağrılabilir (getDictionary de
   aynı şekilde pure/static import, server-only DEĞİL).

   FALLBACK KURALI (kritik — legacy/custom title'lar asla yanlışlıkla
   dictionary'de aranmaz):
     - title canonical (DISTANCE_OPTIONS'ta varsa) → dictionary'den
       locale'e göre çözülmüş karşılığı döner (tr için dictionary
       identity-map olduğundan orijinal TR title'la AYNI değeri
       döner).
     - title canonical DEĞİLSE (legacy/custom, örn. "Migros",
       "Eski Özel Mesafe") → title'ın KENDİSİ hiç değiştirilmeden
       döner.
   =============================================================== */

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import { isCanonicalDistanceTitle } from "@/lib/distance.helper";
import type { DistanceCanonicalTitle } from "@/lib/i18n/dictionaries/types";

/**
 * Bir mesafe TITLE'ını (yalnız title — distance DEĞERİ DEĞİL) verilen
 * locale'e göre çözer.
 *
 * Örnekler:
 *   getTranslatedDistanceLabel("Restoran", "en") → "Restaurant"
 *   getTranslatedDistanceLabel("Restoran", "de") → "Restaurant"
 *   getTranslatedDistanceLabel("Restoran", "tr") → "Restoran"
 *   getTranslatedDistanceLabel("Eski Özel Mesafe", "en") → "Eski Özel Mesafe"
 */
export function getTranslatedDistanceLabel(
  title: string | null | undefined,
  locale: Locale
): string {
  if (!title) return "";
  const trimmed = String(title).trim();
  if (!trimmed) return "";
  if (!isCanonicalDistanceTitle(trimmed)) return trimmed;

  const dict = getDictionary(locale);
  const translated = dict.distanceLabels[trimmed as DistanceCanonicalTitle];
  /* Savunmacı fallback: dictionary'de (beklenmedik şekilde) yoksa
     orijinal title'a düş — asla undefined/boş render etme. */
  return translated || trimmed;
}
