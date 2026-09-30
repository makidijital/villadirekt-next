/* ===============================================================
   📦 Reservation Detail — Label (presentational wrapper)
   ===============================================================
   FAZ 1 refactor: zero regression. Form alanları için kompakt
   uppercase eyebrow-style label.
=============================================================== */

export default function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
      {children}
    </label>
  );
}
