import Section from "@/app/components/admin/villa-form/shared/Section";

import type {
  ReservationFormShape,
  ReservationFormSetter,
} from "./types";

/* ===============================================================
   🔥 NoteStep — Wizard Adım 9.
   Dahili admin notu (textarea). Pure presentational.
   =============================================================== */

export default function NoteStep({
  data,
  setData,
}: {
  data: ReservationFormShape;
  setData: ReservationFormSetter;
}) {
  return (
    <Section
      eyebrow="Adım 3"
      title="Not"
      subtitle="Dahili not (isteğe bağlı)"
    >
      <textarea
        value={data.note || ""}
        onChange={(e) => setData({ ...data, note: e.target.value })}
        className="input !rounded-2xl !p-4 min-h-[120px] resize-none"
      />
    </Section>
  );
}
