import { logActivity } from "@/lib/activity-log.client";

import type { ReservationDetailData } from "../_types/reservation-form-data";
import type { ReservationBeforeSnapshot } from "./buildReservationBeforeSnapshot";
import type { ReservationAfterSnapshot } from "./buildReservationAfterSnapshot";

/* ===============================================================
   🛡️ TUR 3 — saveAll extraction helper (fire-forget)
   ===============================================================
   FAZ 55J-2 — audit log fire-forget pattern. saveAll içinde 2 yerde
   (custom + normal path) inline yazılıydı; her ikisi de aynı shape.

   .catch(() => {}) PATTERN'İ BİREBİR KORUNDU. Audit log
   tetiklenmemesi/hata vermesi save akışını DURDURMAZ.

   `entity_title` derivation:
     (data.name || "Misafir") + (data.villa_id ? " · " + data.villa_id : "")
   Aynı string concat aynen.
=============================================================== */

export function logReservationUpdate(input: {
  id: string;
  data: ReservationDetailData;
  before: ReservationBeforeSnapshot;
  after: ReservationAfterSnapshot;
}): void {
  const { id, data, before, after } = input;
  logActivity({
    action: "reservation.updated",
    entity_type: "reservation",
    entity_id: id,
    entity_title:
      (data.name || "Misafir") +
      (data.villa_id ? " · " + data.villa_id : ""),
    before_data: before,
    after_data: after,
  }).catch(() => {});
}
