import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin okuma artık maki-finans/finance.action ("use
   server") üzerinden. eski sağlayıcı importu tamamen kaldırıldı. `server-only`
   defansif sınır. Method yüzeyi + dönüş şekli AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ FINANCE REPOSITORY (native)
   ===============================================================
   `finance.service.ts` içindeki inline `db.from("reservations")`
   read'inin BİREBİR taşınmış hali (read-only KPI aggregate kaynağı).
   Davranış değişmez:
     - `db` = native provider (`dbNative`); tek app rolü → RLS/session-DI
       YOK. Method ham `{ data, error }` döner; tüm finans aggregation/
       sum/count/gate SERVICE'te.

   DAVRANIŞ:
     - SELECT "status, total_price_try, reservation_commission_amount"
       + `.in("status", ...)` AYNEN.
     - status allow-list (FINANCE_BLOCKING_STATUSES) ve `since` date math
       SERVICE'te → parametre olarak gelir (drift yok).
     - Koşullu `.gte("created_at", sinceISO)` chain'i AYNEN (sinceISO
       undefined → "all" preset → filter uygulanmaz).
=============================================================== */

export const financeRepository = {
  async findReservationsForKpi(
    statuses: readonly string[],
    sinceISO?: string
  ) {
    let query = db
      .from("reservations")
      .select("status, total_price_try, reservation_commission_amount")
      .in("status", statuses);

    if (sinceISO) {
      /* Aynı query üzerinde koşullu filter; duplicate query oluşmaz. */
      query = query.gte("created_at", sinceISO);
    }

    return await query;
  },
};
