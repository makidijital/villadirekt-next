/* ===============================================================
   📦 Reservation Detail — VillaSelectCard (Adım 2: Villa seçimi)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.

   ⚠️ VILLA CHANGE RESET 65 satırlık business logic'i page.tsx'te
   `handleVillaChange(newVillaId)` olarak tanımlı; prop olarak gelir.
   Logic burada YOK — sadece JSX + onChange tetikleyicisi. FAZ 4'te
   handler ayrı bir _helpers/handleVillaChangeReset.ts'e çıkacak.
=============================================================== */

import { Home as HomeIcon } from "lucide-react";

import Section from "./Section";
import Label from "./Label";
import VillaCombobox from "@/app/(admin)/maki-admin/manual-reservations/ekle/VillaCombobox";

type VillaOption = { id: string; title: string; slug?: string | null };

export default function VillaSelectCard({
  data,
  villas,
  onVillaChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  villas: VillaOption[];
  /* Tüm reset orchestration page.tsx'te; bu prop sadece newVillaId
     iletir. Boş / aynı değer guard handler içinde uygulanır. */
  onVillaChange: (newVillaId: string) => void;
}) {
  return (
    <Section
      eyebrow="Mülk"
      title="Mülk"
      subtitle="Rezervasyonun yapıldığı mülkü değiştirebilirsin"
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
          villas={villas}
          value={data.villa_id || ""}
          onChange={onVillaChange}
          placeholder="Mülk seç"
        />
      </div>
    </Section>
  );
}
