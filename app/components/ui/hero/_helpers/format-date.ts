/* ===============================================================
   🛡️ FAZ 2 — formatHeroDate (PURE)
   ===============================================================
   Eski Hero.tsx içinde inline tanımlı `formatDate` helper'ı
   BYTE-IDENTICAL bu dosyaya alındı. `Date` → `"YYYY-MM-DD"`
   ISO date-only string (URL canonical param için).

   ⚠️ KESIN KURAL:
     - padStart(2, "0") aynen.
     - getMonth() + 1 aynen.
     - getFullYear() / getDate() local TZ semantic'i aynen.
   =============================================================== */

export function formatHeroDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
