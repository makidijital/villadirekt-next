/* ===============================================================
   🛡️ PREPAYMENT CAMPAIGN BADGE — villa galeri köşe overlay (UI-only)
   ===============================================================
   Villa detay galerisinin sol-üst köşesinde dinamik ön ödeme kampanya
   rozeti. SALT SUNUM: oran (`rate`) parent'tan gelir; ödeme/rezervasyon
   hesabına DOKUNMAZ. Oran kaynağı (caller):
     villa.custom_prepayment_rate ?? settings.prepayment_rate ?? 20

   GÖRÜNÜRLÜK KURALI:
     - 0 < rate < 100  → göster
     - rate <= 0       → null (anlamsız / "%0 şimdi")
     - rate >= 100     → null (tatilde kalan yok → kampanya yok)

   YERLEŞİM/GÜVENLİK:
     - absolute + pointer-events-none → tile tıklaması (lightbox açma),
       favori, "+X Fotoğraf" overlay'i bloklanmaz.
     - z-20 → grid tile'ları (z-auto) üstünde, lightbox (z-50) ALTINDA.

   TASARIM (sıcak/amber premium):
     - İç gövde: koyu turuncu → amber warm gradient, beyaz tipografi.
     - Dış çerçeve: DÖNEN konik-gradient (turuncu → altın → açık turuncu)
       → ışık border boyunca dolaşır ("premium luxury offer" hissi).
       overflow-hidden + p-[1.5px] ile yalnız ince kenar ışık gösterir.
     - Yumuşak amber glow (blur box-shadow) eşlik eder.

   ANİMASYON:
     - Border ışığı: Tailwind `animate-spin` [~3s linear] → sadece dış
       çerçeve döner, İÇERİK SABİT (titreşim/layout shift yok).
     - Glow: `animate-pulse` [~2.8s] opacity-only.
     - `motion-reduce:animate-none` → prefers-reduced-motion'da durur
       (statik amber ring korunur). Yeni package/globals YOK.

   Server component (client JS gerektirmez).
   =============================================================== */

export default function PrepaymentBadge({ rate }: { rate: number }) {
  /* Görünürlük guard'ı: yalnız anlamlı kısmi ön ödeme oranında göster. */
  if (!(rate > 0 && rate < 100)) return null;

  const pct = Math.round(rate);

  return (
    <div className="pointer-events-none absolute top-3 left-3 md:top-4 md:left-4 z-20 select-none">
      <div className="relative">
        {/* Yumuşak amber glow — blur'lu alt katman, opacity pulse. */}
        <div
          aria-hidden="true"
          className="absolute -inset-1.5 rounded-[1.25rem] bg-accent/45 blur-lg opacity-70 animate-pulse [animation-duration:2.8s] motion-reduce:animate-none"
        />

        {/* DÖNEN IŞIKLI BORDER — konik-gradient wrapper. overflow-hidden +
            p-[1.5px] ile yalnız ince kenar ışığı görünür; iç gövde üstte. */}
        <div className="relative overflow-hidden rounded-2xl p-[1.5px] shadow-[0_12px_26px_-12px_color-mix(in_srgb,var(--color-brand)_55%,transparent)]">
          {/* Dönen konik ışık (turuncu → altın → açık turuncu). */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-[230%] w-[230%] -translate-x-1/2 -translate-y-1/2 bg-brand animate-spin [animation-duration:3s] motion-reduce:animate-none"
          />

          {/* İÇ GÖVDE — koyu sıcak turuncu → amber gradient. */}
          <div className="relative overflow-hidden rounded-[14px] bg-accent px-3 py-1.5 text-[var(--color-stone-900)]">
            {/* Üst iç highlight — cam/premium his. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-white/10 "
            />
            <p className="relative text-[12px] md:text-[13px] font-bold leading-tight tracking-tight">
              %{pct} şimdi
            </p>
            <p className="relative text-[9.5px] md:text-[10px] font-medium leading-tight text-[var(--color-stone-900)]/80 whitespace-nowrap">
              kalanını tatilde ödeme fırsatı!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
