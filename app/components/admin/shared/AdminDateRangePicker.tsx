"use client";

import { X } from "lucide-react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { tr } from "date-fns/locale";

/* Turkish locale — public hero search + FilterSidebar ile aynı pattern.
   Module-level registerLocale idempotent; multiple mount'larda safe. */
registerLocale("tr", tr);

/* ===============================================================
   📅 ADMIN DATE RANGE PICKER — shared admin component
   ===============================================================
   Tek source-of-truth: admin sayfalarında premium date-range UX.
   Tek input popup calendar, range selection, tek satır görünüm.

   KULLANIM ALANLARI:
     - /maki-admin/villa-listesi (curator filter)
     - /maki-admin/activity-logs (log timestamp filter)
     - /maki-admin/external-reservations (iCal date filter)

   PROPS:
     - startDate / endDate / onChange — controlled (Date | null)
     - placeholderText — default "Tarih Aralığı"
     - minDate — opsiyonel; geçmiş tarihler bloklanmak isteniyorsa
     - ariaLabel — a11y için input wrapper aria-label

   STACKING CONTEXT:
     - popperProps.strategy "fixed" → ancestor overflow/transform
       clipping'i atlatır (admin-card, sticky bar, table wrappers)
     - popperClassName z-[60] → admin sticky elemanlardan üstte
   =============================================================== */

export default function AdminDateRangePicker({
  startDate,
  endDate,
  onChange,
  placeholderText = "Tarih Aralığı",
  minDate,
  ariaLabel,
}: {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (range: [Date | null, Date | null]) => void;
  placeholderText?: string;
  minDate?: Date;
  ariaLabel?: string;
}) {
  const hasValue = !!startDate || !!endDate;

  return (
    <div
      aria-label={ariaLabel}
      className="
        rounded-xl border border-[var(--admin-border)]
        bg-white px-3 py-2 flex items-center gap-2
        focus-within:border-[var(--admin-accent,#0ea5e9)]
        transition-colors
      "
    >
      <DatePicker
        selected={startDate}
        onChange={(dates) => {
          const [s, e] = dates as [Date | null, Date | null];
          onChange([s, e]);
        }}
        startDate={startDate}
        endDate={endDate}
        selectsRange
        locale="tr"
        dateFormat="dd.MM.yyyy"
        minDate={minDate}
        placeholderText={placeholderText}
        /* 🛡️ Stacking context fix — popper viewport-relative,
           ancestor clipping yok; z-[60] admin sticky layer'ların üstü. */
        popperProps={{ strategy: "fixed" }}
        popperClassName="!z-[60]"
        className="
          !bg-transparent !border-0 !shadow-none !p-0 !rounded-none
          w-full text-[13.5px] font-medium
          !text-[var(--admin-text)]
          placeholder:!text-[var(--admin-muted-2)]
          cursor-pointer outline-none
        "
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange([null, null])}
          aria-label="Tarihi temizle"
          className="
            shrink-0 w-6 h-6 rounded-full flex items-center justify-center
            text-[var(--admin-muted-2)]
            hover:bg-[var(--admin-bg-soft)] hover:text-[var(--admin-text)]
            transition-colors
          "
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
