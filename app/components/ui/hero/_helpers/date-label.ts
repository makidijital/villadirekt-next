/* ===============================================================
   🛡️ FAZ 2 — buildHeroDateLabel (PURE)
   ===============================================================
   Eski Hero.tsx içinde inline `dateLabel` ternary chain'in
   BYTE-IDENTICAL kopyası. DatePicker custom `value` prop'una
   verilen TR-locale label.

   ⚠️ KESIN KURAL:
     - `tr-TR` locale aynen.
     - `day: "numeric", month: "short"` format aynen.
     - " – " (en-dash + boşluklar) aynen.
     - Sentinel "Tarih seç" aynen (Search Panel'de
       `value === "Tarih seç" ? "" : ...` kontrolü için).
   =============================================================== */

import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  type Locale,
} from "@/lib/i18n/config";

export function buildHeroDateLabel(
  startDate: Date | null,
  endDate: Date | null,
  /* 🛡️ PHASE 11 — opsiyonel; verilmezse "tr" → çıktı BİT-BİRE ESKİSİ
     GİBİ. Yalnız `Intl` etiketi değişir (LOCALE_BCP47, Phase 10B);
     format seçenekleri, " – " ayıracı ve sentinel AYNEN korunur. */
  locale: Locale = DEFAULT_LOCALE
): string {
  const tag = LOCALE_BCP47[locale];
  return startDate && endDate
    ? `${startDate.toLocaleDateString(tag, {
        day: "numeric",
        month: "short",
      })} – ${endDate.toLocaleDateString(tag, {
        day: "numeric",
        month: "short",
      })}`
    : startDate
    ? startDate.toLocaleDateString(tag, {
        day: "numeric",
        month: "short",
      })
    : "Tarih seç";
}
