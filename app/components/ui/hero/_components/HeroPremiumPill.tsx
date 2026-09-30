import { Sparkles } from "lucide-react";

/* ===============================================================
   🛡️ FAZ 3 — HeroPremiumPill (PURE PRESENTATIONAL)
   ===============================================================
   Eski Hero.tsx > image card içindeki "Premium koleksiyon" pill'in
   (L569-585) BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL:
     - "hidden lg:flex" responsive (desktop only) aynen.
     - "absolute -top-4 -left-4" konum aynen.
     - aria-hidden korunur.
   =============================================================== */

export default function HeroPremiumPill() {
  return (
    <div
      className="
        hidden lg:flex
        absolute -top-4 -left-4
        items-center gap-2
        rounded-full
        bg-[var(--brand-coral)]
        text-white
        px-3.5 py-1.5
        text-[10px] tracking-[0.24em] uppercase font-medium
        shadow-[0_14px_28px_-10px_rgba(255,101,63,0.55)]
      "
      aria-hidden
    >
      <Sparkles size={11} />
      Premium koleksiyon
    </div>
  );
}
