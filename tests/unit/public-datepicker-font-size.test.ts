/* ===============================================================
   🔤 Public rezervasyon datepicker'ları — gün rakamı 10px
   ===============================================================
   - react-day-picker: BookingCalendar (villa detay sidebar +
     VillaCardBookingModal) → DayContent inline fontSize 10.
   - react-datepicker: Hero / arama filtresi / teklif-al → globals.css
     public-scoped (:not(:has(.admin-shell))) kuralı; admin'e sızmaz.
   =============================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("public datepicker gün rakamı font-size 10px", () => {
  it("BookingCalendar gün hücresi fontSize 10 (eski 13 yok)", () => {
    const src = read("app/components/villa/booking/BookingCalendar.tsx");
    expect(src).toMatch(/fontSize: 10,\s*\n\s*lineHeight: 1,/);
    expect(src).not.toMatch(/fontSize: 13,/);
    /* Hücre ölçüleri AYNEN. */
    expect(src).toMatch(/width: 40,\s*\n\s*height: 40,/);
  });

  it("BookingCalendar gün hücresi: çok hafif 1px #E5E7EB çerçeve (inset, ölçü/radius AYNEN)", () => {
    const src = read("app/components/villa/booking/BookingCalendar.tsx");
    expect(src).toContain('boxShadow: "inset 0 0 0 1px #E5E7EB"');
    expect(src).toMatch(/borderRadius: 6,/);
    expect(src).toMatch(/width: 40,\s*\n\s*height: 40,\s*\n\s*minWidth: 40,/);
  });

  it("react-datepicker gün rakamı yalnız public scope'ta 10px", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(
      /:where\(:root:not\(:has\(\.admin-shell\)\)\) \.react-datepicker__day \{\s*font-size: 10px !important;\s*\}/
    );
    /* Unscoped (admin'i de etkileyecek) bir __day font-size kuralı YOK. */
    expect(css).not.toMatch(/^\.react-datepicker__day \{[^}]*font-size/m);
  });
});
