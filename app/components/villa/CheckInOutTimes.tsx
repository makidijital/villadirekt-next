import { Clock, Info } from "lucide-react";

/* ===============================================================
   🛡️ CheckInOutTimes — public "Villa Giriş & Çıkış Saatleri"
   ===============================================================
   PURE PRESENTATIONAL — STATİK (admin/DB YOK).
     - Server component; hiçbir prop / state / effect yok.
     - Değerler HARDCODED (giriş 16:00 · çıkış 10:00).
     - Detay design dili: card-premium warm gradient + champagne/
       coral accent + stone metin; cam efekti (backdrop-blur + yarı
       saydam yüzey). Dark mode projede kullanılmıyor → varyant yok.
     - Konaklama Düzeni (AccommodationLayout) bölümünün HEMEN üstünde
       render edilir; space-y container'ında tek kardeş.
   =============================================================== */

export default function CheckInOutTimes() {
  return (
    <section aria-labelledby="checkinout-heading">
      <div
        className="
          relative overflow-hidden rounded-2xl
          border border-[var(--color-champagne-200)]
          bg-gradient-to-b from-white/85 to-[var(--color-sand-50)]/75
          backdrop-blur-sm
          shadow-[0_16px_40px_-24px_rgba(27,26,23,0.28)]
          p-6 md:p-8
        "
      >
        {/* Yumuşak coral ambient glow — dekoratif */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 h-44 w-44 rounded-full bg-[var(--brand-coral)]/10 blur-3xl"
        />

        <h2
          id="checkinout-heading"
          className="relative font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em] mb-5"
        >
          Villa Giriş &amp; Çıkış Saatleri
        </h2>

        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3.5 md:gap-4">
          {/* GİRİŞ */}
          <div className="flex items-center gap-4 rounded-2xl border border-[var(--color-stone-100)] bg-white/70 backdrop-blur-sm p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-sand-100)] text-[var(--brand-coral)]">
              <Clock size={22} strokeWidth={1.75} />
            </span>
            <div className="flex flex-col">
              <span className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-400)]">
                Giriş Saati
              </span>
              <span className="font-display text-3xl md:text-[2rem] leading-tight text-[var(--color-stone-900)] tabular-nums">
                16:00
              </span>
            </div>
          </div>

          {/* ÇIKIŞ */}
          <div className="flex items-center gap-4 rounded-2xl border border-[var(--color-stone-100)] bg-white/70 backdrop-blur-sm p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-sand-100)] text-[var(--brand-coral)]">
              <Clock size={22} strokeWidth={1.75} />
            </span>
            <div className="flex flex-col">
              <span className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-400)]">
                Çıkış Saati
              </span>
              <span className="font-display text-3xl md:text-[2rem] leading-tight text-[var(--color-stone-900)] tabular-nums">
                10:00
              </span>
            </div>
          </div>
        </div>

        {/* Bilgi satırı — daha küçük font + info ikonu */}
        <p className="relative mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-[var(--color-stone-500)]">
          <Info
            size={15}
            className="mt-0.5 shrink-0 text-[var(--color-champagne-600)]"
          />
          <span>
            Erken giriş ve geç çıkış talepleri müsaitlik durumuna göre
            değerlendirilmektedir.
          </span>
        </p>
      </div>
    </section>
  );
}
