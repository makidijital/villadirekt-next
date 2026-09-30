import { TRUST_TONE_CLASSES, type TrustTone } from "../_types/hero";

/* ===============================================================
   🛡️ FAZ 3 — TrustItem (extracted from Hero.tsx)
   ===============================================================
   Eski Hero.tsx içinde local function olarak tanımlı TrustItem'in
   BYTE-IDENTICAL kopyası (L984-1034). TRUST_TONE_CLASSES record'u
   `_types/hero.ts`'e taşındı; oradan import.

   ⚠️ KESIN KURAL:
     - Class concat string'leri (`"..." + t.surface + " " + t.hoverShadow`)
       AYNEN.
     - Tüm tone class'ları (surface, iconBox, iconText, hoverShadow)
       AYNEN korundu.
     - aria-hidden konumu aynen.
   =============================================================== */

export default function TrustItem({
  tone,
  icon,
  title,
  description,
}: {
  tone: TrustTone;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const t = TRUST_TONE_CLASSES[tone];
  return (
    <li
      className={
        "group rounded-[28px] border " +
        "px-5 py-5 md:px-6 md:py-6 " +
        "shadow-[0_12px_28px_-20px_rgba(27,26,23,0.10)] " +
        "transition-[transform,box-shadow,border-color] duration-300 " +
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0 " +
        "hover:-translate-y-[2px] " +
        t.surface +
        " " +
        t.hoverShadow
      }
    >
      <div className="flex items-start gap-4">
        <span
          className={
            "shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-full " +
            "flex items-center justify-center " +
            t.iconBox +
            " " +
            t.iconText
          }
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-[14.5px] font-medium text-[var(--color-stone-900)] tracking-[-0.005em] leading-tight">
            {title}
          </p>
          <p className="text-[13px] text-[var(--color-stone-600)] mt-1.5 leading-[1.6]">
            {description}
          </p>
        </div>
      </div>
    </li>
  );
}
