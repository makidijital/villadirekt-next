import type { ReservationDetailData } from "../_types/reservation-form-data";

/* ===============================================================
   🛡️ TUR 3 — saveAll extraction helper (pure, zero behavior change)
   ===============================================================
   FAZ 55J-2 audit log için "BEFORE snapshot" — save sonrası
   logActivity'ye before_data olarak gider. saveAll içinde tek
   yerde (line 1150-1168 orijinal) inline yazılıydı; JSON shape
   ve field sırası birebir korundu.

   Snapshot NOT: tam DB öncesi snapshot değil — `data` state'inin
   save tıklandığı andaki haliyle aynı. Bu mevcut davranış,
   değişmiyor.
=============================================================== */

export type ReservationBeforeSnapshot = {
  id: string;
  villa_id: string;
  name: string;
  email: string | null;
  phone: string;
  phone2?: string | null;
  start_date: string;
  end_date: string;
  guests: number | null;
  status: ReservationDetailData["status"];
  total_price: number | null;
  original_currency: string | null;
  paid_amount: number | null;
  prepayment_amount: number | null;
  remaining_payment: number | null;
  payment_preference: ReservationDetailData["payment_preference"];
  payment_method_id: string | null;
  note: string | null;
};

export function buildReservationBeforeSnapshot(
  data: ReservationDetailData
): ReservationBeforeSnapshot {
  return {
    id: data.id,
    villa_id: data.villa_id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    phone2: data.phone2 ?? null,
    start_date: data.start_date,
    end_date: data.end_date,
    guests: data.guests,
    status: data.status,
    total_price: data.total_price,
    original_currency: data.original_currency,
    paid_amount: data.paid_amount,
    prepayment_amount: data.prepayment_amount,
    remaining_payment: data.remaining_payment,
    payment_preference: data.payment_preference,
    payment_method_id: data.payment_method_id,
    note: data.note,
  };
}
