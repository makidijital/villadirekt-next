import { describe, it, expect } from "vitest";
import {
  applyLicenseCheck,
  licenseTransitionMessage,
  type LicenseCheckResult,
  type LicenseStateRow,
} from "@/lib/ktb/license-state";

const T = (n: number) => `2026-10-0${n}T10:00:00.000Z`;
function run(results: LicenseCheckResult[], doc = "07-6195") {
  let state: LicenseStateRow | null = null;
  const prevs: Array<string | null> = [];
  results.forEach((r, i) => {
    const out = applyLicenseCheck(state, {
      villaId: "v1", documentNumber: doc, result: r,
      reasonCode: r === "CHECK_FAILED" ? "timeout" : null, checkId: `c${i}`, checkedAt: T(i + 1),
    });
    prevs.push(out.previousReliable);
    state = out.next;
  });
  return { state: state as unknown as LicenseStateRow, prevs };
}

describe("applyLicenseCheck — durum makinesi", () => {
  it("ilk VALID", () => {
    const { state } = run(["VALID"]);
    expect(state).toMatchObject({ current_status: "VALID", previous_status: null, review_state: "ok", first_valid_at: T(1), last_valid_at: T(1) });
  });

  const pairs: Array<[LicenseCheckResult, LicenseCheckResult]> = [
    ["VALID", "INVALID"], ["VALID", "NOT_FOUND"], ["INVALID", "VALID"], ["INVALID", "NOT_FOUND"],
    ["NOT_FOUND", "VALID"], ["NOT_FOUND", "INVALID"],
  ];
  for (const [a, b] of pairs) {
    it(`${a} → ${b}: önceki durum + değişim zamanı`, () => {
      const { state, prevs } = run([a, b]);
      expect(state.current_status).toBe(b);
      expect(state.previous_status).toBe(a);
      expect(state.status_changed_at).toBe(T(2));
      expect(prevs[1]).toBe(a);
      expect(licenseTransitionMessage(state.previous_status, state.current_status)).toBeTruthy();
    });
  }

  for (const s of ["VALID", "INVALID", "NOT_FOUND"] as const) {
    it(`${s} → ${s}: değişim yok, sayaç artar`, () => {
      const { state } = run([s, s]);
      expect(state.current_status).toBe(s);
      expect(state.status_changed_at).toBe(T(1));
      if (s === "NOT_FOUND") expect(state.consecutive_not_found).toBe(2);
      if (s === "INVALID") expect(state.consecutive_invalid).toBe(2);
      expect(licenseTransitionMessage(state.previous_status, state.current_status)).toBeNull();
    });
  }

  it("VALID → NOT_FOUND inceleme sebebi 'önceden geçerliydi'", () => {
    const { state } = run(["VALID", "NOT_FOUND"]);
    expect(state).toMatchObject({ review_state: "needs_review", review_reason: "not_found_after_valid" });
    expect(licenseTransitionMessage("VALID", "NOT_FOUND")).toBe("Önceden geçerliydi, şimdi KTB'de bulunamadı");
  });
  it("hiç geçerli olmamış NOT_FOUND ve INVALID incelemeye düşer", () => {
    expect(run(["NOT_FOUND"]).state).toMatchObject({ review_state: "needs_review", review_reason: "not_found" });
    expect(run(["INVALID"]).state).toMatchObject({ review_state: "needs_review", review_reason: "invalid" });
  });
  it("INVALID → VALID incelemeyi kapatır", () => {
    const { state } = run(["INVALID", "VALID"]);
    expect(state).toMatchObject({ review_state: "ok", review_reason: null });
    expect(licenseTransitionMessage("INVALID", "VALID")).toBe("Belge tekrar geçerli oldu");
    expect(licenseTransitionMessage("NOT_FOUND", "VALID")).toBe("Belge tekrar bulundu/geçerli");
  });

  it("CHECK_FAILED son güvenilir durumu DEĞİŞTİRMEZ (VALID → CHECK_FAILED × 3)", () => {
    const { state } = run(["VALID", "CHECK_FAILED", "CHECK_FAILED", "CHECK_FAILED"]);
    expect(state).toMatchObject({
      current_status: "VALID", previous_status: null, status_changed_at: T(1),
      review_state: "ok", consecutive_failures: 3, last_result_status: "CHECK_FAILED",
      last_success_at: T(1), last_valid_at: T(1),
    });
  });
  it("CHECK_FAILED sonrası başarılı kontrol gerçek durumu belirler", () => {
    const { state } = run(["VALID", "CHECK_FAILED", "NOT_FOUND"]);
    expect(state).toMatchObject({ current_status: "NOT_FOUND", previous_status: "VALID", consecutive_failures: 0 });
  });
  it("hiç kontrol edilmemişken CHECK_FAILED → UNCHECKED kalır", () => {
    expect(run(["CHECK_FAILED"]).state).toMatchObject({ current_status: "UNCHECKED", review_state: "ok", consecutive_failures: 1 });
  });
  it("belge numarası değişirse eski durum taşınmaz", () => {
    const first = run(["VALID"]).state;
    const out = applyLicenseCheck(first, {
      villaId: "v1", documentNumber: "07-9999", result: "NOT_FOUND", reasonCode: null, checkId: "x", checkedAt: T(5),
    });
    expect(out.previousReliable).toBeNull();
    expect(out.next).toMatchObject({ current_status: "NOT_FOUND", previous_status: null, first_valid_at: null, review_reason: "not_found" });
  });
});
