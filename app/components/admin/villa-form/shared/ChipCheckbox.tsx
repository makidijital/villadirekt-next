/* ===============================================================
   🔥 ChipCheckbox — types/features/rules/includes seçim chip'i.
   Pure presentational. Original styling birebir.
   =============================================================== */

export default function ChipCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`
        flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition border
        ${
          checked
            ? "bg-[var(--color-stone-900)] text-white border-[var(--color-stone-900)] shadow-soft"
            : "bg-white border-[var(--color-stone-100)] hover:border-[var(--color-stone-200)] text-[var(--color-stone-800)]"
        }
        active:scale-[0.98]
      `}
    >
      <span className="text-sm font-medium">{label}</span>
      <span
        className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
          checked
            ? "bg-white border-white"
            : "border-[var(--color-stone-200)]"
        }`}
      >
        {checked && (
          <span className="w-2 h-2 bg-[var(--color-stone-900)] rounded-sm" />
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="hidden"
      />
    </label>
  );
}
