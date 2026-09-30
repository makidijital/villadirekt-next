import { calculateNights } from "@/lib/price.engine";
import { parseLocalDate, formatLocalDate } from "@/lib/date-format";

/* ===============================================================
   🛡️ STAY RULES — ORPHAN GAP KONTROLÜ (SAF / PURE)
   ===============================================================
   AMAÇ:
     Minimum konaklama (minimum_stay_nights) kuralını İHLAL ETMEDEN,
     bir seçimin ÖNÜNDE veya ARKASINDA "minimum stay'den kısa +
     kullanılamaz" bir boşluk (orphan gap) bırakmasını engeller.

   ⚠️ NE DEĞİLDİR (bilinçli sınırlar):
     - Minimum-stay kuralının KENDİSİ DEĞİL. `selectedNights >= minStay`
       kontrolü + mevcut exact gap-fill davranışı çağıran tarafta
       (useBookingEngine) AYNEN durur. Bu helper YALNIZ orphan-gap'e bakar.
     - Availability TOPLAMAZ, DB'ye ERİŞMEZ, fetch YAPMAZ, side-effect YOK.
       "Dolu gece" kümesini çağıran taraf (frontend merged arrays / backend
       blocked-ranges) hazırlayıp verir. Kaynak birleştirme mantığı DEĞİŞMEZ.
     - Yeni tarih matematiği YAZMAZ: `calculateNights` + `parseLocalDate` /
       `formatLocalDate` mevcut helper'ları yeniden kullanır (checkout-
       exclusive, daterange [) semantiği AYNEN).

   TARİH SEMANTİĞİ (mevcut sistemle birebir):
     - Bir rezervasyon [start_date, end_date) geceleri İŞGAL eder; end_date
       (checkout) günü BOŞ (yeni check-in'e açık).
     - "Dolu gece" = occupiedNightKeys içindeki her "YYYY-MM-DD".
     - Seçim: fromKey (check-in) → toKey (checkout, hariç). İşgal ettiği
       geceler from..to-1.

   KURAL (matematik):
     minStay = N (yalnız N>=2 anlamlı; <2 → kural etkisiz).
     Seçim, içinde bulunduğu boş bloğu: [sol kalan | seçim | sağ kalan]
     diye böler.
       - sol kalan = fromKey'den GERİYE ilk dolu geceye (veya today
         sınırına) kadar ardışık boş gece sayısı.
       - sağ kalan = toKey'den (ilk boş gece) İLERİ ilk dolu geceye kadar
         ardışık boş gece sayısı.
     GEÇERSİZ (orphan) ⇔  (0 < sol kalan < N)  VEYA  (0 < sağ kalan < N).
       - kalan = 0  → sınıra dayalı, sorun yok.
       - kalan >= N → başka müşteri kiralayabilir, sorun yok.
       - seçim boşluğun TAMAMINI dolduruyorsa → iki kalan da 0 → GEÇERLİ
         (exact gap-fill korunur; bu helper onu ENGELLEMEZ).
     Tarama her yönde en fazla N adım (kalan >= N bulununca durur) →
     sonsuz döngü yok, O(N).

   TODAY SINIRI:
     Geçmiş/bugün öncesi satılamaz → `todayKey` SOL KAPALI SINIR sayılır
     (useBookingEngine gap-fill mantığıyla tutarlı: sol sınır = bir bloğun
     çıkışı VEYA today). Sağ tarafta böyle bir sınır yoktur (gelecek açık).
   =============================================================== */

export type StayRuleReason =
  | "ok"
  | "disabled" // orphan kuralı kapalı (setting OFF) veya minStay<2 → kontrol yok
  | "noop" // yarım/geçersiz seçim → kontrol atlanır (mevcut validation devrede)
  | "orphan-left"
  | "orphan-right";

export interface StayRuleInput {
  /** Seçilen check-in "YYYY-MM-DD". */
  fromKey: string;
  /** Seçilen checkout "YYYY-MM-DD" (HARİÇ — o gece boş). */
  toKey: string;
  /** Villa minimum_stay_nights (ham; <2 → kural etkisiz, mevcut davranış). */
  minStayNights: number | null | undefined;
  /** Her DOLU gece "YYYY-MM-DD" (çağıran taraf merged availability'den kurar). */
  occupiedNightKeys: ReadonlySet<string>;
  /** Bugün "YYYY-MM-DD" (sol kapalı sınır). */
  todayKey: string;
  /** Orphan-gap kuralı açık mı (admin ayarı). Kapalıysa helper no-op. */
  orphanRuleEnabled: boolean;
}

export interface StayRuleResult {
  /** false → seçim orphan gap bırakıyor, ENGELLENMELİ. */
  valid: boolean;
  reason: StayRuleReason;
  /** Teşhis/mesaj için (gece). */
  leftGap: number;
  rightGap: number;
  minStay: number;
}

/** "YYYY-MM-DD" → n gün ötelenmiş "YYYY-MM-DD" (LOCAL; UTC drift yok). */
function shiftKey(key: string, deltaDays: number): string {
  const d = parseLocalDate(key);
  d.setDate(d.getDate() + deltaDays);
  return formatLocalDate(d);
}

/**
 * Bir seçimin orphan gap bırakıp bırakmadığını değerlendirir.
 * Minimum-stay'in KENDİSİNİ kontrol ETMEZ (o çağıran tarafta).
 */
export function evaluateOrphanGap(input: StayRuleInput): StayRuleResult {
  const { fromKey, toKey, occupiedNightKeys, todayKey } = input;

  const minStay =
    typeof input.minStayNights === "number" &&
    Number.isFinite(input.minStayNights) &&
    input.minStayNights >= 2
      ? Math.floor(input.minStayNights)
      : 0;

  // Setting kapalı VEYA minStay anlamsız (<2) → orphan kuralı devre dışı.
  if (!input.orphanRuleEnabled || minStay === 0) {
    return { valid: true, reason: "disabled", leftGap: 0, rightGap: 0, minStay };
  }

  // Yarım/geçersiz seçim → mevcut validation ilgilensin.
  if (!fromKey || !toKey) {
    return { valid: true, reason: "noop", leftGap: 0, rightGap: 0, minStay };
  }
  const nights = calculateNights(fromKey, toKey);
  if (!Number.isFinite(nights) || nights <= 0) {
    return { valid: true, reason: "noop", leftGap: 0, rightGap: 0, minStay };
  }

  // SOL KALAN — fromKey'in bir önceki gecesinden geriye. today = kapalı sınır.
  let leftGap = 0;
  let cursor = shiftKey(fromKey, -1);
  while (
    leftGap < minStay &&
    cursor >= todayKey &&
    !occupiedNightKeys.has(cursor)
  ) {
    leftGap += 1;
    cursor = shiftKey(cursor, -1);
  }

  // SAĞ KALAN — toKey (ilk boş gece) ileri. Gelecekte sınır yoksa minStay'e
  // ulaşır (>= minStay → sorun yok). "YYYY-MM-DD" string sıralaması yeterli.
  let rightGap = 0;
  cursor = toKey;
  while (rightGap < minStay && !occupiedNightKeys.has(cursor)) {
    rightGap += 1;
    cursor = shiftKey(cursor, 1);
  }

  const leftBad = leftGap > 0 && leftGap < minStay;
  const rightBad = rightGap > 0 && rightGap < minStay;

  if (leftBad) {
    return { valid: false, reason: "orphan-left", leftGap, rightGap, minStay };
  }
  if (rightBad) {
    return { valid: false, reason: "orphan-right", leftGap, rightGap, minStay };
  }
  return { valid: true, reason: "ok", leftGap, rightGap, minStay };
}

/** Occupied-night key set kurucu — [start,end) → her gece. Çağıran taraf
 *  (frontend/backend) blocked-range listelerini bununla tek küme yapar.
 *  ⚠️ Availability KAYNAKLARINI birleştirmez; yalnız verilen aralıkları
 *  gece-anahtarına açar (checkout-exclusive). */
export function occupiedNightsFromRanges(
  ranges: ReadonlyArray<{ start: string; end: string }>
): Set<string> {
  const set = new Set<string>();
  for (const r of ranges) {
    if (!r?.start || !r?.end) continue;
    let cur = r.start.slice(0, 10);
    const end = r.end.slice(0, 10); // HARİÇ (checkout)
    // Güvenlik: en fazla ~2 yıl; bozuk aralıkta sonsuz döngü olmasın.
    let guard = 0;
    while (cur < end && guard < 800) {
      set.add(cur);
      cur = shiftKey(cur, 1);
      guard += 1;
    }
  }
  return set;
}
