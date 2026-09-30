import type { ReservationDetailData } from "../_types/reservation-form-data";
import type { ReservationUpdatePayloadShape } from "./buildCustomPricePayload";

/* ===============================================================
   🛡️ TUR 3 — saveAll extraction helper (pure, zero behavior change)
   ===============================================================
   FAZ 55J-2 audit log için "AFTER snapshot" — save sonrası
   logActivity'ye after_data olarak gider. saveAll içinde 2 yerde
   (custom + normal path) inline yazılıydı; her ikisi de SAME
   shape, tek farkları `custom_price` flag literal.

   ⚠️ Custom path'te `custom_price: true`, normal path'te
   `custom_price: false`. Helper payload'dan okuyor (payload.custom_price
   her iki dalda doğru flag'i taşıyor); kontrat byte-identical.
=============================================================== */

export type ReservationAfterSnapshot = {
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
  total_price: number;
  original_currency: string;
  paid_amount: number;
  prepayment_amount: number;
  remaining_payment: number;
  payment_preference: "prepayment" | "full_payment";
  payment_method_id: string | null;
  custom_price: boolean;
};

export function buildReservationAfterSnapshot(input: {
  id: string;
  data: ReservationDetailData;
  payload: ReservationUpdatePayloadShape;
}): ReservationAfterSnapshot {
  const { id, data, payload } = input;
  return {
    id,
    villa_id: data.villa_id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    phone2: data.phone2 ?? null,
    start_date: payload.start_date,
    end_date: payload.end_date,
    guests: payload.guests,
    status: payload.status,
    total_price: payload.total_price,
    original_currency: payload.original_currency,
    paid_amount: payload.paid_amount,
    prepayment_amount: payload.prepayment_amount,
    remaining_payment: payload.remaining_payment,
    payment_preference: payload.payment_preference,
    payment_method_id: payload.payment_method_id,
    custom_price: payload.custom_price,
  };
}
