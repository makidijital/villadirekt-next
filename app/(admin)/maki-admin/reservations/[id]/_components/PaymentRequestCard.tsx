/* ===============================================================
   📦 Reservation Detail — PaymentRequestCard (Adım 5: Ödeme Talebi)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.
   Conditional rendering: isPaymentRequestSupported(method) caller'da
   yapılır; bu component yalnız render alır.

   credit_card → link input + send button
   bank_transfer → info note + send button

   sendPaymentRequest handler page.tsx'te (saveAll ile aynı tier'da);
   prop olarak gelir.
=============================================================== */

import Section from "./Section";
import Label from "./Label";
import { formatDateTimeTr } from "@/lib/date-format";
import {
  normalizePaymentLinkStatus,
  paymentLinkStatusLabel,
  paymentLinkStatusColor,
  isCreditCardMethod,
  isBankTransferMethod,
  paymentRequestActionLabel,
  type PaymentLinkStatus,
} from "@/lib/payment-link.helper";

export default function PaymentRequestCard({
  data,
  setData,
  sendPaymentRequest,
  paymentLinkSending,
  paymentLinkError,
  setPaymentLinkError,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
  sendPaymentRequest: () => void | Promise<void>;
  paymentLinkSending: boolean;
  paymentLinkError: string;
  setPaymentLinkError: (next: string) => void;
}) {
  return (
    <Section
      eyebrow="Ödeme Talebi"
      title="Ödeme Talebi"
      subtitle={
        isCreditCardMethod(data?.payment_method)
          ? "Müşteriye ödeme linki gönder ve durumunu takip et"
          : "Müşteriye banka hesap bilgilerini gönder ve durumunu takip et"
      }
    >
      {(() => {
        const method = data?.payment_method;
        const status: PaymentLinkStatus = normalizePaymentLinkStatus(
          data?.payment_link_status
        );
        const tokens = paymentLinkStatusColor(status);
        /* 🛡️ Central helper (manual UTC→Istanbul math) —
           Intl bypass-proof. lib/date-format.ts > formatDateTimeTr */
        const sentAt = data?.payment_link_sent_at
          ? formatDateTimeTr(data.payment_link_sent_at)
          : null;

        const actionLabel = paymentRequestActionLabel(method);
        const isPaid = status === "paid";

        const sendButtonLabel = paymentLinkSending
          ? "Gönderiliyor…"
          : status === "sent"
            ? `${actionLabel} (Tekrar)`
            : actionLabel;

        return (
          <div className="space-y-4">
            {/* LINK INPUT — sadece credit_card */}
            {isCreditCardMethod(method) && (
              <div className="space-y-1.5">
                <Label>Ödeme linki</Label>
                <input
                  type="url"
                  value={data?.payment_link || ""}
                  onChange={(e) => {
                    /* 🛡️ FUNCTIONAL UPDATE (Faz 3A) */
                    setData((prev) => ({
                      ...prev,
                      payment_link: e.target.value,
                    }));
                    if (paymentLinkError) setPaymentLinkError("");
                  }}
                  placeholder="https://..."
                  className="input"
                />
                <p className="text-[11px] text-[var(--color-stone-500)]">
                  Linki kaydetmek için sayfanın altındaki
                  &ldquo;Değişiklikleri Kaydet&rdquo; butonunu kullan.
                </p>
              </div>
            )}

            {/* BANK TRANSFER NOTE — bilgi amaçlı */}
            {isBankTransferMethod(method) && (
              <div className="bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl px-4 py-3 text-xs text-[var(--color-stone-600)]">
                Mail, &ldquo;Firma Hesap Bilgileri&rdquo; bölümündeki
                <span className="font-semibold text-[var(--color-stone-900)]">
                  {" "}
                  aktif hesap{" "}
                </span>
                üzerinden gönderilir. Aktif hesap yoksa gönderim hata verir.
              </div>
            )}

            {/* STATUS BADGE + SENT AT */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl px-4 py-3">
              <span
                className={`px-3 py-1.5 rounded-full text-xs border font-medium ${tokens.badgeClass}`}
              >
                {paymentLinkStatusLabel(status)}
              </span>
              {sentAt && (
                <div className="text-xs text-[var(--color-stone-500)]">
                  Son gönderim:{" "}
                  <span className="text-[var(--color-stone-900)] font-semibold">
                    {sentAt}
                  </span>
                </div>
              )}
            </div>

            {/* ACTIONS — Send (yalnız ödeme talebi)
                "Ödemeyi Onayla" butonu kaldırıldı. Onay artık
                detail page'in alt "Durum" section'ında
                "Onaylandı" seçilip "Değişiklikleri Kaydet"
                ile otomatik tetikleniyor (saveAll içinde
                transition detection + payment-confirmed). */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={sendPaymentRequest}
                disabled={paymentLinkSending || isPaid}
                className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendButtonLabel}
              </button>

              {paymentLinkError && (
                <p className="text-xs text-red-500 basis-full">
                  {paymentLinkError}
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </Section>
  );
}
