/* ===============================================================
   🛡️ FAZ 51 — DATE RANGE HELPER TESTS
   ===============================================================
   Hedef: lib/date-range.ts > getValidEndDate
   Reservation create + edit UI'larında ortak kullanılan guard.
=============================================================== */

import { describe, it, expect } from "vitest";
import { getValidEndDate } from "@/lib/date-range";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("getValidEndDate", () => {
  it("returns the requested end when no day is blocked", () => {
    const start = at(2026, 6, 1);
    const end = at(2026, 6, 10);
    const result = getValidEndDate(start, end, []);
    expect(result.toDateString()).toBe(end.toDateString());
  });

  it("truncates the range to the day BEFORE the first blocked day", () => {
    const start = at(2026, 6, 1);
    const end = at(2026, 6, 10);
    const blocked = [at(2026, 6, 5)];
    const result = getValidEndDate(start, end, blocked);
    expect(result.toDateString()).toBe(at(2026, 6, 4).toDateString());
  });

  it("returns earliest blocked-1 when multiple blocks exist", () => {
    const start = at(2026, 6, 1);
    const end = at(2026, 6, 30);
    const blocked = [at(2026, 6, 20), at(2026, 6, 7), at(2026, 6, 14)];
    const result = getValidEndDate(start, end, blocked);
    expect(result.toDateString()).toBe(at(2026, 6, 6).toDateString());
  });

  it("returns start-day - 1 if the very first day is blocked", () => {
    /* Edge: caller normalde bu durumu üst katmanda filtreler; helper
       defansif olarak prev(start) döner — mevcut davranış. */
    const start = at(2026, 6, 1);
    const end = at(2026, 6, 10);
    const blocked = [at(2026, 6, 1)];
    const result = getValidEndDate(start, end, blocked);
    expect(result.toDateString()).toBe(at(2026, 5, 31).toDateString());
  });

  it("ignores blocked days outside the [start..end] sweep", () => {
    const start = at(2026, 6, 1);
    const end = at(2026, 6, 5);
    const blocked = [at(2026, 8, 1)]; // çok ileride
    const result = getValidEndDate(start, end, blocked);
    expect(result.toDateString()).toBe(end.toDateString());
  });
});
