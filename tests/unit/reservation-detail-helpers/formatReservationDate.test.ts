import { describe, it, expect } from "vitest";

import { formatReservationDate } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/formatReservationDate";

describe("formatReservationDate", () => {
  it("returns '-' for empty/undefined", () => {
    expect(formatReservationDate()).toBe("-");
    expect(formatReservationDate("")).toBe("-");
  });

  it("returns '-' for unparseable string", () => {
    expect(formatReservationDate("not-a-date")).toBe("-");
  });

  it("formats YYYY-MM-DD in tr-TR locale (Europe/Istanbul)", () => {
    const out = formatReservationDate("2026-06-01");
    /* tr-TR locale d.m.yyyy or dd.mm.yyyy formats accepted. */
    expect(out).toMatch(/^\d{1,2}\.\d{1,2}\.2026$/);
  });

  it("formats timestamptz", () => {
    const out = formatReservationDate("2026-06-15T10:00:00Z");
    expect(out).toMatch(/2026/);
  });
});
