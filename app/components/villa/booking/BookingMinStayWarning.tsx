"use client";

/* ===============================================================
   🛡️ BookingMinStayWarning — minimum konaklama uyarı kartı
   ===============================================================
   PURE UI: BookingSidebar'daki "MINIMUM STAY WARNING CARD"
   bloğunun birebir karşılığı.

   Görünüm koşulu (caller karar verir):
     threshold>0 + BOTH dates selected + nights<threshold

   Bu component sadece koşulun true olduğu durumda mount edilir
   (sidebar'da olduğu gibi). İçeride ek conditional yok.
   =============================================================== */

import { CalendarDays } from "lucide-react";
/* 🛡️ PHASE 10B — locale-aware UI stringleri. `locale` opsiyonel,
   default "tr" — mevcut TR call-site'ı (BookingSidebar) hiç
   değişmeden byte-identical render eder. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

type Props = {
  minStayThreshold: number;
  selectedNights: number;
  /* 🛡️ PHASE 10B — opsiyonel, default "tr". */
  locale?: Locale;
};

export default function BookingMinStayWarning({
  minStayThreshold,
  selectedNights,
  locale,
}: Props) {
  const dict = getDictionary(locale);
  /* `minStayWarningBody` template'i "{n}" token'ı çevresinde bölünür
     ki sayı eskisi gibi ayrı, kalın (font-semibold) bir <span> içinde
     kalsın (yalnızca dictionary text kaynağı değişti, DOM/stil AYNI). */
  const [bodyBefore, bodyAfter] = dict.booking.minStayWarningBody.split(
    "{n}"
  );
  return (
    <div
      role="alert"
      aria-live="polite"
      className="
        fade-in
        rounded-2xl border border-[var(--color-champagne-200)]
        bg-[var(--color-champagne-50)] px-4 py-3.5
        flex items-start gap-3
      "
    >
      <span
        className="
          w-9 h-9 shrink-0 rounded-xl
          bg-white border border-[var(--color-champagne-200)]
          flex items-center justify-center
          text-[var(--color-champagne-700)]
        "
        aria-hidden
      >
        <CalendarDays size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-champagne-700)]">
          {dict.booking.minStayWarningTitle}
        </p>
        <p className="text-[13.5px] text-[var(--color-stone-800)] mt-1 leading-snug">
          {bodyBefore}
          <span className="font-semibold tabular-nums">
            {minStayThreshold}
          </span>
          {bodyAfter}
        </p>
        <p className="text-[11.5px] text-[var(--color-stone-500)] mt-1 tabular-nums">
          {formatDictionaryString(dict.booking.minStayWarningSelected, {
            n: selectedNights,
          })}
        </p>
      </div>
    </div>
  );
}
