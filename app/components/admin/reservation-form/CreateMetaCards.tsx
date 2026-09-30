import type { VillaOption } from "./types";

/* ===============================================================
   🔥 CreateMetaCards — create page üst META kartları.
   "Oluşturma tarihi" + "Villa" iki kart yan yana.
   Pure presentational. createdLabel her render'da yeniden okunabilir;
   page tarafında new Date().toLocaleDateString("tr-TR") çağrısı
   ile geçirilir (mevcut davranış birebir).
   =============================================================== */

export default function CreateMetaCards({
  createdLabel,
  villaTitle,
}: {
  createdLabel: string;
  villaTitle: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card-premium p-5">
        <p className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
          Oluşturma tarihi
        </p>
        <p className="font-display text-xl text-[var(--color-stone-900)] mt-1">
          {createdLabel}
        </p>
      </div>
      <div className="card-premium p-5">
        <p className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
          Mülk
        </p>
        <p className="font-medium text-[var(--color-stone-900)] mt-1">
          {villaTitle || "—"}
        </p>
      </div>
    </div>
  );
}

/* Re-export for convenience — page'den option dizisi geçirip
   selected villayı bulmak için. */
export function findVillaTitle(
  villas: ReadonlyArray<VillaOption>,
  villaId: string | undefined
): string {
  if (!villaId) return "";
  return villas.find((v) => v.id === villaId)?.title || "";
}
