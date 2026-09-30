/* ===============================================================
   🛡️ FAZ 3 — dispatchReservationRequestMail (fire-forget)
   ===============================================================
   Eski page.tsx içinde inline tanımlı `dispatchReservationRequestMail`
   helper'ının birebir kopyası. Pure side-effect orchestrator (network
   request + structured logging); zero state, zero React hook.

   ⚠️ KESIN KURAL: fire-and-forget pattern BYTE-IDENTICAL korundu:
     - `keepalive: true` (router.push sonrası bile request gider)
     - `.then(async (res) => ...)` block — structured logging
     - `.catch((mailErr) => ...)` — silent fail YOK, structured error
     - Promise return edilmez (caller await etmez)

   ÇAĞRILDIĞI YER:
     handleCreate başarı dalları (custom + normal branch).
     SIRA: DB insert AWAIT edildikten SONRA, toast.success ÖNCE
     fire-forget olarak tetiklenir. Mail başarısız olsa bile
     rezervasyon başarısız sayılmaz (UI redirect zaten yapmış olur).

   STRUCTURED LOG TAG'LARI (değişmedi):
     [admin.create.mail.reservation_request] SENT
     [admin.create.mail.reservation_request] FAILED
     [admin.create.mail.reservation_request] DISPATCH ERROR
=============================================================== */

export function dispatchReservationRequestMail(
  reservationId: string
): void {
  if (!reservationId) return;
  fetch("/api/mail/reservation-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservationId }),
    keepalive: true,
  })
    .then(async (res) => {
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error("[admin.create.mail.reservation_request] FAILED", {
          reservationId,
          status: res.status,
          error: errBody?.error || res.statusText,
        });
        return;
      }
      const ok = await res.json().catch(() => ({}));
      console.info("[admin.create.mail.reservation_request] SENT", {
        reservationId,
        recipient: ok?.recipient,
      });
    })
    .catch((mailErr: unknown) => {
      const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      console.error("[admin.create.mail.reservation_request] DISPATCH ERROR", {
        reservationId,
        error: msg,
      });
    });
}
