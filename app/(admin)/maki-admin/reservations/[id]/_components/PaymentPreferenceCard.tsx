/* ===============================================================
   📦 Reservation Detail — PaymentPreferenceCard (Adım 4)
   ===============================================================
   FAZ 2 refactor: 2 radio button (Ön Ödeme / Tüm Ödeme).
   normalizePaymentPreference helper import burada local.
=============================================================== */

import Section from "./Section";
import {
  normalizePaymentPreference,
  type PaymentPreference,
} from "@/lib/payment.helper";

export default function PaymentPreferenceCard({
  data,
  setData,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
}) {
  return (
    <Section
      eyebrow="Ödeme"
      title="Ödeme Tercihi"
      subtitle="Misafir şimdi ön ödeme mi yaptı, tüm tutarı mı?"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { value: "prepayment" as PaymentPreference, label: "Ön Ödeme" },
          { value: "full_payment" as PaymentPreference, label: "Tüm Ödeme" },
        ].map((opt) => {
          const current = normalizePaymentPreference(data.payment_preference);
          const checked = current === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border cursor-pointer transition ${
                checked
                  ? "border-[var(--color-champagne-500)] bg-[var(--color-sand-50)]"
                  : "border-[var(--color-stone-100)] hover:border-[var(--color-stone-200)]"
              }`}
            >
              <input
                type="radio"
                name="detail_payment_preference"
                checked={checked}
                onChange={() =>
                  /* 🛡️ FUNCTIONAL UPDATE (Faz 3A):
                     payment_preference saveAll içinde
                     financial snapshot'ı türetiyor; stale
                     closure burada paid_amount/total_price_try
                     güncellemelerini eziyordu. */
                  setData((prev) => ({
                    ...prev,
                    payment_preference: opt.value,
                  }))
                }
                className="!w-4 !h-4 accent-[var(--color-champagne-500)]"
              />
              <span className="text-sm font-medium text-[var(--color-stone-900)]">
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </Section>
  );
}
