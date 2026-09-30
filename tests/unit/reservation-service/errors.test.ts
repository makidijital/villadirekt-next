import { describe, it, expect } from "vitest";

import { mapInsertError } from "@/app/services/reservation/_helpers/errors";

/* ===============================================================
   🛡️ FAZ 5 — mapInsertError UNIT TESTS
   ===============================================================
   Pure SQLSTATE mapping. EXCLUDE constraint violation (23P01) →
   TR "Bu tarihler artık müsait değil"; diğer durumlar return.
=============================================================== */

describe("mapInsertError", () => {
  it("throws TR message for SQLSTATE 23P01", () => {
    expect(() => mapInsertError({ code: "23P01" })).toThrow(
      "Bu tarihler artık müsait değil"
    );
  });

  it("throws TR message for reservations_no_overlap in message", () => {
    expect(() =>
      mapInsertError({
        code: "OTHER",
        message: "conflict with reservations_no_overlap",
      })
    ).toThrow("Bu tarihler artık müsait değil");
  });

  it("regex is case-insensitive", () => {
    expect(() =>
      mapInsertError({ message: "Reservations_No_Overlap violation" })
    ).toThrow("Bu tarihler artık müsait değil");
  });

  it("does NOT throw for unknown SQLSTATE", () => {
    expect(() => mapInsertError({ code: "12345", message: "other" })).not.toThrow();
  });

  it("does NOT throw when both code/message missing", () => {
    expect(() => mapInsertError({})).not.toThrow();
  });

  it("does NOT throw when message is empty string", () => {
    expect(() => mapInsertError({ message: "" })).not.toThrow();
  });

  it("does NOT throw when message is undefined", () => {
    expect(() => mapInsertError({ code: "abc" })).not.toThrow();
  });
});
