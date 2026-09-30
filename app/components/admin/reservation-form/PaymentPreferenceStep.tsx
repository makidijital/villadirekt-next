import Section from "@/app/components/admin/villa-form/shared/Section";

import type { PaymentPreference } from "@/lib/payment.helper";

import type {
  ReservationFormShape,
  ReservationFormSetter,
  ReservationFormErrors,
} from "./types";

/* ===============================================================
   🔥 PaymentPreferenceStep — Wizard Adım 8.
   prepayment / full_payment radio. Pure presentational.
   payment_preference helper'ı (lib/payment.helper) tek
   source-of-truth; bu component yalnız değer aktarır.
   =============================================================== */

const OPTIONS: ReadonlyArray<{
  value: PaymentPreference;
  label: string;
}> = [
  { value: "prepayment", label: "Ön Ödeme" },
  {
    value: "full_payment",
    label: "Tamamını Ödemek İstiyorum",
  },
];

export default function PaymentPreferenceStep({
  data,
  setData,
  errors,
}: {
  data: ReservationFormShape;
  setData: ReservationFormSetter;
  errors: ReservationFormErrors;
}) {
  return (
    <Section
      eyebrow="Adım 3"
      title="Ödeme Tercihi"
      subtitle="Misafir şimdi sadece ön ödeme mi yapacak, yoksa tamamını mı?"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((opt) => {
          const checked = data.payment_preference === opt.value;
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
                name="admin_payment_preference"
                checked={checked}
                onChange={() =>
                  setData({ ...data, payment_preference: opt.value })
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
      {errors.payment_preference && (
        <p className="text-xs text-red-500 mt-2">
          {errors.payment_preference}
        </p>
      )}
    </Section>
  );
}
