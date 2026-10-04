"use client";

/* ===============================================================
   🛡️ VillaAvailabilityModal — "Müsaitlik" butonu + takvim popup'ı
   ===============================================================
   Villa detay sayfasında takvim artık sayfada SÜREKLİ AÇIK değil:
   fiyat listesinin hemen altındaki "Müsaitlik" butonuna basılınca MEVCUT
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
      {/* Yavaş, zarif dikkat-çekme pulse'u (~2.6s): hafif parlaklık +
          çok hafif shadow değişimi; gradient/agresif glow YOK.
          prefers-reduced-motion → animasyon KAPALI. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .vd-avail-pulse { animation: vd-avail-pulse 2.6s ease-in-out infinite; }
        }
        @keyframes vd-avail-pulse {
          0%, 100% {
            filter: brightness(1);
            box-shadow: 0 4px 12px -8px rgba(231, 0, 11, 0.45);
          }
          50% {
            filter: brightness(1.1);
            box-shadow: 0 6px 16px -8px rgba(231, 0, 11, 0.6);
          }
        }
      `}</style>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="
          vd-avail-pulse
          flex w-full h-[49px] items-center justify-center gap-2 px-4
          rounded-[16px] bg-[#E7000B] text-white
          text-[14px] font-semibold
          shadow-[0_4px_12px_-8px_rgba(231,0,11,0.45)]
          transition-colors duration-200 motion-reduce:transition-none
          hover:bg-[#C8000A]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E7000B]/40 focus-visible:ring-offset-2
        "
      >
        <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className="leading-none">{dict.villaTabs.availability}</span>
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

          <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-[#FFFFFF] shadow-2xl">
            <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 bg-[#FFFFFF] border-b border-[var(--color-stone-100)]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center text-brand">
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
                  hover:text-[var(--color-stone-900)]
                  transition-colors motion-reduce:transition-none
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                "
              >
                <X size={16} />
              </button>
            </div>

            {/* Takvimin kendisi — MEVCUT component, prop'lar AYNEN. */}
            <div className="overflow-y-auto bg-[#FFFFFF] px-3 py-4 sm:px-5 sm:py-5">
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
