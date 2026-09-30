import { describe, it, expect } from "vitest";

/* ===============================================================
   🛡️ SEC-06 F1 — SIKI TARİH DOĞRULAMASI (saf helper)
   =============================================================== */
import {
  isStrictIsoDate,
  validatePublicReservationDates,
  RESERVATION_DATE_ERRORS,
} from "@/app/services/reservation/_helpers/date-verify";

// Sabit "şimdi": 2026-09-24 12:00 UTC.
const NOW = new Date(Date.UTC(2026, 8, 24, 12, 0, 0));
const v = (s: unknown, e: unknown) => validatePublicReservationDates(s, e, NOW);

describe("isStrictIsoDate", () => {
  it("geçerli YYYY-MM-DD kabul", () => {
    for (const d of ["2027-09-01", "2028-02-29", "2027-12-31", "2027-01-01"]) {
      expect(isStrictIsoDate(d)).toBe(true);
    }
  });

  it("belirsiz / otomatik parse edilebilir biçimler RED", () => {
    for (const d of [
      "20270918",
      "2027/09/27",
      "2027-09-23 00:00",
      "2027-09-23T00:00:00",
      "2027-09-23T00:00:00.000Z",
      "Aug 27 2027",
      "27.09.2027",
      "09-27-2027",
      " 2027-09-27",
      "2027-09-27 ",
      "2027-9-7",
      "+2027-09-27",
      "",
    ]) {
      expect(isStrictIsoDate(d)).toBe(false);
    }
  });

  it("takvimde olmayan gün RED (taşma yok)", () => {
    for (const d of ["2027-02-29", "2027-02-30", "2027-04-31", "2027-13-01", "2027-00-10", "2027-01-00"]) {
      expect(isStrictIsoDate(d)).toBe(false);
    }
  });

  it("string olmayan değer RED", () => {
    for (const d of [null, undefined, 20270918, {}, [], new Date()]) {
      expect(isStrictIsoDate(d)).toBe(false);
    }
  });
});

describe("validatePublicReservationDates", () => {
  it("normal YYYY-MM-DD aralık → geçerli", () => {
    expect(v("2027-06-02", "2027-06-06")).toBeNull();
    expect(v("2026-09-24", "2026-09-25")).toBeNull(); // bugün giriş
    expect(v("2027-06-02", "2027-06-03")).toBeNull(); // 1 gece
  });

  it("eksik tarih → 'Tarih zorunlu' (createReservation ile aynı mesaj)", () => {
    expect(v("", "2027-06-06")).toBe(RESERVATION_DATE_ERRORS.required);
    expect(v("2027-06-02", undefined)).toBe(RESERVATION_DATE_ERRORS.required);
    expect(RESERVATION_DATE_ERRORS.required).toBe("Tarih zorunlu");
  });

  it("geçersiz biçim → reddedilir", () => {
    expect(v("20270918", "20270922")).toBe(RESERVATION_DATE_ERRORS.invalidFormat);
    expect(v("2027/09/27", "2027/09/30")).toBe(RESERVATION_DATE_ERRORS.invalidFormat);
    expect(v("2027-09-23 00:00", "2027-09-27 00:00")).toBe(RESERVATION_DATE_ERRORS.invalidFormat);
    expect(v("Aug 27 2027", "Aug 31 2027")).toBe(RESERVATION_DATE_ERRORS.invalidFormat);
    expect(v("2027-08-23T00:00:00", "2027-08-27T00:00:00")).toBe(RESERVATION_DATE_ERRORS.invalidFormat);
    expect(v("2027-06-02", "2027-02-30")).toBe(RESERVATION_DATE_ERRORS.invalidFormat);
  });

  it("0 gece ve ters aralık → 'Tarih aralığı hatalı' (mevcut mesaj)", () => {
    expect(v("2027-09-05", "2027-09-05")).toBe(RESERVATION_DATE_ERRORS.invalidRange);
    expect(v("2027-09-06", "2027-09-05")).toBe(RESERVATION_DATE_ERRORS.invalidRange);
    expect(RESERVATION_DATE_ERRORS.invalidRange).toBe("Tarih aralığı hatalı");
  });

  it("tamamı geçmişte kalan konaklama → reddedilir", () => {
    expect(v("2026-06-01", "2026-06-05")).toBe(RESERVATION_DATE_ERRORS.past);
    expect(v("2020-01-01", "2020-01-05")).toBe(RESERVATION_DATE_ERRORS.past);
    expect(v("2026-09-20", "2026-09-22")).toBe(RESERVATION_DATE_ERRORS.past);
  });

  it("saat dilimi toleransı: çıkışı dün/bugün olan aralık reddedilmez", () => {
    // Ör. UTC-10'daki bir kullanıcının yerel "bugün"ü UTC'den 1 gün geride olabilir.
    expect(v("2026-09-22", "2026-09-23")).toBeNull();
    expect(v("2026-09-23", "2026-09-24")).toBeNull();
  });

  it("girişi geçmişte, çıkışı gelecekte olan aralığa dokunulmaz (mevcut indirim CTA davranışı)", () => {
    expect(v("2026-09-20", "2026-09-27")).toBeNull();
  });
});
