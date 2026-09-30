/* ===============================================================
   🛡️ KİMLİK NO — TC Kimlik **veya** Pasaport
   ===============================================================
   Alan etiketi "TC / Pasaport" olduğu hâlde validation yalnız
   /^\d{11}$/ kabul ediyordu. Artık pasaport da kabul edilir.

   KAPSAM (kullanıcı senaryoları 1-8):
     1 Geçerli TC → kabul
     2 Geçersiz TC → MEVCUT davranış korunarak red
     3 A12345678 → kabul
     4 P1234567  → kabul
     5 harf+rakam pasaport → kabul
     6 boş → red
     7 sadece özel karakter → red
     8 aşırı uzun → red

   ⚠️ REGRESYON: hata mesajı ANAHTARI (identityInvalid/identityRequired)
     ve i18n sistemi değişmedi; yeni metin eklenmedi.
=============================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isValidIdentityOrPassport,
  validatePublicReservationForm,
} from "@/app/components/reservation/_helpers/validatePublicReservationForm";
import { initialPublicReservationFormData } from "@/app/components/reservation/_types/reservation-form-data";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const valid = () => ({
  ...initialPublicReservationFormData(),
  name: "Ahmet Yılmaz",
  phone: "+905551112233",
  phone2: "+4915112345678",
  email: "test@example.com",
  identity: "12345678901",
  payment_method_id: "pm-1",
});

const check = (identity: string) =>
  validatePublicReservationForm({
    form: { ...valid(), identity },
    start: "2026-06-01",
    end: "2026-06-08",
  });

/* ===============================================================
   1-2) TC KİMLİK — mevcut davranış BİREBİR korundu
   =============================================================== */
describe("1-2) TC Kimlik", () => {
  it("1) geçerli 11 haneli TC → kabul", () => {
    expect(isValidIdentityOrPassport("12345678901")).toBe(true);
    expect(check("12345678901").identity).toBeUndefined();
  });

  const BAD_TC: Array<[string, string]> = [
    ["10 hane", "1234567890"],
    ["12 hane", "123456789012"],
    ["9 hane", "123456789"],
    ["harf karışık, harfle başlamıyor", "12345abcdef"],
  ];

  for (const [label, v] of BAD_TC) {
    it(`2) geçersiz TC — ${label} → RED (mevcut davranış)`, () => {
      expect(isValidIdentityOrPassport(v)).toBe(false);
      expect(check(v).identity).toBe("11 haneli TC gir");
    });
  }

  it("2b) 🔒 TC kuralı kaynakta AYNEN duruyor", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "app/components/reservation/_helpers/validatePublicReservationForm.ts"
      ),
      "utf-8"
    );
    expect(src).toContain("const TC_IDENTITY_RE = /^\\d{11}$/");
  });
});

/* ===============================================================
   3-5) PASAPORT — kabul
   =============================================================== */
describe("3-5) pasaport", () => {
  const OK: Array<[string, string]> = [
    ["A12345678 (örnek)", "A12345678"],
    ["P1234567 (örnek)", "P1234567"],
    ["X12345678 (örnek)", "X12345678"],
    ["2 harf önek", "AB123456"],
    ["sonda harf", "AB1234C5"],
    ["6 karakter (alt sınır)", "A12345"],
    ["12 karakter (üst sınır)", "A12345678901"],
    ["küçük harf yazım", "a12345678"],
    ["boşluklu yazım", "A1 234 5678"],
    ["tireli yazım", "A1-234-5678"],
  ];

  for (const [label, v] of OK) {
    it(`3-5) ${label} → KABUL`, () => {
      expect(isValidIdentityOrPassport(v)).toBe(true);
      expect(check(v).identity).toBeUndefined();
    });
  }

  it("5b) tek bir ülke formatına KİLİTLİ DEĞİL", () => {
    /* Farklı ülkelerde görülen şekiller — hepsi kabul. */
    for (const v of ["C01X00T47", "L898902C3", "E12345678", "GB1234567"]) {
      expect(isValidIdentityOrPassport(v)).toBe(true);
    }
  });
});

/* ===============================================================
   6-8) RED — boş / anlamsız / aşırı uzun
   =============================================================== */
describe("6-8) reddedilen değerler", () => {
  it("6) boş → 'TC zorunlu' (required mesajı, mevcut)", () => {
    expect(isValidIdentityOrPassport("")).toBe(false);
    expect(check("").identity).toBe("TC zorunlu");
  });

  it("6b) sadece boşluk → red", () => {
    expect(isValidIdentityOrPassport("   ")).toBe(false);
  });

  it("6c) null / undefined → red (çökmez)", () => {
    expect(isValidIdentityOrPassport(null)).toBe(false);
    expect(isValidIdentityOrPassport(undefined)).toBe(false);
  });

  const BAD: Array<[string, string]> = [
    ["sadece özel karakter", "!!!!!!"],
    ["özel karakter karışık", "A123!@#45"],
    ["sadece harf (rakam yok)", "ABCDEFGH"],
    ["çok kısa", "A1234"],
    ["aşırı uzun (13)", "A123456789012"],
    ["aşırı uzun (30)", "A" + "1".repeat(29)],
    ["rakamla başlıyor", "1A234567"],
    ["unicode/emoji", "A1234🙂"],
    ["SQL benzeri", "' OR 1=1--"],
  ];

  for (const [label, v] of BAD) {
    it(`7-8) ${label} → RED`, () => {
      expect(isValidIdentityOrPassport(v)).toBe(false);
      expect(check(v).identity).toBe("11 haneli TC gir");
    });
  }
});

/* ===============================================================
   9) i18n + SÖZLEŞME REGRESYONU
   =============================================================== */
describe("9) i18n ve sözleşme korundu", () => {
  it("9a) hata mesajı ANAHTARLARI değişmedi — yeni metin eklenmedi", () => {
    for (const locale of ["tr", "en", "de"] as const) {
      const v = getDictionary(locale).reservation.validation;
      expect(check("").identity).toBeDefined();
      expect(typeof v.identityRequired).toBe("string");
      expect(typeof v.identityInvalid).toBe("string");
    }
  });

  it("9b) her locale'de MEVCUT identityInvalid mesajı kullanılır", () => {
    for (const locale of ["tr", "en", "de"] as const) {
      const v = getDictionary(locale).reservation.validation;
      const errors = validatePublicReservationForm(
        { form: { ...valid(), identity: "!!!" }, start: "2026-06-01", end: "2026-06-08" },
        locale
      );
      expect(errors.identity).toBe(v.identityInvalid);
    }
  });

  it("9c) 🔒 payload/DB'ye giden değer NORMALİZE EDİLMEZ", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "app/components/reservation/_helpers/buildPublicReservationPayload.ts"
      ),
      "utf-8"
    );
    /* identity_number hâlâ ham form değerinden türer. */
    expect(src).toContain("identity");
    expect(src).not.toContain("isValidIdentityOrPassport");
  });

  it("9d) 🔒 kimlik doğrulaması TEK yerde — kopyalanmadı", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "app/components/reservation/_helpers/validatePublicReservationForm.ts"
      ),
      "utf-8"
    );
    expect(
      (src.match(/function isValidIdentityOrPassport/g) || []).length
    ).toBe(1);
  });
});
