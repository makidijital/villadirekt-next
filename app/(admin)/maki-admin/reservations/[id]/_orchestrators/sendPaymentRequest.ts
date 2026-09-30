import { adminFetch } from "@/lib/admin-fetch";
import {
  isCreditCardMethod,
  paymentRequestEndpoint,
} from "@/lib/payment-link.helper";

import type { SendPaymentRequestInput } from "../_types/handler-inputs";

/* ===============================================================
   🛡️ FAZ 2 — sendPaymentRequest (UNIFIED PAYMENT REQUEST FLOW)
   ===============================================================
   Eski page.tsx içinde inline tanımlı `sendPaymentRequest` const
   declaration'ının BYTE-IDENTICAL kopyası (line 1453-1531).

   PAYMENT REQUEST — UNIFIED FLOW:
     - credit_card  → /api/mail/payment-link (link maili)
     - bank_transfer → /api/mail/bank-transfer-payment (banka bilgileri)
     - Her iki dalda da: success → status='sent', sent_at=now()
     - Endpoint seçimi helper'dan (paymentRequestEndpoint)
     - Structured logging; silent fail YOK

   ⚠️ KESIN KURAL:
     - Error mesajları aynen ("Bu ödeme yöntemi için ödeme talebi
       gönderilemez", "Ödeme linki boş — önce link kaydet", "Mail
       gönderilemedi", "Bilinmeyen hata").
     - Console tag'leri aynen ([mail.payment_request] FAILED/SENT/
       DISPATCH ERROR).
     - Setter sırası aynen:
         setPaymentLinkError("") → setPaymentLinkSending(true)
         → try → finally → setPaymentLinkSending(false)
     - setData LOCAL STATE SYNC: `prev ? {...prev, payment_link_status:
       "sent", payment_link_sent_at: ...} : prev` aynen.
     - JSON parse `.catch(() => ({}))` aynen.

   Page closure'ından gelmesi gereken referanslar:
     - reservationId (id)
     - paymentMethod (data?.payment_method)
     - paymentLink (data?.payment_link)
     - 3 setter (page'in useState dispatch'leri)
=============================================================== */

export async function sendPaymentRequest(
  input: SendPaymentRequestInput
): Promise<void> {
  const { reservationId, paymentMethod, paymentLink, setSending, setError, setData } =
    input;

  const method = paymentMethod;
  const endpoint = paymentRequestEndpoint(method);
  if (!endpoint) {
    setError("Bu ödeme yöntemi için ödeme talebi gönderilemez");
    return;
  }

  // Sadece credit_card için client-side link doğrulaması
  if (isCreditCardMethod(method)) {
    const link = (paymentLink || "").toString().trim();
    if (!link) {
      setError("Ödeme linki boş — önce link kaydet");
      return;
    }
  }

  const methodKind = isCreditCardMethod(method)
    ? "credit_card"
    : "bank_transfer";

  setError("");
  setSending(true);

  try {
    const res = await adminFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg =
        (json && typeof json.error === "string" && json.error) ||
        res.statusText ||
        "Mail gönderilemedi";
      console.error("[mail.payment_request] FAILED", {
        reservationId,
        method: methodKind,
        status: res.status,
        error: errMsg,
      });
      setError(errMsg);
      return;
    }

    console.info("[mail.payment_request] SENT", {
      reservationId,
      method: methodKind,
      recipient: json?.recipient,
      sentAt: json?.sentAt,
    });

    // 🔥 LOCAL STATE SYNC — DB update edildi; UI'ı senkronla
    setData((prev) =>
      prev
        ? {
            ...prev,
            payment_link_status: "sent",
            payment_link_sent_at:
              json?.sentAt || new Date().toISOString(),
          }
        : prev
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[mail.payment_request] DISPATCH ERROR", {
      reservationId,
      method: methodKind,
      error: msg,
    });
    setError(msg);
  } finally {
    setSending(false);
  }
}
