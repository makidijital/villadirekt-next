import { reservationRepository } from "@/lib/db/reservation.repository";
import { adminGateway } from "@/lib/admin-gateway/server";

import { assertCanConfirm } from "./_helpers/status";

import type { ReservationStatusLegacy } from "./types";

/* 🛡️ WRITE repository INJECTION (mig 040 hardening):
   Admin status PATCH route'u server-context'te çalışır; anon `db`
   JWT taşımaz → RLS DENY → UPDATE 0 row etkiler (silent fail). Route
   service-role variant'ını geçer → byte-identical chain RLS bypass
   ile çalışır. `assertCanConfirm` paid_amount fetch da aynı repo'ya
   delege (status='confirmed' guard'ı yanlışlıkla "Onaylanamaz" throw
   etmesin). Default anon repo korunur. */
type ReservationStatusRepository = Pick<
  typeof reservationRepository,
  "updateById" | "findPaidAmount"
>;

/* ===============================================================
   🛡️ FAZ 3 — updateReservationStatus (ORCHESTRATOR; FAZ 33 delege)
   ===============================================================
   Eski `updateReservationStatus`'un BYTE-IDENTICAL karşılığı.

   FAZ 33 (UPDATE extraction):
     `db.from("reservations").update({ status }).eq("id", id)`
     artık `reservationRepository.updateById(id, { status })`
     üzerinden delege edilir. Predicate aynen; payload inline
     `{ status }` orchestrator'da kalır (repository payload'a
     müdahil olmaz).

   ⚠️ LEGACY ASIMETRİSİ KORUNDU:
     Signature 3-değerli (`pending | confirmed | rejected`).
     `cancelled` YOK — `updateReservationFull` 4-değerli olduğu
     halde bu function tarihsel sebepten 3-değerli kalmış.
     Refactor scope dışı; korundu (`ReservationStatusLegacy` type'ı
     ile expose edildi).

   ⚠️ ORCHESTRATION SIRASI BYTE-IDENTICAL (FAZ 33 evolution:
      eski sağlayıcı identifier → repository identifier; diğer iddialar
      aynen):
     1. throw "ID gerekli" if !id
     2. if status==="confirmed": await assertCanConfirm(id, undefined)
        (paid_amount payload'da YOK → DB fetch fallback)
     3. await reservationRepository.updateById(id, { status })
     4. on error: console.error("❌ Status error:") + throw "Durum güncellenemedi"
     5. return true
=============================================================== */

export async function updateReservationStatus(
  id: string,
  status: ReservationStatusLegacy,
  deps?: { repository?: ReservationStatusRepository }
) {
  if (!id) throw new Error("ID gerekli");

  const repository = deps?.repository ?? reservationRepository;

  /* 🛡️ SERVER-SIDE CONFIRMED GUARD (Faz 4B):
     updateReservationFull ile aynı kural. status='confirmed'
     transition'ı için DB'deki paid_amount minimum şartı
     sağlanmalı; aksi halde throw. */
  if (status === "confirmed") {
    await assertCanConfirm(id, undefined, { repository });
  }

  const { error } = await repository.updateById(id, { status });

  if (error) {
    console.error("❌ Status error:", error.message);
    throw new Error("Durum güncellenemedi");
  }

  /* FAZ 42: AUDIT (fire-forget, best-effort) — implicit admin
     context; ana akış bağımlı değil. */
  void adminGateway.audit("reservation.status_changed", {
    entityType: "reservation",
    entityId: id,
    after: { status },
    metadata: { source: "updateReservationStatus", newStatus: status },
  });

  return true;
}
