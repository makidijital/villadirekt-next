/* ===============================================================
   📦 Reservation Detail — PaymentCard (Adım 5: Tahsilat)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.
   Alınan tutar input + quick fill chip + status badge + kalan.
   getPaymentDisplayValues helper import burada local; logic değişmedi.
=============================================================== */

import Section from "./Section";
import Label from "./Label";
import { getPaymentDisplayValues } from "@/lib/payment.helper";

export default function PaymentCard({
  data,
  setData,
  autoPrepayment,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
  /** Otomatik ön ödeme (builder'ın kilit yokken yazacağı değer). */
  autoPrepayment: number;
}) {
  return (
    <Section
      eyebrow="Tahsilat"
      title="Ödeme durumu"
      subtitle="Misafirden alınan tutar ve ödeme durumu"
    >
      {(() => {
        const totalTRY = Number(data.total_price_try || 0);
        const paid = Number(data.paid_amount || 0);

        // 🔥 PAYMENT STATUS DERIVE
        const paymentStatus =
          paid <= 0
            ? "unpaid"
            : paid < totalTRY
              ? "partial"
              : "paid";

        /* ---------------------------------------------
           🔥 QUICK FILL — payment_preference'a göre
           Helper'dan gelen payNow tek source-of-truth:
             - prepayment   → prepayment_amount
             - full_payment → total_price_try
           Burada hesap yapma, helper kullan.
        ---------------------------------------------- */
        const payment = getPaymentDisplayValues(data);
        const quickFillValue = payment.payNow;
        const quickFillLabel = payment.isFullPayment
          ? "Tüm Tutarı Doldur"
          : "Ön Ödemeyi Doldur";
        const quickFillVisible =
          quickFillValue > 0 && paid !== quickFillValue;

        const statusUI = {
          unpaid: {
            label: "Ödenmedi",
            bg: "bg-stone-50",
            color: "text-stone-700",
            border: "border-stone-200",
          },
          partial: {
            label: "Kısmi ödendi",
            bg: "bg-amber-50",
            color: "text-amber-700",
            border: "border-amber-200",
          },
          paid: {
            label: "Tamamı ödendi",
            bg: "bg-emerald-50",
            color: "text-emerald-700",
            border: "border-emerald-200",
          },
        }[paymentStatus];

        const remainingFromPaid = Math.max(totalTRY - paid, 0);

        /* ---------------------------------------------
           🛡️ ŞİMDİ ÖDENECEK TUTAR — MEVCUT prepayment_amount
           Müşteriye gönderilen "Şimdi Ödenecek Tutar" bu alandır
           (mail route'ları getPaymentDisplayValues → payNow).
           paid_amount'a DOKUNMAZ. Tam ödemede payNow = toplam
           (mevcut kural) → salt okunur gösterilir.
        ---------------------------------------------- */
        const autoPayNow = Math.max(Number(autoPrepayment) || 0, 0);
        const storedPrepayment =
          data.prepayment_amount === null ||
          data.prepayment_amount === undefined
            ? null
            : Number(data.prepayment_amount);
        const payNowInputValue = payment.isFullPayment
          ? totalTRY
          : storedPrepayment !== null && Number.isFinite(storedPrepayment)
            ? storedPrepayment
            : autoPayNow;
        const autoFillVisible =
          !payment.isFullPayment &&
          autoPayNow > 0 &&
          payNowInputValue !== autoPayNow;

        return (
          <div className="space-y-4">
            {/* PAY NOW (prepayment_amount) INPUT */}
            <div className="space-y-1.5">
              <Label>Şimdi Ödenecek Tutar (TRY)</Label>
              <input
                type="number"
                value={payNowInputValue}
                readOnly={payment.isFullPayment}
                onChange={(e) => {
                  if (payment.isFullPayment) return;
                  /* Negatif → 0, toplamı aşan → toplam (kabul edilmez). */
                  const raw = Number(e.target.value);
                  const next = Math.min(
                    Math.max(Number.isFinite(raw) ? raw : 0, 0),
                    totalTRY
                  );
                  setData((prev) => ({
                    ...prev,
                    prepayment_amount: next,
                    prepayment_manual_amount: next,
                  }));
                }}
                className="input"
                min={0}
                max={totalTRY}
              />
              {autoFillVisible && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        prepayment_amount: autoPayNow,
                        prepayment_manual_amount: null,
                      }))
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--color-stone-200)] text-[var(--color-stone-700)] bg-white hover:bg-[var(--color-sand-50)] hover:border-[var(--color-champagne-500)] transition"
                  >
                    <span>Otomatik Ön Ödemeyi Doldur</span>
                    <span className="text-[var(--color-stone-400)]">·</span>
                    <span className="font-semibold text-[var(--color-stone-900)] tabular-nums">
                      ₺
                      {Number(autoPayNow).toLocaleString("tr-TR", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </button>
                </div>
              )}
              <p className="text-[11px] text-[var(--color-stone-500)]">
                {payment.isFullPayment
                  ? "Tam ödeme seçili — şimdi ödenecek tutar toplam tutardır."
                  : "Müşteriye gönderilen ödeme tutarıdır; tahsil edilmiş sayılmaz. Göndermeden önce “Değişiklikleri Kaydet”i kullanın."}
              </p>
            </div>

            {/* PAID AMOUNT INPUT */}
            <div className="space-y-1.5">
              <Label>Alınan tutar (TRY)</Label>
              <input
                type="number"
                value={Number(data.paid_amount) || 0}
                onChange={(e) =>
                  /* 🛡️ FUNCTIONAL UPDATE (Faz 3A):
                     paid_amount tahsilat akışının kalbinde;
                     eşzamanlı status / payment_preference
                     değişikliklerinde stale closure ile
                     eski paid_amount geri yazılma riski
                     kapatıldı. */
                  setData((prev) => ({
                    ...prev,
                    paid_amount: Number(e.target.value) || 0,
                  }))
                }
                className="input"
                min={0}
              />

              {/* 🔥 QUICK FILL CHIP — context-aware
                  payment_preference'a göre tek button.
                  Sadece input value set eder; admin yine
                  "Değişiklikleri Kaydet" butonuna basar. */}
              {quickFillVisible && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      /* 🛡️ FUNCTIONAL UPDATE (Faz 3A):
                         quickFill'in stale data snapshot'ı
                         eski paid_amount'u geri yazıyordu;
                         prev üzerinden update ile race
                         kapatıldı.  quickFillValue zaten
                         snapshot'tan türetildiği için aynı
                         değer geçer. */
                      setData((prev) => ({
                        ...prev,
                        paid_amount: quickFillValue,
                      }))
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--color-stone-200)] text-[var(--color-stone-700)] bg-white hover:bg-[var(--color-sand-50)] hover:border-[var(--color-champagne-500)] transition"
                  >
                    <span>{quickFillLabel}</span>
                    <span className="text-[var(--color-stone-400)]">·</span>
                    <span className="font-semibold text-[var(--color-stone-900)] tabular-nums">
                      ₺
                      {Number(quickFillValue).toLocaleString("tr-TR", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* STATUS BADGE + REMAINING */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl px-4 py-3">
              <span
                className={`px-3 py-1.5 rounded-full text-xs border font-medium ${statusUI.bg} ${statusUI.color} ${statusUI.border}`}
              >
                {statusUI.label}
              </span>

              <div className="text-xs text-[var(--color-stone-500)]">
                Kalan:&nbsp;
                <span className="text-[var(--color-stone-900)] font-semibold">
                  ₺
                  {Number(remainingFromPaid).toLocaleString("tr-TR", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </Section>
  );
}
