import type { ReactNode } from "react";

/* ===============================================================
   🔥 Label — uppercase letterspacing form label.
   Pure presentational. Önceden inline tanımlıydı.
   =============================================================== */
export default function Label({ children }: { children: ReactNode }) {
  return (
    <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
      {children}
    </label>
  );
}
