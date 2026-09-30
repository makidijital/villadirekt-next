import Section from "@/app/components/admin/villa-form/shared/Section";

import type {
  ReservationFormShape,
  ReservationFormSetter,
  ReservationFormErrors,
  PaymentMethodOption,
} from "./types";

/* ===============================================================
   🔥 PaymentMethodStep — Wizard Adım 7.
   payment_methods tablosundan radyo seçimi.
   Pure presentational. payment_method_id parent'a yansıtılır.
   =============================================================== */

export default function PaymentMethodStep({
  data,
  setData,
  errors,
  paymentMethods,
}: {
  data: ReservationFormShape;
  setData: ReservationFormSetter;
  errors: ReservationFormErrors;
  paymentMethods: ReadonlyArray<PaymentMethodOption>;
}) {
  return (
    <Section
      eyebrow="Adım 3"
      title="Ödeme yöntemi"
      subtitle="Misafirin tercih ettiği ödeme yöntemini seç"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {paymentMethods.length === 0 && (
          <p className="text-sm text-[var(--color-stone-400)] italic">
            Ödeme yöntemi bulunamadı
          </p>
        )}
        {paymentMethods.map((p) => {
          const checked = data.payment_method_id === p.id;
          return (
            <label
              key={p.id}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border cursor-pointer transition ${
                checked
                  ? "border-[var(--color-champagne-500)] bg-[var(--color-sand-50)]"
                  : "border-[var(--color-stone-100)] hover:border-[var(--color-stone-200)]"
              }`}
            >
              <input
                type="radio"
                name="admin_payment_method"
                checked={checked}
                onChange={() =>
                  setData({ ...data, payment_method_id: p.id })
                }
                className="!w-4 !h-4 accent-[var(--color-champagne-500)]"
              />
              <span className="text-sm font-medium text-[var(--color-stone-900)]">
                {p.name}
              </span>
            </label>
          );
        })}
      </div>
      {errors.payment_method_id && (
        <p className="text-xs text-red-500 mt-2">
          {errors.payment_method_id}
        </p>
      )}
    </Section>
  );
}
