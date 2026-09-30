/* ===============================================================
   📦 Reservation Detail — StatusCard (Adım 6: Rezervasyon durumu)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.
   3 status butonu (pending/confirmed/rejected) + confirm guard.
   canConfirmReservation + RESERVATION_CONFIRM_GUARD_MESSAGE helper
   import burada local; toast prop'tan gelir.
=============================================================== */

import Section from "./Section";
import {
  canConfirmReservation,
  RESERVATION_CONFIRM_GUARD_MESSAGE,
} from "@/lib/reservation-confirm.helper";

export default function StatusCard({
  data,
  setData,
  toast,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
  toast: {
    error: (
      title: string,
      opts?: { id?: string; description?: string }
    ) => void;
  };
}) {
  return (
    <Section
      eyebrow="Durum"
      title="Rezervasyon durumu"
      subtitle="Onayla, beklet veya reddet"
    >
      <div className="flex flex-wrap gap-2">
        {[
          {
            key: "pending",
            label: "Bekliyor",
            bg: "bg-amber-50",
            color: "text-amber-700",
            border: "border-amber-200",
          },
          {
            key: "confirmed",
            label: "Onaylandı",
            bg: "bg-emerald-50",
            color: "text-emerald-700",
            border: "border-emerald-200",
          },
          {
            key: "rejected",
            label: "Reddedildi",
            bg: "bg-red-50",
            color: "text-red-700",
            border: "border-red-200",
          },
        ].map((s) => {
          const active = data.status === s.key;
          // 🔥 GUARD — "Onaylandı" yalnız ödeme alındıktan sonra
          const confirmBlocked =
            s.key === "confirmed" &&
            !canConfirmReservation(data.paid_amount);
          return (
            <button
              key={s.key}
              onClick={() => {
                if (confirmBlocked) {
                  toast.error("Onaylanamaz", {
                    id: "confirm-guard",
                    description: RESERVATION_CONFIRM_GUARD_MESSAGE,
                  });
                  return;
                }
                /* 🛡️ FUNCTIONAL UPDATE (Faz 3A):
                   Status değişimi saveAll'in transition
                   guard'ına direkt giriyor; stale closure
                   paid_amount/payment alanlarını eziyordu. */
                setData((prev) => ({ ...prev, status: s.key }));
              }}
              disabled={confirmBlocked && !active}
              title={
                confirmBlocked && !active
                  ? RESERVATION_CONFIRM_GUARD_MESSAGE
                  : undefined
              }
              className={`px-4 py-2 rounded-full text-sm border transition font-medium ${
                active
                  ? `${s.bg} ${s.color} ${s.border}`
                  : confirmBlocked
                    ? "bg-[var(--color-stone-50)] text-[var(--color-stone-400)] border-[var(--color-stone-100)] cursor-not-allowed"
                    : "bg-white text-[var(--color-stone-700)] border-[var(--color-stone-100)] hover:border-[var(--color-stone-200)]"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {!canConfirmReservation(data.paid_amount) && (
        <p className="text-xs text-[var(--color-stone-500)] mt-3">
          {RESERVATION_CONFIRM_GUARD_MESSAGE}
        </p>
      )}
    </Section>
  );
}
