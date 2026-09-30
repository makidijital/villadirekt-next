import "server-only";

import { getCachedSettings } from "@/lib/cache.helpers";
import { reservationRepository } from "@/lib/db/reservation.repository";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { fetchExternalCalendarStringsForVilla } from "@/lib/external-calendar.public.helper";
import { formatLocalDate } from "@/lib/date-format";
import {
  evaluateOrphanGap,
  occupiedNightsFromRanges,
} from "@/lib/stay-rules.helper";

/* ===============================================================
   🛡️ STAY VERIFY — BACKEND ORPHAN-GAP GATE (public reservations POST)
   ===============================================================
   Frontend (useBookingEngine) orphan kuralını uygular; frontend BYPASS
   edilirse aynı kural burada da doğrulanır. Bu dosya YALNIZ orphan-gap'i
   backend'de zorlar; mevcut overlap/fiyat/reservation-create akışına
   DOKUNMAZ (ayrı, additive gate — POST route içinde createReservation'dan
   ÖNCE çağrılır).

   AVAILABILITY SOURCE OF TRUTH (mevcut sistem, DEĞİŞMEZ):
     - reservations(pending/confirmed) + manual → get_villa_blocked_ranges RPC
       (reservationRepository.getBlockedRanges) → {start_date,end_date}[]
     - external_calendar_events → fetchExternalCalendarStringsForVilla
     Bu üçü frontend merged availability ile AYNI kaynak → occupied gece
     kümesi frontend ile birebir örtüşür. Yeni availability mimarisi YOK.

   AYAR: settings.orphan_gap_rule_enabled (get_public_settings → getCachedSettings).
     - false → gate no-op (mevcut davranış).
     - null/okunamaz → FAIL-SAFE TRUE (kural açık kabul edilir).

   FAIL-OPEN (veri toplama): min-stay / ranges / external toplanamazsa
     (RPC/network hatası) booking BLOKLANMAZ — yalnız loglanır. Orphan
     ihlali NET hesaplanabiliyorsa throw edilir (route → 400). Böylece
     geçici bir okuma hatası tüm rezervasyonları düşürmez; overlap/DB
     bütünlüğü zaten EXCLUDE constraint + 031 trigger ile korunur.
   =============================================================== */

const ORPHAN_ERROR_MESSAGE =
  "Seçilen tarih aralığı, minimum konaklama süresinden daha kısa " +
  "kullanılamaz bir boşluk bırakıyor. Lütfen uygun bir aralık seçin.";

/** Public reservation create öncesi orphan-gap doğrulaması.
 *  Orphan ihlali → throw (createReservation'dan ÖNCE; route 400 döner).
 *  Kapalı/okunamaz/geçersiz → sessizce döner (fail-open). */
export async function verifyPublicReservationStayRules(input: {
  villa_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}): Promise<void> {
  const villaId = (input.villa_id || "").toString().trim();
  const startKey = (input.start_date || "").toString().slice(0, 10);
  const endKey = (input.end_date || "").toString().slice(0, 10);
  if (!villaId || !startKey || !endKey) return; // eksik → mevcut validation ilgilenir

  /* 1) Ayar — fail-safe TRUE. */
  let orphanRuleEnabled = true;
  try {
    const settings = await getCachedSettings();
    const raw = (settings as { orphan_gap_rule_enabled?: boolean | null } | null)
      ?.orphan_gap_rule_enabled;
    orphanRuleEnabled = raw === false ? false : true; // null/undefined → true
  } catch (e) {
    console.error("[stay-verify] settings read failed (fail-safe ON):", e);
    orphanRuleEnabled = true;
  }
  if (!orphanRuleEnabled) return; // kural kapalı → mevcut davranış

  /* 2) Villa min-stay + blocked ranges + external — FAIL-OPEN topla. */
  let minStay: number | null = null;
  const occupied = new Set<string>();
  try {
    const [configRes, blockedRes, externalStrings] = await Promise.all([
      villaAdminRepository.findAvailabilityConfigById(villaId),
      reservationRepository.getBlockedRanges(villaId),
      fetchExternalCalendarStringsForVilla(villaId),
    ]);

    const rawConfig = configRes?.data as
      | { minimum_stay_nights?: number | null }
      | null;
    minStay =
      typeof rawConfig?.minimum_stay_nights === "number"
        ? rawConfig.minimum_stay_nights
        : null;

    // reservations(confirmed) + manual → [start,end) geceleri.
    // ⚠️ FRONTEND HİZALAMASI: useBookingEngine orphan occupied kümesine YALNIZ
    //    `status === "confirmed"` rezervasyonları + TÜM manual'ı koyar; `pending`
    //    rezervasyonları AYRI dizilere alıp occupied'dan DIŞLAR. get_villa_blocked_
    //    ranges ise pending+confirmed döndürdüğü için burada pending elenir →
    //    backend orphan hesabı frontend ile birebir aynı olur (pending farkı biter).
    const ranges = Array.isArray(blockedRes?.data)
      ? (
          blockedRes.data as Array<{
            kind?: string;
            status?: string | null;
            start_date?: string;
            end_date?: string;
          }>
        )
          .filter((r) => r?.start_date && r?.end_date)
          // manual → hepsi; reservation → yalnız confirmed (pending hariç).
          .filter(
            (r) => r.kind === "manual" || r.status === "confirmed"
          )
          .map((r) => ({ start: r.start_date as string, end: r.end_date as string }))
      : [];
    for (const k of occupiedNightsFromRanges(ranges)) occupied.add(k);

    // external → checkin + middle geceleri (checkout HARİÇ; frontend ile aynı)
    if (externalStrings) {
      for (const v of externalStrings.checkin || []) occupied.add(v.slice(0, 10));
      for (const v of externalStrings.middle || []) occupied.add(v.slice(0, 10));
    }
  } catch (e) {
    // Veri toplanamadı → BLOKLAMA (fail-open); overlap DB tarafından korunur.
    console.error("[stay-verify] availability gather failed (fail-open):", e);
    return;
  }

  /* 3) SAF kural — min-stay<2 veya kapalı ise helper zaten valid döner. */
  const res = evaluateOrphanGap({
    fromKey: startKey,
    toKey: endKey,
    minStayNights: minStay,
    occupiedNightKeys: occupied,
    todayKey: formatLocalDate(new Date()),
    orphanRuleEnabled: true,
  });

  if (!res.valid) {
    console.warn("[stay-verify] orphan gap rejected", {
      villaId,
      startKey,
      endKey,
      minStay,
      reason: res.reason,
      leftGap: res.leftGap,
      rightGap: res.rightGap,
    });
    throw new Error(ORPHAN_ERROR_MESSAGE);
  }
}
