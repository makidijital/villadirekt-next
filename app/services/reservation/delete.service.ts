import { reservationRepository } from "@/lib/db/reservation.repository";
import { adminGateway } from "@/lib/admin-gateway/server";

/* 🛡️ WRITE repository INJECTION (mig 040 hardening):
   Admin delete route'u server-context'te çalışır; anon `db` JWT
   taşımaz → RLS DENY → DELETE 0 row etkiler (silent fail). Route
   service-role variant'ını geçer → byte-identical chain RLS bypass
   ile çalışır. Default anon repo korunur. */
type ReservationDeleteRepository = Pick<
  typeof reservationRepository,
  "deleteById"
>;

/* ===============================================================
   🛡️ FAZ 3 — deleteReservationById (ORCHESTRATOR; FAZ 33 delege)
   ===============================================================
   Eski `deleteReservationById`'in BYTE-IDENTICAL karşılığı.
   Hard delete; reservation row'unu DB'den kaldırır.

   FAZ 33 (DELETE extraction):
     `db.from("reservations").delete().eq("id", id)` artık
     `reservationRepository.deleteById(id)` üzerinden delege
     edilir. Predicate (`.eq("id", id)`) repository içinde
     aynen; cascade davranışı YOK (orijinal davranış).

   ⚠️ ORCHESTRATION SIRASI BYTE-IDENTICAL:
     1. throw "ID gerekli" if !id
     2. await reservationRepository.deleteById(id)
     3. on error: console.error("❌ Delete error:") + throw "Silinemedi"
     4. return true

   ⚠️ NOT: Refactor scope'ta soft-delete eklenmedi (business rule
   değişimi yasak). Caller hala admin reservation detail page'inde
   `useConfirm()` destructive modal arkasında.
=============================================================== */

export async function deleteReservationById(
  id: string,
  deps?: { repository?: ReservationDeleteRepository }
) {
  if (!id) throw new Error("ID gerekli");

  const repository = deps?.repository ?? reservationRepository;
  const { error } = await repository.deleteById(id);

  if (error) {
    console.error("❌ Delete error:", error.message);
    throw new Error("Silinemedi");
  }

  /* FAZ 42: AUDIT (fire-forget). Heavy snapshot ALMA — hard delete
     öncesi DB row zaten yok; sadece id + action. */
  void adminGateway.audit("reservation.deleted", {
    entityType: "reservation",
    entityId: id,
    metadata: { source: "deleteReservationById" },
  });

  return true;
}
