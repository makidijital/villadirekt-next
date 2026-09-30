/* ===============================================================
   🛡️ PHASE 1 — detectConfirmTransition (production behavior freeze)
   ===============================================================
   Helper:
     baselineStatus !== "confirmed"
       && requestedStatus === "confirmed"
       && canConfirmReservation(paidAmount)

   canConfirmReservation guard:
     Number.isFinite(Number(paidAmount)) && Number(paidAmount) > 0

   Bu helper saveAll'da transition trigger sayar; testler hem
   transition algılama hem de guard hatlarını (paid_amount > 0)
   freeze ediyor.
=============================================================== */

import { describe, it, expect } from "vitest";
import { detectConfirmTransition } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/detectConfirmTransition";

describe("detectConfirmTransition — positive transition", () => {
  it("returns true when pending→confirmed with paid_amount > 0", () => {
    expect(detectConfirmTransition("pending", "confirmed", 100)).toBe(true);
  });

  it("returns true when rejected→confirmed with paid_amount > 0", () => {
    expect(detectConfirmTransition("rejected", "confirmed", 1)).toBe(true);
  });

  it("returns true when cancelled→confirmed with paid_amount > 0", () => {
    expect(detectConfirmTransition("cancelled", "confirmed", 50000)).toBe(true);
  });

  it("returns true for string paid_amount that parses to > 0", () => {
    // canConfirmReservation Number(unknown) coercion: "100" → 100
    expect(
      detectConfirmTransition(
        "pending",
        "confirmed",
        "100" as unknown as number
      )
    ).toBe(true);
  });
});

describe("detectConfirmTransition — payment guard blocks transition", () => {
  it("returns false when paid_amount = 0", () => {
    expect(detectConfirmTransition("pending", "confirmed", 0)).toBe(false);
  });

  it("returns false when paid_amount is negative", () => {
    expect(detectConfirmTransition("pending", "confirmed", -1)).toBe(false);
  });

  it("returns false when paid_amount is null", () => {
    expect(detectConfirmTransition("pending", "confirmed", null)).toBe(false);
  });

  it("returns false when paid_amount is undefined", () => {
    expect(detectConfirmTransition("pending", "confirmed", undefined)).toBe(
      false
    );
  });

  it("returns false when paid_amount is NaN-yielding string", () => {
    // Number("abc") === NaN → !Number.isFinite → false
    expect(
      detectConfirmTransition(
        "pending",
        "confirmed",
        "abc" as unknown as number
      )
    ).toBe(false);
  });
});

describe("detectConfirmTransition — not a confirm transition", () => {
  it("returns false when already confirmed (no transition)", () => {
    expect(detectConfirmTransition("confirmed", "confirmed", 100)).toBe(false);
  });

  it("returns false when requested status is not 'confirmed'", () => {
    expect(detectConfirmTransition("pending", "pending", 100)).toBe(false);
    expect(detectConfirmTransition("pending", "rejected", 100)).toBe(false);
    expect(detectConfirmTransition("pending", "cancelled", 100)).toBe(false);
  });

  it("returns false for case-mismatched 'CONFIRMED' (strict equality)", () => {
    // detectConfirmTransition KENDISI normalize etmez — caller saveAll'da
    // önce normalizeStatusKey'den geçirilmiş status string'lerini bekler.
    // Bu davranışı freeze ediyoruz; helper sözleşmesi case-sensitive.
    expect(detectConfirmTransition("pending", "CONFIRMED", 100)).toBe(false);
    expect(detectConfirmTransition("CONFIRMED", "confirmed", 100)).toBe(true);
  });
});
