/* ===============================================================
   🛡️ FAZ 3 — HeroAmbientGlow (PURE PRESENTATIONAL)
   ===============================================================
   Eski Hero.tsx içindeki 3 dekoratif background div'inin BYTE-IDENTICAL
   karşılığı (L217-249):
     - Coral atmospheric tint (top-right)
     - Sand atmospheric tint (left-center)
     - Fine grain noise overlay (magazine paper feel)

   ⚠️ KESIN KURAL: Class string'leri + inline style'ları + position
   class'ları AYNEN korundu. Hiçbir className birleştirilmedi.
   Pixel-level same output.
=============================================================== */

export default function HeroAmbientGlow() {
  return (
    <>
      {/* AMBIENT GLOW STACK — coral + sand atmospheric tint */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute -top-40 -right-32
          w-[520px] h-[520px] rounded-full blur-3xl opacity-60
        "
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,101,63,0.14), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute top-1/3 -left-32
          w-[460px] h-[460px] rounded-full blur-3xl opacity-70
        "
        style={{
          background:
            "radial-gradient(circle at center, rgba(245,238,223,0.85), transparent 70%)",
        }}
      />
      {/* Fine grain noise — premium magazine paper feel; pure
         decoration, picked up via CSS layered gradient (sıfır asset). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.018] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(rgba(0,0,0,1) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
    </>
  );
}
