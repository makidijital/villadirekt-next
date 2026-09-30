import { Home as HomeIcon } from "lucide-react";

import Section from "@/app/components/admin/villa-form/shared/Section";
import Label from "@/app/components/admin/villa-form/shared/Label";
import VillaCombobox from "@/app/(admin)/maki-admin/manual-reservations/ekle/VillaCombobox";

import type {
  ReservationFormShape,
  ReservationFormErrors,
  VillaOption,
} from "./types";

/* ===============================================================
   🔥 VillaSelectStep — Wizard Adım 3.
   Villa select dropdown. Pure presentational.
   onVillaChange prop ile parent (page) hem data.villa_id'yi
   günceller hem de (gerekirse) tarihleri / priceDetail'i sıfırlar.
   Component bu side-effect'lerden habersizdir; sadece seçilen
   id'yi yukarı bildirir.
   =============================================================== */

export default function VillaSelectStep({
  data,
  errors,
  villas,
  onVillaChange,
}: {
  data: ReservationFormShape;
  errors: ReservationFormErrors;
  villas: ReadonlyArray<VillaOption>;
  onVillaChange: (villaId: string) => void;
}) {
  return (
    <Section
      eyebrow="Adım 2"
      title="Mülk"
      subtitle="Rezervasyon yapılacak mülkü seç"
    >
      <div className="space-y-1.5">
        <Label>
          <HomeIcon
            size={12}
            className="text-[var(--color-champagne-600)] inline mr-1.5"
          />
          Mülk
        </Label>
        <VillaCombobox
          villas={villas as unknown as VillaOption[]}
          value={data.villa_id || ""}
          onChange={onVillaChange}
          placeholder="Mülk seç"
          error={!!errors.villa_id}
        />
        {errors.villa_id && (
          <p className="text-xs text-red-500 mt-1">{errors.villa_id}</p>
        )}
      </div>
    </Section>
  );
}
