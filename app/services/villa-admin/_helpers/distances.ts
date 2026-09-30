import type { VillaDistanceInput } from "../types";

/* ===============================================================
   🛡️ FAZ 2 — sanitizeDistances (PURE)
   ===============================================================
   Eski villa-admin.service.ts içinde top-level tanımlı pure helper'ın
   birebir kopyası. `setVillaDistances` strict shape
   (`{title: string; distance: string}[]`) bekler; caller'ın
   `VillaDistanceInput` nullable yapısını strict shape'e indirger.

   FİLTRE KURALI:
     - null/empty title VEYA distance → satır filtre dışı
     - Davranış değişmez (eski path zaten title/distance dolu satırları
       içeriyordu; nullable satırlar runtime'da NaN/empty oluyordu).
=============================================================== */

export function sanitizeDistances(
  input: VillaDistanceInput[] | undefined | null
): { title: string; distance: string }[] {
  if (!Array.isArray(input)) return [];
  const out: { title: string; distance: string }[] = [];
  for (const d of input) {
    const t = (d?.title ?? "").toString().trim();
    const dist = (d?.distance ?? "").toString().trim();
    if (t.length === 0 || dist.length === 0) continue;
    out.push({ title: t, distance: dist });
  }
  return out;
}
