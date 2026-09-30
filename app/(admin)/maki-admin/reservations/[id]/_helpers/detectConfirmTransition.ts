import { canConfirmReservation } from "@/lib/reservation-confirm.helper";

/* ===============================================================
   🛡️ TUR 3 — saveAll extraction helper (pure, zero behavior change)
   ===============================================================
   Auto payment-confirmation transition detection. saveAll içinde
   line 1218-1221'deki koşul birebir aynı:
     baselineStatus !== "confirmed" &&
     requestedStatus === "confirmed" &&
     canConfirmReservation(paidAmount)

   Caller'lar:
     - status değişimi pending/rejected → confirmed
     - paid_amount accounting kuralı geçerli (canConfirmReservation > 0)
   true dönerse saveAll iki ayrı mail lifecycle'ını sırayla başlatır
   (payment-confirmed AWAITED → status-change fire-forget). Helper
   YALNIZ booleon değer döner; mail dispatch saveAll'da kalır.
=============================================================== */

export function detectConfirmTransition(
  baselineStatus: string,
  requestedStatus: string,
  paidAmount: number | null | undefined
): boolean {
  return (
    baselineStatus !== "confirmed" &&
    requestedStatus === "confirmed" &&
    canConfirmReservation(paidAmount)
  );
}
