import { describe, it, expect } from "vitest";
import {
  KTB_LICENSE_QUERY_HOST,
  buildKtbLicenseUrl,
  ktbLicenseLinkFor,
  normalizeKtbDocumentNumber,
} from "@/lib/ktb/ktb-document-number";

describe("normalizeKtbDocumentNumber — yalnız güvenli dönüşümler", () => {
  it("geçerli numara aynen", () => {
    expect(normalizeKtbDocumentNumber("07-6195")).toEqual({ ok: true, value: "07-6195" });
  });
  it("boşluk kırpma, Unicode tire ve tire çevresi boşluk", () => {
    expect(normalizeKtbDocumentNumber("  07-6195 ")).toEqual({ ok: true, value: "07-6195" });
    expect(normalizeKtbDocumentNumber("07 – 6195")).toEqual({ ok: true, value: "07-6195" });
    expect(normalizeKtbDocumentNumber("48–6195")).toEqual({ ok: true, value: "48-6195" });
  });
  it("boş → empty", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(normalizeKtbDocumentNumber(v)).toEqual({ ok: false, reason: "empty" });
    }
  });
  it("desteklenmeyen formatlar değiştirilmeden reddedilir", () => {
    for (const v of [
      "7-6195", // il kodu 2 hane değil (sıfır EKLENMEZ)
      "00-6195",
      "82-6195",
      "07-",
      "07 6195", // tire yok — birleştirilmez
      "07-61 95", // rakam içi boşluk — birleştirilmez
      "2020-07-1234", // basit konaklama formatı
      "05.08.2024-1234",
      "07-12345678", // 8 hane
      "abc",
      "07-6195&x=1",
      "07-6195/../",
    ]) {
      expect(normalizeKtbDocumentNumber(v), v).toEqual({ ok: false, reason: "unsupported_format" });
    }
  });
});

describe("KTB URL — sabit host + searchParams", () => {
  it("resmi sorgu URL'i", () => {
    const u = buildKtbLicenseUrl("07-6195");
    expect(u.toString()).toBe(
      "https://www.ktb.gov.tr/genel/bakanlikbelgelikonutlardemo.aspx?belgeno=07-6195"
    );
    expect(u.hostname).toBe(KTB_LICENSE_QUERY_HOST);
  });
  it("parametre encode edilir, host değişmez", () => {
    const u = buildKtbLicenseUrl("07-1&belgeno=x#@evil.example");
    expect(u.hostname).toBe(KTB_LICENSE_QUERY_HOST);
    expect(u.searchParams.getAll("belgeno")).toEqual(["07-1&belgeno=x#@evil.example"]);
  });
  it("UI linki yalnız geçerli numaraya", () => {
    expect(ktbLicenseLinkFor(" 07-6195 ")).toContain("belgeno=07-6195");
    expect(ktbLicenseLinkFor("abc")).toBeNull();
    expect(ktbLicenseLinkFor(null)).toBeNull();
  });
});
