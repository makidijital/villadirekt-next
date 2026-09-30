/* ===============================================================
   📦 Reservation Detail — Row (price breakdown line)
   ===============================================================
   FAZ 1 refactor: zero regression. Fiyat detay panelinde label/value
   row'u (flex between).
=============================================================== */

export default function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between text-[var(--color-stone-700)]">
      <span>{label}</span>
      <span className="text-[var(--color-stone-900)] font-medium">
        {value}
      </span>
    </div>
  );
}
