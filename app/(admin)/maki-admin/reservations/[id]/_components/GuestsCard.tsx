/* ===============================================================
   📦 Reservation Detail — GuestsCard (Adım 3: Misafir bilgisi)
   ===============================================================
   FAZ 2 refactor: misafir sayısı input + ek misafir isim alanları.
   guestNames state + setGuestNames page.tsx'te (init/sync useEffect'ler
   FAZ 3'te custom hook'a taşınacak). Logic ve setData functional
   update aynen.
=============================================================== */

import Section from "./Section";
import Label from "./Label";

export default function GuestsCard({
  data,
  setData,
  guestNames,
  setGuestNames,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
  guestNames: string[];
  setGuestNames: (next: string[]) => void;
}) {
  return (
    <Section
      eyebrow="Misafir"
      title="Misafir bilgisi"
      subtitle="Toplam misafir sayısı ve ek misafir isimleri"
    >
      <div className="space-y-1.5">
        <Label>Toplam misafir</Label>
        <input
          type="number"
          value={data.guests || 1}
          onChange={(e) =>
            /* 🛡️ FUNCTIONAL UPDATE (Faz 3A): guests recompute
               guestNames sync useEffect'iyle eşzamanlı; race
               sırasında prev üzerinden update edildiğinde
               guests sayısı kaybolmaz. */
            setData((prev) => ({
              ...prev,
              guests: Math.max(Number(e.target.value) || 0, 0),
            }))
          }
          className="input"
          min={1}
        />
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
