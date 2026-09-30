/* ===============================================================
   📦 Reservation Detail — NoteCard (Adım 6: dahili not)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.
   Logic page.tsx'te kalır — setData functional update aynen kullanılır.
   Davranış değişmedi; sadece presentational separation.
=============================================================== */

import Section from "./Section";

export default function NoteCard({
  data,
  setData,
}: {
  data: { note?: string | null } | null;
  /* setData functional update pattern aynen page.tsx'teki gibi —
     `any` kullanımı bilinçli (mevcut state typing bütüncül değil;
     refactor FAZ 3/4 değil; davranış byte-identical kalır). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
}) {
  return (
    <Section eyebrow="Not" title="Dahili not" subtitle="Misafir Notu">
      <textarea
        value={data?.note || ""}
        /* 🛡️ FUNCTIONAL UPDATE (Faz 3A) */
        onChange={(e) =>
          setData((prev) => ({ ...prev, note: e.target.value }))
        }
        className="input !rounded-2xl !p-4 min-h-[120px] resize-none"
      />
    </Section>
  );
}
