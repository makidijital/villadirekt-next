import { reservationRepository } from "@/lib/db/reservation.repository";

import {
  checkReservationConflict,
  checkManualBlockConflict,
} from "./_helpers/conflict";
import {
  fetchCommissionRate,
  calcCommissionAmount,
} from "./_helpers/commission";
import { buildCreateReservationPayload } from "./_helpers/payload-create";
import { mapInsertError } from "./_helpers/errors";

import type { ReservationCreateInput } from "./types";

/* ===============================================================
   🛡️ FAZ 3 — createReservation (ORCHESTRATOR; FAZ 33 delege)
   ===============================================================
   Eski `createReservation`'ın BYTE-IDENTICAL karşılığı; tüm pure
   gövde helper'lara delege edildi. Orchestrator yalnız:
     - input validation (5 throw)
     - 2 conflict check (reservation + manual)
     - commission rate fetch (+ amount calc)
     - villa INSERT + EXCLUDE constraint catch
     - return inserted
   sırasını yönetir.

   FAZ 33 (INSERT extraction — revenue-critical):
     `db.from("reservations").insert(payload).select().single()`
     artık `reservationRepository.insert(payload)` üzerinden
     delege edilir. Chain `.select().single()` repository içine
     taşındı (caller bekleyen `inserted` row return shape aynen).
     `mapInsertError` + SQLSTATE 23P01 parse + console tag +
     generic throw fallback BYTE-IDENTICAL service edge'inde.

   ⚠️ ORCHESTRATION SIRASI BYTE-IDENTICAL (AST contract FAZ 5;
      FAZ 33 evolution: eski sağlayıcı identifier → repository
      identifier; diğer iddialar aynen):
     1. throw "Villa zorunlu" if !data.villa_id
     2. throw "Tarih zorunlu" if !start_date || !end_date
     3. throw "Ad ve telefon zorunlu" if !name || !phone
     4. throw "Tarih aralığı hatalı" if start >= end
     5. await checkReservationConflict({villa_id, start, end})
     6. await checkManualBlockConflict({villa_id, start, end})
     7. const rate = await fetchCommissionRate(villa_id)
     8. const amount = calcCommissionAmount(total_price_try, rate)
     9. await reservationRepository.insert(buildCreateReservationPayload(...))
    10. on error: console.error + mapInsertError + throw error.message
    11. return inserted

   KURAL: Aşağıdaki throw mesajları + tag'ler BYTE-IDENTICAL.
=============================================================== */

/* 🛡️ INSERT repository INJECTION (PHASE 3):
   Public booking server route'u service-role insert repo'sunu geçer
   (reservationServerRepository) → 040 admin-only RLS sonrası anon yerine
   service_role ile insert (RLS bypass + RETURNING görünür). Default anon
   `reservationRepository` korunur → admin/diğer caller'lar DEĞİŞMEZ.
   conflict (RPC) ve commission (villa public read) her bağlamda çalışır;
   yalnız INSERT bağlam-duyarlıdır. */
type ReservationInsertRepository = Pick<
  typeof reservationRepository,
  "insert"
>;

export async function createReservation(
  data: ReservationCreateInput,
  deps?: { insertRepository?: ReservationInsertRepository }
) {
  /* ================================
     🔥 VALIDATION
  =================================*/
  if (!data.villa_id) throw new Error("Villa zorunlu");

  if (!data.start_date || !data.end_date)
    throw new Error("Tarih zorunlu");

  if (!data.name || !data.phone)
    throw new Error("Ad ve telefon zorunlu");

  const start = new Date(data.start_date);
  const end = new Date(data.end_date);

  if (start >= end) {
    throw new Error("Tarih aralığı hatalı");
  }

  /* ================================
     🔥 ÇAKIŞMA KONTROLÜ — UX FAST-PATH
     (helper: checkReservationConflict)
  =================================*/
  await checkReservationConflict({
    villa_id: data.villa_id,
    start_date: data.start_date,
    end_date: data.end_date,
  });

  /* ================================
     🔥 MANUAL BLOK ÇAKIŞMASI — cross-table fast-path
     (helper: checkManualBlockConflict)
  =================================*/
  await checkManualBlockConflict({
    villa_id: data.villa_id,
    start_date: data.start_date,
    end_date: data.end_date,
  });

  /* ================================
     🛡️ COMMISSION SNAPSHOT — accounting foundation
     (helper: fetchCommissionRate + calcCommissionAmount)
     Villa commission_rate fetch fail-open; fallback 20.
  =================================*/
  const commissionRate = await fetchCommissionRate(data.villa_id);
  const reservationCommissionAmount = calcCommissionAmount(
    data.total_price_try,
    commissionRate
  );

  /* ================================
     🔥 INSERT — DB-level EXCLUDE constraint atomik garantili
     (helper: buildCreateReservationPayload;
      data access: reservationRepository.insert)
  =================================*/
  const insertRepository = deps?.insertRepository ?? reservationRepository;
  const { data: inserted, error } = await insertRepository.insert(
    buildCreateReservationPayload({
      data,
      reservationCommissionAmount,
    })
  );

  if (error) {
    console.error("❌ Create error:", error.message);
    // 🔥 EXCLUDE CONSTRAINT VIOLATION — concurrent rezervasyon
    // race koşulu DB seviyesinde yakalandı.
    // Postgres SQLSTATE 23P01 = exclusion_violation.
    // DB client bunu error.code olarak yansıtır.
    mapInsertError(error);
    throw new Error(error.message);
  }

  return inserted;
}
