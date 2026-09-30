import Section from "@/app/components/admin/villa-form/shared/Section";
import Label from "@/app/components/admin/villa-form/shared/Label";

import type {
  ReservationFormShape,
  ReservationFormSetter,
  ReservationFormErrors,
} from "./types";

/* ===============================================================
   🔥 PersonalStep — Wizard Adım 1.
   Misafirin iletişim bilgileri (Ad Soyad / Telefon / E-posta /
   TC veya Pasaport). Pure presentational.
   =============================================================== */

const FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "name", label: "Ad Soyad" },
  { key: "phone", label: "Telefon" },
  /* 🛡️ Migration 094 — opsiyonel ikinci telefon. */
  { key: "phone2", label: "Telefon 2" },
  { key: "email", label: "E-posta" },
  { key: "identity_number", label: "TC / Pasaport" },
];

export default function PersonalStep({
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
      eyebrow="Adım 1"
      title="Kişisel bilgiler"
      subtitle="Misafirin iletişim bilgileri"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map((field) => {
          const value = ((data as Record<string, unknown>)[field.key] ??
            "") as string;
          return (
            <div key={field.key} className="space-y-1.5">
              <Label>{field.label}</Label>
              <input
                value={value}
                onChange={(e) =>
                  setData({ ...data, [field.key]: e.target.value })
                }
                className={`input ${
                  errors[field.key] ? "!border-red-500" : ""
                }`}
              />
              {errors[field.key] && (
                <p className="text-xs text-red-500 mt-1">
                  {errors[field.key]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
