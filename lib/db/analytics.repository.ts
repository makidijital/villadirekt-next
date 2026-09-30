import "server-only";

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ ANALYTICS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `analytics.service.ts` içindeki inline
   `dbAdmin.from("reservations")...` read'inin BİREBİR
   taşınmış hali.

   GÜVENLİK SINIRI:
     • `import "server-only"` — service-role (dbAdmin) kullanır;
       client bundle'a sızarsa BUILD HATA. Kaynak servis de
       `import "server-only"` (reservations admin-only RLS, mig 040).
     • `dbAdmin` = service-role → RLS bypass.

   DAVRANIŞ:
     - reservations / select("created_at") / .in("status", ...) /
       .gte("created_at", ...) AYNEN.
     - status allow-list ve `since` date math SERVICE'te kalır
       (ANALYTICS_INCLUDED_STATUSES tek source); buraya parametre
       olarak gelir → drift yok.
     - native `{ data, error }` döner; mapping/skeleton/fill
       hepsi SERVICE'te.
=============================================================== */

export const analyticsRepository = {
  async findReservationsSince(
    sinceISO: string,
    statuses: readonly string[]
  ) {
    return await dbAdmin
      .from("reservations")
      .select("created_at")
      .in("status", statuses)
      .gte("created_at", sinceISO);
  },
};
