/* ===============================================================
   🛡️ FAZ 2 — dispatchPublicReservationRequestMail (fire-forget)
   ===============================================================
   Eski `ReservationForm.tsx > handleSubmit` içinde inline fire-forget
   mail dispatch'in BYTE-IDENTICAL kopyası (L387-409).

   ⚠️ KESIN KURAL — PUBLIC vs ADMIN farkları:
     PUBLIC (bu helper):
       - Tag: "[mail.reservation_request] non-blocking error:"
       - Tag: "[mail.reservation_request] dispatch failed:"
       - Outer try/catch + inner .catch (defensive double-guard)
       - Yalnız error log; success log YOK

     ADMIN (../admin/.../_helpers/dispatchReservationRequestMail):
       - Tag prefix: "[admin.create.mail.reservation_request]"
       - SENT/FAILED/DISPATCH ERROR — 3 ayrı tag
       - .then ile success log VAR
       - Outer try yok (yalnız .catch)

   Bu farklar BYTE-IDENTICAL korunmalı → ayrı public helper.

   ⚠️ KESIN KURAL — Endpoint + body + keepalive AYNEN:
     - POST /api/mail/reservation-request
     - body: JSON.stringify({ reservationId })
     - keepalive: true
     - Content-Type: application/json
=============================================================== */

export function dispatchPublicReservationRequestMail(
  reservationId: string
): void {
  if (!reservationId) return;
  try {
    // await YOK → fire-and-forget
    fetch("/api/mail/reservation-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
      // tarayıcı sayfa kapansa bile request gitsin
      keepalive: true,
    }).catch((mailErr) => {
      console.warn(
        "[mail.reservation_request] non-blocking error:",
        mailErr?.message || mailErr
      );
    });
  } catch (mailErr: unknown) {
    const msg = mailErr instanceof Error ? mailErr.message : mailErr;
    console.warn(
      "[mail.reservation_request] dispatch failed:",
      msg
    );
  }
}
