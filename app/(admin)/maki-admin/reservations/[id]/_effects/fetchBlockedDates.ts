import "server-only";

import { reservationRepository } from "@/lib/db/reservation.repository";
import { manualReservationRepository } from "@/lib/db/manual-reservation.repository";
import { parseLocalDate } from "@/lib/date-format";

import type {
  FetchBlockedDatesInput,
  BlockedDateGroups,
} from "../_types/handler-inputs";

/* ===============================================================
   🛡️ FAZ 2 — fetchBlockedDates (ASYNC EFFECT HELPER)
   ===============================================================
   Eski page.tsx > L451-569 inline async function `fetchReservations`'in
   BYTE-IDENTICAL kopyası — useEffect body'sinden çıkartıldı.

   Page'in useEffect dependency array'i `[data?.villa_id]` AYNEN kalır.
   Effect body sadece bu helper'ı çağırıp, 9 setter'ı sırayla uygular.

   ⚠️ AVAILABILITY ALLOW-LIST (Faz 2B):
     Yalnız `pending` ve `confirmed` rezervasyonlar takvimi block
     etmeli. `rejected` / `cancelled` availability'ye dahil değildir.

   ⚠️ EDIT — kendi rezervasyonu hariç tut (`.neq("id", id)`).

   ⚠️ LOCAL DATE SEMANTIC: parseLocalDate ile LOCAL midnight; DST
   ve Safari ISO parse edge-case'leri için toDateString() eşitliği.

   ⚠️ KESIN KURAL:
     - 2 eski sağlayıcı SELECT sırası aynen (reservations → manual).
     - 9 grup array'inin doldurulma sırası aynen.
     - confirmed: isFirst → checkin, isEnd → checkout, else blocked.
     - pending: isStart → pCI, isEnd → pCO, else pM.
     - Manual: isFirstDay && isLastDay → blocked, isFirstDay → CI,
       isLastDay → CO, else blocked.
     - unique(): toDateString() Map dedup aynen.
     - 9 setter çağrı sırası caller'da: blocked, checkin, checkout,
       pendingCheckin, pendingCheckout, pendingMiddle, manualBlocked,
       manualCheckin, manualCheckout.

   PURE: helper sadece grouped result döner; setter'ları caller
   useEffect çağırır.
=============================================================== */

export async function fetchBlockedDates(
  input: FetchBlockedDatesInput
): Promise<BlockedDateGroups> {
  const { villaId, excludeReservationId } = input;

  const { data: reservations } =
    await reservationRepository.findActiveBlockDatesByVilla(
      villaId,
      ["pending", "confirmed"],
      excludeReservationId
    );

  const { data: manual } =
    await manualReservationRepository.findBlockDateRangesByVilla(villaId);

  const blocked: Date[] = [];
  const checkin: Date[] = [];
  const checkout: Date[] = [];

  const manualBlocked: Date[] = [];
  const manualCI: Date[] = [];
  const manualCO: Date[] = [];

  const pCI: Date[] = [];
  const pCO: Date[] = [];
  const pM: Date[] = [];

  reservations?.forEach(
    (r: { start_date: string; end_date: string; status: string | null }) => {
      const current = parseLocalDate(r.start_date);
      const end = parseLocalDate(r.end_date);
      let isFirst = true;

      while (current <= end) {
        const d = new Date(current);
        const isStart =
          current.toDateString() ===
          parseLocalDate(r.start_date).toDateString();
        const isEnd = current.toDateString() === end.toDateString();

        if (r.status === "confirmed") {
          if (isFirst) {
            checkin.push(d);
            isFirst = false;
          } else if (isEnd) {
            checkout.push(d);
          } else {
            blocked.push(d);
          }
        }

        if (r.status === "pending") {
          if (isStart) pCI.push(d);
          else if (isEnd) pCO.push(d);
          else pM.push(d);
        }

        current.setDate(current.getDate() + 1);
      }
    }
  );

  manual?.forEach((r: { start_date: string; end_date: string }) => {
    const current = parseLocalDate(r.start_date);
    const end = parseLocalDate(r.end_date);

    while (current <= end) {
      const d = new Date(current);
      const startDate = parseLocalDate(r.start_date);
      const endDate = parseLocalDate(r.end_date);
      const isFirstDay =
        current.toDateString() === startDate.toDateString();
      const isLastDay =
        current.toDateString() === endDate.toDateString();

      if (isFirstDay && isLastDay) manualBlocked.push(d);
      else if (isFirstDay) manualCI.push(d);
      else if (isLastDay) manualCO.push(d);
      else manualBlocked.push(d);
      current.setDate(current.getDate() + 1);
    }
  });

  const unique = (arr: Date[]) =>
    Array.from(
      new Map(arr.map((d) => [d.toDateString(), d])).values()
    );

  return {
    blocked: unique(blocked),
    checkin: unique(checkin),
    checkout: unique(checkout),
    pendingCheckin: unique(pCI),
    pendingCheckout: unique(pCO),
    pendingMiddle: unique(pM),
    manualBlocked: unique(manualBlocked),
    manualCheckin: unique(manualCI),
    manualCheckout: unique(manualCO),
  };
}
