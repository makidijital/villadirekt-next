import { adminFetch } from "@/lib/admin-fetch";

import type { DispatchStatusChangeMailInput } from "../_types/handler-inputs";

/* ===============================================================
   🛡️ FAZ 2 — dispatchStatusChangeMail (NETWORK-SIDE ORCHESTRATOR)
   ===============================================================
   Eski page.tsx içinde inline tanımlı `function dispatchStatusChangeMail`
   declaration'ının BYTE-IDENTICAL kopyası (line 1388-1431).

   - Sadece oldStatus !== newStatus ise mail gönderir
   - confirmed → reservation_approved
   - rejected | cancelled → reservation_cancelled
   - fire-and-forget; reservation update'ini bozmaz

   ⚠️ KESIN KURAL — saveAll'dan çağrılır; AST contract bu helper'a
   `dispatchStatusChangeMail` ismi ile bakıyor — module path değişimi
   AST testini ETKİLEMEZ (function name korunur).

   ⚠️ KESIN KURAL — Console.warn tag'leri aynen:
     [mail.reservation_approved] non-blocking error:
     [mail.reservation_cancelled] non-blocking error:
     [mail.status-change] dispatch failed:

   ⚠️ KESIN KURAL — fire-forget pattern:
     - keepalive: true (router.push sonrası bile request gider)
     - .catch(mailErr => console.warn(...)) silent fail prevention
     - Outer try/catch — adminFetch sync sub-failures için
=============================================================== */

export function dispatchStatusChangeMail(
  input: DispatchStatusChangeMailInput
): void {
  const { reservationId, oldStatus, newStatus } = input;

  if (!reservationId || !newStatus) return;
  if (oldStatus === newStatus) return; // status gerçekten değişmedi → mail YOK

  try {
    if (newStatus === "confirmed") {
      adminFetch("/api/mail/reservation-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
        keepalive: true,
      }).catch((mailErr) => {
        console.warn(
          "[mail.reservation_approved] non-blocking error:",
          mailErr?.message || mailErr
        );
      });
    } else if (
      newStatus === "rejected" ||
      newStatus === "cancelled"
    ) {
      adminFetch("/api/mail/reservation-cancelled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
        keepalive: true,
      }).catch((mailErr) => {
        console.warn(
          "[mail.reservation_cancelled] non-blocking error:",
          mailErr?.message || mailErr
        );
      });
    }
  } catch (mailErr: unknown) {
    console.warn(
      "[mail.status-change] dispatch failed:",
      mailErr instanceof Error ? mailErr.message : mailErr
    );
  }
}
