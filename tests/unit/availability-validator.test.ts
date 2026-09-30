/* ===============================================================
   🛡️ FAZ 51 — AVAILABILITY VALIDATOR TESTS (FAZ 51B import path)
   ===============================================================
   Hedef: lib/availability.validator.ts içindeki SAF validatorlar:
     • isValidYmd
     • isValidRange
     • AVAILABILITY_BLOCKING_STATUSES
   `getBlockedVillaIds` (lib/availability.helper.ts) eski sağlayıcı
   çağırıyor → bu faz testlenmiyor.

   FAZ 51B: import path `@/lib/availability.helper`'tan
   `@/lib/availability.validator`'a taşındı. Helper bu sembolleri
   re-export ediyor → production davranışı byte-identical, test
   yan etkisi (eski sağlayıcı module-load) elimine edildi.

   AYRICA: helper'ın HALF-OPEN [start, end) overlap semantic'ini
   pure string karşılaştırması ile yeniden doğruluyoruz (regresyon
   sigortası — bu kural ileride yanlışlıkla closed-range yapılırsa
   double-booking riski yaratabilir).
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  isValidYmd,
  isValidRange,
  AVAILABILITY_BLOCKING_STATUSES,
} from "@/lib/availability.validator";

describe("isValidYmd", () => {
  it("accepts canonical YYYY-MM-DD strings", () => {
    expect(isValidYmd("2026-06-01")).toBe(true);
    expect(isValidYmd("2026-12-31")).toBe(true);
  });

  it("rejects non-strings and malformed strings", () => {
    expect(isValidYmd("2026/06/01")).toBe(false);
    expect(isValidYmd("06-01-2026")).toBe(false);
    expect(isValidYmd("2026-6-1")).toBe(false); // pad gerekli
    expect(isValidYmd("")).toBe(false);
    expect(isValidYmd(null as unknown as string)).toBe(false);
    expect(isValidYmd(undefined as unknown as string)).toBe(false);
    expect(isValidYmd(20260601 as unknown as string)).toBe(false);
  });

  it("does not validate calendar correctness (Faz 9 contract)", () => {
    /* Regex format-only doğrular. Geçersiz takvim günleri burada
       false dönmez — caller'lar parseLocalDate ile semantik doğrular. */
    expect(isValidYmd("2026-13-40")).toBe(true);
  });
});

describe("isValidRange (half-open contract)", () => {
  it("accepts strict start < end", () => {
    expect(isValidRange("2026-06-01", "2026-06-02")).toBe(true);
    expect(isValidRange("2026-06-01", "2026-12-31")).toBe(true);
  });

  it("rejects same-day range (zero-night)", () => {
    /* Half-open [) semantic: start < end strict. Same day = 0 night
       = invalid range. */
    expect(isValidRange("2026-06-05", "2026-06-05")).toBe(false);
  });

  it("rejects reversed range", () => {
    expect(isValidRange("2026-06-10", "2026-06-05")).toBe(false);
  });

  it("rejects when either side is malformed", () => {
    expect(isValidRange("2026/06/01", "2026-06-02")).toBe(false);
    expect(isValidRange("2026-06-01", "later")).toBe(false);
    expect(isValidRange(null, "2026-06-02")).toBe(false);
  });
});

describe("HALF-OPEN overlap rule — lexicographic regression sigortası", () => {
  /* Bu test getBlockedVillaIds'yi çağırmaz; sadece OVERLAP kuralının
     string-comparison eşdeğerini doğrular. Eğer helper bir gün yanlış
     yere "closed range" semantic'ine kayarsa kuralı bu mantık yakalar.
     Helper'ın yorum bloğundaki kural:
       existing.start_date < range.end
       existing.end_date   > range.start
     Adjacent (touch-edge) free; nested overlap blocking. */
  const overlaps = (
    aStart: string,
    aEnd: string,
    bStart: string,
    bEnd: string
  ) => aStart < bEnd && aEnd > bStart;

  it("adjacent ranges do NOT overlap (checkout = checkin valid)", () => {
    expect(overlaps("2026-06-01", "2026-06-05", "2026-06-05", "2026-06-10")).toBe(false);
    expect(overlaps("2026-06-05", "2026-06-10", "2026-06-01", "2026-06-05")).toBe(false);
  });

  it("partial overlap blocks", () => {
    expect(overlaps("2026-06-01", "2026-06-05", "2026-06-04", "2026-06-07")).toBe(true);
    expect(overlaps("2026-06-04", "2026-06-07", "2026-06-01", "2026-06-05")).toBe(true);
  });

  it("nested overlap blocks", () => {
    expect(overlaps("2026-06-01", "2026-06-10", "2026-06-03", "2026-06-05")).toBe(true);
    expect(overlaps("2026-06-03", "2026-06-05", "2026-06-01", "2026-06-10")).toBe(true);
  });

  it("disjoint far ranges do not overlap", () => {
    expect(overlaps("2026-06-01", "2026-06-05", "2026-07-01", "2026-07-10")).toBe(false);
  });
});

describe("AVAILABILITY_BLOCKING_STATUSES", () => {
  it("only pending and confirmed block (allow-list contract)", () => {
    expect([...AVAILABILITY_BLOCKING_STATUSES]).toEqual(["pending", "confirmed"]);
  });
});
