import { reservationRepository } from "@/lib/db/reservation.repository";

/* 🛡️ READ repository INJECTION (mig 040 hardening):
   Admin detail route'u server-context'te çalışır; anon `db` JWT
   taşımaz → mig 040 `reservations_admin_only` RLS DENY → `.single()`
   PGRST116 → service "Rezervasyon getirilemedi" throw.
   Route service-role variant'ını (`reservationServerRepository`)
   geçer → byte-identical chain RLS bypass ile çalışır. Default anon
   repo korunur (test + diğer caller'lar değişmez). Pattern
   `createReservation` (insertRepository) ile birebir aynı.

   Two narrow types — getReservationById sadece findById ihtiyacında,
   getReservations sadece findList; server repo subset'i sağlar. */
type ReservationFindByIdRepository = Pick<
  typeof reservationRepository,
  "findById"
>;
type ReservationFindListRepository = Pick<
  typeof reservationRepository,
  "findList"
>;

/* ===============================================================
   🛡️ FAZ 33 — READ SERVICE (getReservationById + getReservations)
   ===============================================================
   FAZ 3'te SELECT string'leri `_helpers/select-shapes.ts` altında
   single source-of-truth olarak çıkarılmıştı. FAZ 33'te bir
   katman daha aşağı: DB I/O artık `reservationRepository.findById`
   ve `reservationRepository.findList` üzerinden delege edilir.
   SELECT constant'ları repository içinde tüketilir; bu dosya
   embed string'i görmeyi bırakır.

   ⚠️ BYTE-IDENTICAL KURALLAR (FAZ 0 §3.3 + §8):
     - ID guard ("ID gerekli") aynen, repository çağrısından ÖNCE.
     - `single()` davranışı repository içinde korundu — missing
       row → error.code "PGRST116"; service catch'i aynen
       "Rezervasyon getirilemedi" fırlatır.
     - Order ("created_at" DESC) repository içinde korundu.
     - Console.error tag'leri (`❌ Fetch error:`, `❌ List error:`)
       service tarafında aynen.
     - Throw mesajları aynen.
     - Caller surface (`getReservationById`, `getReservations`
       imzaları + return shape) değişmedi.
=============================================================== */

/* ================================
   🔥 GET DETAIL
================================ */
export async function getReservationById(
  id: string,
  deps?: { repository?: ReservationFindByIdRepository }
) {
  if (!id) throw new Error("ID gerekli");

  const repository = deps?.repository ?? reservationRepository;
  const { data, error } = await repository.findById(id);

  if (error) {
    console.error("❌ Fetch error:", error.message);
    throw new Error("Rezervasyon getirilemedi");
  }

  return data;
}

/* ================================
   🔥 GET ALL
================================ */
export async function getReservations(
  deps?: { repository?: ReservationFindListRepository }
) {
  const repository = deps?.repository ?? reservationRepository;
  const { data, error } = await repository.findList();

  if (error) {
    console.error("❌ List error:", error.message);
    throw new Error("Rezervasyonlar alınamadı");
  }

  return data;
}
