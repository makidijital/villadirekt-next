import Section from "@/app/components/admin/villa-form/shared/Section";
import Label from "@/app/components/admin/villa-form/shared/Label";

import type {
  ReservationFormShape,
  ReservationFormSetter,
  ReservationFormErrors,
} from "./types";

/* ===============================================================
   🔥 GuestsStep — Wizard Adım 5.
   Toplam misafir sayısı + ek misafir adları (guest_names array).
   Pure presentational; guests sayısı değişince array boyu
   senkronlama page tarafındaki useEffect ile yönetilir,
   bu component yalnız render eder.
   =============================================================== */

export default function GuestsStep({
  data,
  setData,
  errors,
  guestNames,
  setGuestNames,
}: {
  data: ReservationFormShape;
  setData: ReservationFormSetter;
  errors: ReservationFormErrors;
  guestNames: string[];
  setGuestNames: (next: string[]) => void;
}) {
  return (
    <Section
      eyebrow="Adım 2"
      title="Misafir bilgisi"
      subtitle="Toplam misafir sayısı"
    >
      <div className="space-y-1.5">
        <Label>Toplam misafir</Label>
        <input
          type="number"
          value={data.guests || 1}
          onChange={(e) =>
            setData({
              ...data,
              guests: Math.max(Number(e.target.value) || 0, 0),
            })
          }
          className={`input ${errors.guests ? "!border-red-500" : ""}`}
          min={1}
        />
        {errors.guests && (
          <p className="text-xs text-red-500 mt-1">{errors.guests}</p>
        )}
      </div>

      {guestNames.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
            Diğer misafirler
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {guestNames.map((g: string, i: number) => (
              <input
                key={i}
                value={g}
                placeholder={`Misafir ${i + 2} Ad Soyad`}
                onChange={(e) => {
                  const updated = [...guestNames];
                  updated[i] = e.target.value;
                  setGuestNames(updated);
                }}
                className="input"
              />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
