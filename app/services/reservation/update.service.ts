import { reservationRepository } from "@/lib/db/reservation.repository";
import { adminGateway } from "@/lib/admin-gateway/server";

import { assertCanConfirm } from "./_helpers/status";
import { buildUpdateReservationPayload } from "./_helpers/payload-update";

import type { ReservationUpdateInput } from "./types";

/* 🛡️ WRITE repository INJECTION (mig 040 hardening):
   Admin update route'u server-context'te çalışır; anon `db` JWT
   taşımaz → RLS DENY → UPDATE 0 row etkiler (eski sağlayıcı silent başarı,
   data değişmez). Route service-role variant'ını geçer → byte-identical
   chain RLS bypass ile çalışır. Default anon repo korunur. Pattern
   `createReservation` (insertRepository) ile aynı.
   `assertCanConfirm`'a da aynı repo geçilir → paid_amount fetch da
   service-role ile çalışır. */
type ReservationWriteRepository = Pick<
  typeof reservationRepository,
  "updateById" | "findPaidAmount"
>;

/* ===============================================================
   🛡️ FAZ 3 — updateReservationFull (ORCHESTRATOR; FAZ 33 delege)
   ===============================================================
   Eski `updateReservationFull`'un BYTE-IDENTICAL karşılığı; tüm
   pure gövde helper'lara delege edildi. Orchestrator yalnız:
     - id validation
     - date range validation (if both present)
     - conditional confirmed guard
     - payload build (delegated)
     - reservations UPDATE
     - throw on error
   sırasını yönetir.

   FAZ 33 (UPDATE extraction):
     `db.from("reservations").update(payload).eq("id", id)`
     artık `reservationRepository.updateById(id, payload)`
     üzerinden delege edilir. Predicate (`.eq("id", id)`) ve
     UPDATE semantic'i repository içinde aynen.

   ⚠️ ORCHESTRATION SIRASI BYTE-IDENTICAL (AST contract FAZ 5;
      FAZ 33 evolution: eski sağlayıcı identifier → repository identifier,
      diğer iddialar aynen):
     1. throw "ID gerekli" if !id
     2. throw "Tarih aralığı hatalı" if start_date+end_date and start >= end
     3. if status==="confirmed": await assertCanConfirm(id, paid_amount)
     4. const payload = buildUpdateReservationPayload(data)
     5. await reservationRepository.updateById(id, payload)
     6. on error: console.error("❌ Update error:") + throw "Güncellenemedi"
     7. return true

   KURAL: Throw mesajları + tag'ler aynen.
=============================================================== */

export async function updateReservationFull(
  id: string,
  data: ReservationUpdateInput,
  deps?: { repository?: ReservationWriteRepository }
) {
  if (!id) throw new Error("ID gerekli");

  if (data.start_date && data.end_date) {
    if (new Date(data.start_date) >= new Date(data.end_date)) {
      throw new Error("Tarih aralığı hatalı");
    }
  }

  const repository = deps?.repository ?? reservationRepository;

  /* 🛡️ SERVER-SIDE CONFIRMED GUARD (Faz 4B):
     Eğer payload status='confirmed' ile geliyorsa, paid_amount
     minimum gereksinimi enforce edilir. Geçersizse throw —
     ne DB update ne mail dispatch ne voucher tetiklenir. Valid
     akışta davranış BYTE-IDENTICAL. */
  if (data.status === "confirmed") {
    await assertCanConfirm(id, data.paid_amount, { repository });
  }

  /* ------------------------------------------------------------
     🔥 PAYLOAD
     (helper: buildUpdateReservationPayload)
     Sadece tanımlı alanları gönderiyoruz.
     Eski TRY-only rezervasyonlarda multi-currency alanlar
     undefined ise dokunmuyoruz.
  ------------------------------------------------------------ */
  const payload = buildUpdateReservationPayload(data);

  const { error } = await repository.updateById(id, payload);

  if (error) {
    console.error("❌ Update error:", error.message);
    throw new Error("Güncellenemedi");
  }

  /* FAZ 42: AUDIT (fire-forget). Heavy payload yerine status +
     date hint metadata. */
  void adminGateway.audit("reservation.updated", {
    entityType: "reservation",
    entityId: id,
    after: {
      status: data.status,
      start_date: data.start_date,
      end_date: data.end_date,
    },
    metadata: { source: "updateReservationFull" },
  });

  return true;
}
