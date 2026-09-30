/* ===============================================================
   🔥 RadioPill — Konum step'inde "Haritadan seç" / "Google iframe"
   gibi seçim pill'i. Pure presentational. Original styling birebir.
   =============================================================== */

export default function RadioPill({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-full border cursor-pointer text-sm transition
        ${
          checked
            ? "bg-[var(--color-sand-50)] border-[var(--color-champagne-500)] text-[var(--color-stone-900)]"
            : "bg-white border-[var(--color-stone-100)] text-[var(--color-stone-700)] hover:border-[var(--color-stone-200)]"
        }
      `}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="!w-3.5 !h-3.5 accent-[var(--color-champagne-500)]"
      />
      {label}
    </label>
  );
}
