/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   `get_villa_blocked_ranges` RPC artık /api/public/villas/[id]/blocked-ranges
   fetch boundary'sinden delege edilir; SECURITY DEFINER semantic ve
   PII-safe payload aynen korunur. */
import { parseLocalDate } from "@/lib/date-format";

/* ===============================================================
   🛡️ VILLA AVAILABILITY HELPER — Shared availability data adapter
   ===============================================================
   PURPOSE:
     Public `AvailabilityInlineCalendar` ve BookingSidebar inline
     olarak aynı eski sağlayıcı fetch + date expansion mantığını
     tekrarlıyordu. Bu helper o mantığı **pure, framework-free**
     bir adapter olarak dışarı çıkarır.

   SCOPE:
     - Yalnız READ. Mutation YAPMAZ.
     - HİÇBİR UI dependency yok (React import yok).
     - Davranış mevcut inline fetcher'larla BYTE-IDENTICAL:
         status allow-list: ["pending", "confirmed"]
         half-open `[)` semantic burada üretilmez — calendar render
         tarafı LOCAL midnight loop kullanır; bu helper aynı loop'u
         pure formda kapsar.
     - LOCAL midnight parse `parseLocalDate` ile TEK source-of-truth
       (lib/date-format). UTC drift yok.

   ⚠️ SOURCE-OF-TRUTH KONTRATLARI:
     `lib/availability.helper.ts > getBlockedVillaIds` (server-side
     /arama filter), `reservation.service > createReservation`
     overlap clause ve bu helper — üçü de aynı **status allow-list**
     ve aynı **half-open [) overlap** mantığını kullanır. Bu helper
     onları DEĞİŞTİRMEZ; yalnız calendar render için pre-expanded
     arrays üretir.

   BACKWARD-COMPATIBILITY:
     - BookingSidebar.tsx kendi inline fetcher'ını korur (kontrat
       gereği DOKUNULMUYOR). Helper opsiyonel adoption için hazır.
     - Yeni helper public bundle'a yalnız fonksiyon eklendiğinde
       dahil olur; çağrılmazsa tree-shake.
   =============================================================== */

/** Raw row shape — eski sağlayıcıdan dönen minimum alan. */
type ReservationRow = {
  start_date: string;
  end_date: string;
  status: string | null;
};

type ManualReservationRow = {
  start_date: string;
  end_date: string;
};

/** Block ve check-in/out arrayleri. Calendar render bunları
 *  `getDayStyle` (lib/calendar.engine) içine besler. */
export type VillaAvailabilityArrays = {
  /** Confirmed: middle (giriş hariç tüm günler, çıkış hariç) */
  blockedDates: Date[];
  /** Confirmed: ilk gün */
  checkinDates: Date[];
  /** Confirmed: son gün */
  checkoutDates: Date[];

  /** Pending: ilk gün */
  pendingCheckinDates: Date[];
  /** Pending: son gün */
  pendingCheckoutDates: Date[];
  /** Pending: middle */
  pendingMiddleDates: Date[];

  /** Manual block: middle veya tek-gün */
  manualBlockedDates: Date[];
  /** Manual block: ilk gün */
  manualCheckinDates: Date[];
  /** Manual block: son gün */
  manualCheckoutDates: Date[];
};

const EMPTY_ARRAYS: VillaAvailabilityArrays = {
  blockedDates: [],
  checkinDates: [],
  checkoutDates: [],
  pendingCheckinDates: [],
  pendingCheckoutDates: [],
  pendingMiddleDates: [],
  manualBlockedDates: [],
  manualCheckinDates: [],
  manualCheckoutDates: [],
};

/* ---------------------------------------------
   🔥 fetchVillaAvailability — eski sağlayıcı READ
   ---------------------------------------------
   AVAILABILITY ALLOW-LIST (Faz 2B'den korunur):
     reservations.status IN ("pending", "confirmed") → blocking
     manual_reservations.* → blocking (status filtresi yok)
   Davranış mevcut inline fetcher'larla birebir aynı.
*/
export async function fetchVillaAvailability(
  villaId: string
): Promise<{
  reservations: ReservationRow[];
  manual_reservations: ManualReservationRow[];
}> {
  if (!villaId) {
    return { reservations: [], manual_reservations: [] };
  }

  /* 🛡️ PII-SAFE AVAILABILITY — SECURITY DEFINER RPC (migration 039).
     ESKİ: anon `db.from("reservations"/"manual_reservations")
     .select(...)`. 040 admin-only RLS sonrası anon SELECT reddedilir.
     FAZ 2 frontend purge: anon `db.rpc(...)` çağrısı kaldırıldı;
     aynı `get_villa_blocked_ranges` RPC artık /api/public/villas/[id]/
     blocked-ranges fetch boundary'sinden delege edilir. SECURITY DEFINER
     semantic + PII-safe payload aynen korunur. Return shape
     ({reservations, manual_reservations}) BYTE-IDENTICAL. */
  type BlockedRange = {
    kind: "reservation" | "manual";
    status: string | null;
    start_date: string;
    end_date: string;
  };
  let ranges: BlockedRange[] = [];
  try {
    const res = await fetch(
      `/api/public/villas/${encodeURIComponent(villaId)}/blocked-ranges`,
      { cache: "no-store" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      ranges?: BlockedRange[];
    };
    if (!res.ok || !json.ok) {
      console.error(
        "[villa-availability.helper] blocked-ranges fetch failed:",
        `HTTP ${res.status}`
      );
      return { reservations: [], manual_reservations: [] };
    }
    ranges = json.ranges || [];
  } catch (err) {
    console.error(
      "[villa-availability.helper] blocked-ranges fetch exception:",
      err instanceof Error ? err.message : err
    );
    return { reservations: [], manual_reservations: [] };
  }

  return {
    reservations: ranges
      .filter((r) => r.kind === "reservation")
      .map((r) => ({
        start_date: r.start_date,
        end_date: r.end_date,
        status: r.status ?? "",
      })) as ReservationRow[],
    manual_reservations: ranges
      .filter((r) => r.kind === "manual")
      .map((r) => ({
        start_date: r.start_date,
        end_date: r.end_date,
      })) as ManualReservationRow[],
  };
}

/* ---------------------------------------------
   🔥 expandAvailabilityToDateArrays — PURE expansion
   ---------------------------------------------
   Mevcut public inline mantıkla BYTE-IDENTICAL davranış:

   CONFIRMED reservation:
     [start_date]      → checkinDates (isFirst flag)
     middle days       → blockedDates
     [end_date]        → checkoutDates

   PENDING reservation:
     [start_date]      → pendingCheckinDates
     middle days       → pendingMiddleDates
     [end_date]        → pendingCheckoutDates

   MANUAL reservation:
     [start = end]     → manualBlockedDates (tek-gün)
     [start_date]      → manualCheckinDates
     middle days       → manualBlockedDates
     [end_date]        → manualCheckoutDates

   LOCAL MIDNIGHT: parseLocalDate ile parse; UTC drift yok.
   `current <= end` LOCAL gün eşitliği (toDateString).
*/
export function expandAvailabilityToDateArrays(
  reservations: ReservationRow[],
  manualReservations: ManualReservationRow[]
): VillaAvailabilityArrays {
  if (!reservations.length && !manualReservations.length) {
    return EMPTY_ARRAYS;
  }

  const blockedDates: Date[] = [];
  const checkinDates: Date[] = [];
  const checkoutDates: Date[] = [];

  const pendingCheckinDates: Date[] = [];
  const pendingCheckoutDates: Date[] = [];
  const pendingMiddleDates: Date[] = [];

  const manualBlockedDates: Date[] = [];
  const manualCheckinDates: Date[] = [];
  const manualCheckoutDates: Date[] = [];

  for (const r of reservations) {
    if (!r.start_date || !r.end_date) continue;
    const current = parseLocalDate(r.start_date);
    const end = parseLocalDate(r.end_date);
    const startStr = current.toDateString();
    const endStr = end.toDateString();

    let isFirst = true;
    while (current <= end) {
      const d = new Date(current);
      const isStart = current.toDateString() === startStr;
      const isEnd = current.toDateString() === endStr;

      if (r.status === "confirmed") {
        if (isFirst) {
          checkinDates.push(d);
          isFirst = false;
        } else if (isEnd) {
          checkoutDates.push(d);
        } else {
          blockedDates.push(d);
        }
      } else if (r.status === "pending") {
        if (isStart) {
          pendingCheckinDates.push(d);
        } else if (isEnd) {
          pendingCheckoutDates.push(d);
        } else {
          pendingMiddleDates.push(d);
        }
      }
      current.setDate(current.getDate() + 1);
    }
  }

  for (const r of manualReservations) {
    if (!r.start_date || !r.end_date) continue;
    const current = parseLocalDate(r.start_date);
    const end = parseLocalDate(r.end_date);
    const startStr = current.toDateString();
    const endStr = end.toDateString();

    while (current <= end) {
      const d = new Date(current);
      const isFirstDay = current.toDateString() === startStr;
      const isLastDay = current.toDateString() === endStr;

      if (isFirstDay && isLastDay) {
        manualBlockedDates.push(d);
      } else if (isFirstDay) {
        manualCheckinDates.push(d);
      } else if (isLastDay) {
        manualCheckoutDates.push(d);
      } else {
        manualBlockedDates.push(d);
      }
      current.setDate(current.getDate() + 1);
    }
  }

  /* Dedup: aynı gün birden fazla rezervasyondan gelebilir
     (overlap edge-case'i; DB EXCLUDE constraint prevent eder ama
     defansif). LOCAL toDateString eşitliği ile unique. */
  const unique = (arr: Date[]): Date[] => {
    if (arr.length <= 1) return arr;
    return Array.from(
      new Map(arr.map((d) => [d.toDateString(), d])).values()
    );
  };

  return {
    blockedDates: unique(blockedDates),
    checkinDates: unique(checkinDates),
    checkoutDates: unique(checkoutDates),
    pendingCheckinDates: unique(pendingCheckinDates),
    pendingCheckoutDates: unique(pendingCheckoutDates),
    pendingMiddleDates: unique(pendingMiddleDates),
    manualBlockedDates: unique(manualBlockedDates),
    manualCheckinDates: unique(manualCheckinDates),
    manualCheckoutDates: unique(manualCheckoutDates),
  };
}

/* ---------------------------------------------
   🔥 fetchAndExpand — convenience composer
   ---------------------------------------------
   Tek çağrıda fetch + expand. Component'lerin ortak ihtiyacı.
   Hata durumunda EMPTY_ARRAYS döner (caller defansif state).
*/
export async function fetchAndExpandVillaAvailability(
  villaId: string
): Promise<VillaAvailabilityArrays> {
  const { reservations, manual_reservations } =
    await fetchVillaAvailability(villaId);
  return expandAvailabilityToDateArrays(reservations, manual_reservations);
}
