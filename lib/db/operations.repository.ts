import "server-only";

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ OPERATIONS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `operations.service.ts` içindeki inline
   `dbAdmin.from("reservations")...` read'inin BİREBİR
   taşınmış hali.

   GÜVENLİK SINIRI:
     • `import "server-only"` — service-role (dbAdmin); client bundle'a
       sızarsa BUILD HATA. Kaynak servis de `import "server-only"`
       (reservations admin-only RLS, mig 040).
     • `dbAdmin` = service-role → RLS bypass.

   DAVRANIŞ:
     - SELECT string + embedded join `villa:villa_id(title)` AYNEN
       (byte-identical; alias / field list değişmez).
     - status allow-list ve `.or(...)` window filter SERVICE'te üretilir
       (date math + OPERATIONS_INCLUDED_STATUSES tek source) → parametre
       olarak gelir; drift yok.
     - native `{ data, error }` döner; classify/count/sort/
       fallback hepsi SERVICE'te.
=============================================================== */

export const operationsRepository = {
  async findOperationsWindow(
    statuses: readonly string[],
    orFilter: string
  ) {
    return await dbAdmin
      .from("reservations")
      .select(
        "id, start_date, end_date, name, guests, status, villa:villa_id(title)"
      )
      .in("status", statuses)
      .or(orFilter);
  },
};
