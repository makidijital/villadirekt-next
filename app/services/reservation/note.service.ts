import { reservationRepository } from "@/lib/db/reservation.repository";

/* 🛡️ WRITE repository INJECTION (mig 040 hardening):
   Admin note PATCH route'u server-context'te çalışır; anon `db` JWT
   taşımaz → RLS DENY → UPDATE 0 row etkiler (silent fail). Route
   service-role variant'ını geçer. Default anon repo korunur. */
type ReservationNoteRepository = Pick<
  typeof reservationRepository,
  "updateById"
>;

/* ===============================================================
   🛡️ FAZ 3 — updateReservationNote (ORCHESTRATOR; FAZ 33 delege)
   ===============================================================
   Eski `updateReservationNote`'un BYTE-IDENTICAL karşılığı.
   Sadece note alanını günceller; başka side-effect yok.

   FAZ 33 (UPDATE extraction):
     `db.from("reservations").update({ note }).eq("id", id)`
     artık `reservationRepository.updateById(id, { note })`
     üzerinden delege edilir.

   ⚠️ ORCHESTRATION SIRASI BYTE-IDENTICAL:
     1. throw "ID gerekli" if !id
     2. await reservationRepository.updateById(id, { note })
     3. on error: console.error("❌ Note error:") + throw "Not kaydedilemedi"
     4. return true
=============================================================== */

export async function updateReservationNote(
  id: string,
  note: string,
  deps?: { repository?: ReservationNoteRepository }
) {
  if (!id) throw new Error("ID gerekli");

  const repository = deps?.repository ?? reservationRepository;
  const { error } = await repository.updateById(id, { note });

  if (error) {
    console.error("❌ Note error:", error.message);
    throw new Error("Not kaydedilemedi");
  }

  return true;
}
