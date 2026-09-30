import { parseUtcDate } from "@/lib/date-format";

/* ===============================================================
   🛡️ FAZ 2 — formatReservationDate (PURE)
   ===============================================================
   Eski page.tsx içinde inline tanımlı `formatDate` helper'ının
   BYTE-IDENTICAL kopyası.

   parseUtcDate normalize (naive datetime → UTC) + Istanbul tz.
   Hem date-only YYYY-MM-DD hem timestamptz değerleri için safe.

   ⚠️ KESIN KURAL:
     - "-" fallback aynen.
     - `Europe/Istanbul` timeZone aynen.
     - `tr-TR` locale aynen.
=============================================================== */

export function formatReservationDate(date?: string): string {
  if (!date) return "-";
  const d = parseUtcDate(date);
  if (!d) return "-";
  return d.toLocaleDateString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });
}
