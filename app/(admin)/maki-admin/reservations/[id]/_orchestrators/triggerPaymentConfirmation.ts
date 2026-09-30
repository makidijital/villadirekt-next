import { adminFetch } from "@/lib/admin-fetch";

import type { TriggerPaymentConfirmationResult } from "../_types/handler-inputs";

/* ===============================================================
   🛡️ FAZ 2 — triggerPaymentConfirmation (AWAITED ORCHESTRATOR)
   ===============================================================
   Eski page.tsx içinde inline tanımlı `triggerPaymentConfirmation`
   const declaration'ının BYTE-IDENTICAL kopyası (line 1549-1595).

   Manuel "Ödemeyi Onayla" butonu kaldırıldı. Yeni akışta admin
   status="confirmed" + paid_amount>0 ile kaydedince saveAll
   mevcut /api/mail/payment-confirmed route'unu çağırır.

   Route atomik olarak:
     - status              = "confirmed"
     - payment_link_status = "paid"
   ve internal POST /api/mail/reservation-approved ile müşteriye
   "Rezervasyonunuz onaylandı" maili gönderir.

   Bu helper sadece HTTP çağrısını + structured logging'i yönetir.
   Lifecycle mantığı SERVER tarafında — duplicated logic YOK.

   ⚠️ KESIN KURAL — saveAll AST contract bu helper'a
   `triggerPaymentConfirmation` ismi ile bakıyor — module path
   değişimi AST testini ETKİLEMEZ (function name korunur).

   ⚠️ KESIN KURAL — Console tag'leri aynen:
     [mail.payment_confirmed] FAILED
     [mail.payment_confirmed] WARNING
     [mail.payment_confirmed] CONFIRMED
     [mail.payment_confirmed] DISPATCH ERROR
=============================================================== */

export async function triggerPaymentConfirmation(
  reservationId: string
): Promise<TriggerPaymentConfirmationResult> {
  try {
    const res = await adminFetch("/api/mail/payment-confirmed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg =
        (json && typeof json.error === "string" && json.error) ||
        res.statusText ||
        "Ödeme onayı tamamlanamadı";
      console.error("[mail.payment_confirmed] FAILED", {
        reservationId,
        status: res.status,
        error: errMsg,
      });
      return { ok: false, error: errMsg };
    }

    if (json?.warning) {
      console.warn("[mail.payment_confirmed] WARNING", {
        reservationId,
        warning: json.warning,
      });
      return { ok: true, warning: json.warning };
    }

    console.info("[mail.payment_confirmed] CONFIRMED", {
      reservationId,
      recipient: json?.recipient,
    });
    return { ok: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[mail.payment_confirmed] DISPATCH ERROR", {
      reservationId,
      error: msg,
    });
    return { ok: false, error: msg };
  }
}
