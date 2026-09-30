/* ===============================================================
   🔥 Row — fiyat özeti satırı (label + value).
   Pure presentational. Önceden create page altında inline
   tanımlıydı; davranış birebir aynı.
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
