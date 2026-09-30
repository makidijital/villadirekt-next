/* ===============================================================
   🛡️ VILLA LAYOUT LABEL HELPER — PHASE 10E
   ===============================================================
   Yatak tipi / banyo tipi ENUM etiketlerinin locale'e göre çözülmesi.

   KAPSAM: yalnız KAPALI KÜME enum etiketleri (BED_TYPES 6 değer,
   BATHROOM_TYPES 3 değer — migration 047). Oda/banyo ADLARI serbest
   metindir, bu helper'ın kapsamı DIŞI — onlar villa bazlı DB çevirisi
   olarak DEĞİL, aşağıdaki `roomNameLabels` sözlüğünden çözülür.

   MİMARİ KARAR: Batch 4'teki `lib/distance-label.helper.ts` deseninin
   BİREBİR aynısı — mevcut i18n dictionary sistemi (getDictionary)
   reuse edilir, yeni bir çeviri mekanizması İCAT EDİLMEZ.

   ⚠️ `lib/villa-layout.helper.ts` DEĞİŞTİRİLMEDİ: oradaki
   BED_TYPE_LABELS/BATHROOM_TYPE_LABELS TR sabitleri admin formunun
   (AccommodationLayoutStep) kullandığı haliyle AYNEN duruyor; bu dosya
   yalnız TİP'lerini type-only import eder (sıfır runtime etkisi) ve
   locale-aware okuma için AYRI bir yol sunar.

   DB'YE HİÇBİR ERİŞİM YOK. Saf (pure), server ve client'ta çağrılabilir.
   =============================================================== */

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";
import type { BedType, BathroomType } from "@/lib/villa-layout.helper";

/**
 * Yatak tipi etiketini locale'e göre döner.
 *   getBedTypeLabel("double", "tr") → "Çift Kişilik Yatak"
 *   getBedTypeLabel("double", "en") → "Double Bed"
 *   getBedTypeLabel("double", "de") → "Doppelbett"
 *
 * Savunmacı fallback: dictionary'de (beklenmedik şekilde) yoksa enum
 * anahtarının kendisi döner — asla undefined/boş render edilmez.
 */
export function getBedTypeLabel(type: BedType, locale: Locale): string {
  const dict = getDictionary(locale);
  return dict.bedTypeLabels[type] || type;
}

/**
 * Banyo tipi etiketini locale'e göre döner.
 *   getBathroomTypeLabel("shower_wc", "tr") → "Duş + WC"
 *   getBathroomTypeLabel("shower_wc", "en") → "Shower + WC"
 *   getBathroomTypeLabel("shower_wc", "de") → "Dusche + WC"
 */
export function getBathroomTypeLabel(
  type: BathroomType,
  locale: Locale
): string {
  const dict = getDictionary(locale);
  return dict.bathroomTypeLabels[type] || type;
}


/* ===============================================================
   🛡️ PHASE 10F — ODA / BANYO ADI ETİKETLERİ
   ===============================================================
   Villa bazlı EN/DE oda-banyo adı çevirisi (villa_translations.
   bedroom_layout / bathroom_layout) KALDIRILDI. Adlar artık YALNIZ
   sözlükten çözülür — admin tarafında ayrıca çevrilmez.

   ÇÖZÜM SIRASI (her iki fonksiyon için de aynı, deterministik):
     1) boş ad            → "" (çağıran taraf kendi numara fallback'ini uygular)
     2) "N. <temel ad>"   → mevcut accommodation.bedroomFallback /
                            bathroomFallback şablonu ({n}) ile üretilir
     3) sözlükte tam eşleşme → karşılığı
     4) hiçbiri           → TR adın KENDİSİ (doğal fallback)

   Serbest yazılmış adlar (örn. "Deniz Manzaralı Süit") 4. adıma düşer
   ve her locale'de olduğu gibi görünür — bilinçli davranış.

   TR'de sözlük identity-map olduğundan TR çıktısı DEĞİŞMEZ.
   =============================================================== */

/** "3. Yatak Odası" → { n: 3, base: "Yatak Odası" }; eşleşmezse null. */
function parseNumberedName(
  name: string,
  base: string
): number | null {
  const match = name.match(/^(\d+)\.\s*(.+)$/);
  if (!match) return null;
  if (match[2].trim() !== base) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveRoomName(
  rawName: string | null | undefined,
  locale: Locale,
  numberedBase: string,
  numberedTemplate: (dict: ReturnType<typeof getDictionary>) => string
): string {
  if (!rawName) return "";
  const name = String(rawName).trim();
  if (!name) return "";

  const dict = getDictionary(locale);

  const numbered = parseNumberedName(name, numberedBase);
  if (numbered !== null) {
    return formatDictionaryString(numberedTemplate(dict), { n: numbered });
  }

  return dict.roomNameLabels[name] || name;
}

/**
 * Oda adını locale'e göre çözer.
 *   getBedroomNameLabel("Ana Yatak Odası", "en") → "Master Bedroom"
 *   getBedroomNameLabel("2. Yatak Odası", "de")  → "Schlafzimmer 2"
 *   getBedroomNameLabel("Ana Yatak Odası", "tr") → "Ana Yatak Odası"
 *   getBedroomNameLabel("Deniz Manzaralı Süit", "en") → "Deniz Manzaralı Süit"
 */
export function getBedroomNameLabel(
  name: string | null | undefined,
  locale: Locale
): string {
  return resolveRoomName(
    name,
    locale,
    "Yatak Odası",
    (dict) => dict.accommodation.bedroomFallback
  );
}

/**
 * Banyo adını locale'e göre çözer.
 *   getBathroomNameLabel("1. Banyo", "en") → "Bathroom 1"
 *   getBathroomNameLabel("1. Banyo", "tr") → "1. Banyo"
 */
export function getBathroomNameLabel(
  name: string | null | undefined,
  locale: Locale
): string {
  return resolveRoomName(
    name,
    locale,
    "Banyo",
    (dict) => dict.accommodation.bathroomFallback
  );
}
