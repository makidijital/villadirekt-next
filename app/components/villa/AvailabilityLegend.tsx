import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ AvailabilityLegend — "Onaylı / Beklemede / Müsait" legend'ı
   ===============================================================
   BookingCalendar'ın FAZ 12 minimal legend'ının BİREBİR aynı markup /
   stil / metinleri (dictionary: availability.legend*), ortak component
   olarak çıkarıldı.

   Kullanım:
     - VillaAvailabilityModal (villa detay "Müsaitlik" popup — read-only
       takvim) → GÖSTERİLİR.
     - BookingCalendar → `showLegend` (varsayılan true); public
       rezervasyon datepicker'ları (BookingSidebar, VillaCardBookingModal)
       `showLegend={false}` geçer → GÖSTERİLMEZ.
   =============================================================== */

export default function AvailabilityLegend({ locale }: { locale?: Locale }) {
  const dict = getDictionary(locale);
  return (
    <div className="mt-4 flex items-center justify-center gap-4 text-[10px] tracking-[0.04em] text-[var(--color-stone-400)]">
      <span
        className="inline-flex items-center gap-1.5"
        title={dict.availability.legendConfirmedTitle}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "rgba(239,68,68,0.55)" }}
          aria-hidden
        />
        {dict.availability.legendConfirmed}
      </span>
      <span
        className="inline-flex items-center gap-1.5"
        title={dict.availability.legendPendingTitle}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "#facc15" }}
          aria-hidden
        />
        {dict.availability.legendPending}
      </span>
      <span
        className="inline-flex items-center gap-1.5"
        title={dict.availability.legendAvailableTitle}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full border border-[var(--color-stone-300)] bg-white"
          aria-hidden
        />
        {dict.availability.legendAvailable}
      </span>
    </div>
  );
}
