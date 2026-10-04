import { Clock } from "lucide-react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ CheckInOutTimes — public "Villa Giriş & Çıkış Saatleri"
   ===============================================================
   PURE PRESENTATIONAL — server component, state/effect YOK.
     - Saat DEĞERLERİ prop olarak gelir: çağıran taraf (VillaDetailBody)
       sağ kolondaki giriş/çıkış kartında ZATEN gösterilen AYNI
       değerleri geçirir — bu component yeni saat değeri ÜRETMEZ.
     - Metinler mevcut dictionary key'lerinden (villa.checkInOutTitle /
       checkInLabel / checkOutLabel) — yeni i18n metni YOK.
     - Minimal görsel dil ("Fiyata dahil olanlar" / "Kurallar" ile
       aynı): kart/arka plan YOK; küçük brand-blue saat ikonu + etiket
       + değer, iki değer yan yana.
   =============================================================== */

type Props = {
  checkIn: string;
  checkOut: string;
  /** Opsiyonel; verilmezse "tr". */
  locale?: Locale;
};

export default function CheckInOutTimes({ checkIn, checkOut, locale }: Props) {
  const dict = getDictionary(locale);
  const items = [
    { key: "in", label: dict.villa.checkInLabel, value: checkIn },
    { key: "out", label: dict.villa.checkOutLabel, value: checkOut },
  ];

  return (
    <section aria-labelledby="checkinout-heading">
      <h2
        id="checkinout-heading"
        className="font-display font-bold text-[20px] md:text-[22px] leading-tight text-[var(--color-stone-900)] tracking-[-0.015em]"
      >
        {dict.villa.checkInOutTitle}
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-4 max-w-md">
        {items.map((it) => (
          <div key={it.key} className="flex items-center gap-2.5 min-w-0">
            <Clock
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="shrink-0 text-[#1B4EF5]"
            />
            <div className="min-w-0 leading-tight">
              <p className="text-[12px] font-medium text-[var(--color-stone-500)] truncate">
                {it.label}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                {it.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
