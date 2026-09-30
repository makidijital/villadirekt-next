import { forwardRef, type ReactNode } from "react";
import { Calendar, ChevronDown } from "lucide-react";

import Section from "@/app/components/admin/villa-form/shared/Section";

/* ===============================================================
   🔥 DateStep — Wizard Adım 4.
   Tarih aralığı trigger'ı + DayPicker dropdown slot'u.
   Pure presentational; click-outside detection için containerRef
   forwardRef ile parent'tan alınır (page'in mevcut useRef + useEffect
   ikilisi aynen korunur).

   - triggerLabel: "1 Tem 2026 → 8 Tem 2026" gibi (yoksa "Tarih seç")
   - onTriggerClick: page handler — villa kontrolü, currentMonth set,
     freshSelection set, openCalendar set burada
   - calendarSlot: page tarafında openCalendar?true ise <DayPicker .../>
     wrapped in absolute container; aksi halde null/false
   - errorText: errors.start_date || errors.end_date
   - openCalendar: chevron rotate için
   =============================================================== */

type DateStepProps = {
  triggerLabel: string | null;
  onTriggerClick: () => void;
  openCalendar: boolean;
  errorText?: string;
  calendarSlot: ReactNode;
};

const DateStep = forwardRef<HTMLDivElement, DateStepProps>(
  function DateStep(
    { triggerLabel, onTriggerClick, openCalendar, errorText, calendarSlot },
    ref
  ) {
    return (
      <Section
        eyebrow="Adım 4"
        title="Tarih aralığı"
        subtitle="Giriş ve çıkış günleri"
      >
        <div ref={ref} className="relative">
          <div
            onClick={onTriggerClick}
            className="border border-[var(--color-stone-100)] rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-[var(--color-champagne-500)] transition bg-white"
          >
            <Calendar
              size={16}
              className="text-[var(--color-champagne-500)]"
            />
            <span className="text-sm text-[var(--color-stone-800)] flex-1">
              {triggerLabel ?? "Tarih seç"}
            </span>
            <ChevronDown
              size={14}
              className={`text-[var(--color-stone-400)] transition ${
                openCalendar ? "rotate-180" : ""
              }`}
            />
          </div>

          {calendarSlot}
        </div>
        {errorText && (
          <p className="text-xs text-red-500 mt-2">{errorText}</p>
        )}
      </Section>
    );
  }
);

export default DateStep;
