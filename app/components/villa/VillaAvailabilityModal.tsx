"use client";

/* ===============================================================
   🛡️ VillaAvailabilityModal — "Müsaitlik" butonu + takvim popup'ı
   ===============================================================
   Villa detay sayfasında takvim artık sayfada SÜREKLİ AÇIK değil:
   fiyatların üstündeki "Müsaitlik" butonuna basılınca MEVCUT
   `AvailabilityInlineCalendar` bu modal içinde açılır.

   Takvim component'i AYNEN yeniden kullanılır (prop'lar birebir
   geçirilir) — müsaitlik fetch'i, `getDayStyle` renk kontratı,
   günlük fiyat/indirim gösterimi ve read-only davranış DEĞİŞMEDİ;
   yalnız gösterildiği container değişti.

   Modal deseni VillaMapModal / VillaVideoModal ile AYNI: ESC → close,
   backdrop click → close, body scroll lock, role="dialog" aria-modal.
   Metinler mevcut dictionary key'lerinden (yeni i18n metni YOK):
   buton = villaTabs.availability, başlık = villa.calendarTitle,
   kapat = common.close.
   =============================================================== */

import { useEffect, useState, type ComponentProps } from "react";
import { CalendarDays, X } from "lucide-react";

import AvailabilityInlineCalendar from "@/app/components/villa/AvailabilityInlineCalendar";
import { getDictionary } from "@/lib/i18n/get-dictionary";

type Props = ComponentProps<typeof AvailabilityInlineCalendar>;

export default function VillaAvailabilityModal(props: Props) {
  const dict = getDictionary(props.locale);
  const [isOpen, setIsOpen] = useState(false);

  /* === ESC tuşu → close === */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  /* === Body scroll lock === */
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="
          flex w-full h-[50px] items-center gap-2.5 px-4
          rounded-[12px] bg-[#1B4EF5] text-white
          text-[14px] font-semibold
          shadow-[0_4px_12px_-8px_rgba(27,78,245,0.55)]
          transition-colors duration-200 motion-reduce:transition-none
          hover:bg-[#1640CC]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4EF5]/40 focus-visible:ring-offset-2
        "
      >
        <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
        {dict.villaTabs.availability}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={dict.villaTabs.availability}
          className="fade-in fixed inset-0 z-[1100] flex items-center justify-center p-3 sm:p-4"
        >
          {/* Backdrop — click → close */}
          <div
            aria-hidden
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/50"
          />

          <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-[var(--color-stone-100)]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <CalendarDays size={15} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h2 className="flex-1 min-w-0 font-display font-bold text-[17px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
                {dict.villa.calendarTitle}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={dict.common.close}
                className="
                  shrink-0 w-8 h-8 rounded-full
                  flex items-center justify-center
                  text-[var(--color-stone-500)]
                  hover:bg-[var(--color-stone-100)] hover:text-[var(--color-stone-900)]
                  transition-colors motion-reduce:transition-none
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                "
              >
                <X size={16} />
              </button>
            </div>

            {/* Takvimin kendisi — MEVCUT component, prop'lar AYNEN. */}
            <div className="overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
              <div className="overflow-x-auto">
                <AvailabilityInlineCalendar {...props} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
