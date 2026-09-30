import { describe, it, expect } from "vitest";

import {
  validateVillaCreate,
  validateVillaCreateStep1,
  validateVillaUpdate,
} from "@/app/(admin)/maki-admin/villas/_helpers/validation";

/* ===============================================================
   🛡️ FAZ 5 — VILLA FORM VALIDATION HELPERS UNIT TESTS
   ===============================================================
   Pure validators. Toast mesajları + order BYTE-IDENTICAL.
=============================================================== */

describe("validateVillaCreate (submit guard)", () => {
  it("ok when title + location both present", () => {
    expect(validateVillaCreate({ form: { title: "T" }, selectedLocation: "loc" })).toEqual({
      ok: true,
    });
  });

  it("error 'Villa adı ve bölge zorunlu' when title missing", () => {
    expect(
      validateVillaCreate({ form: { title: "" }, selectedLocation: "loc" })
    ).toEqual({ ok: false, message: "Villa adı ve bölge zorunlu" });
  });

  it("error 'Villa adı ve bölge zorunlu' when location missing", () => {
    expect(
      validateVillaCreate({ form: { title: "T" }, selectedLocation: "" })
    ).toEqual({ ok: false, message: "Villa adı ve bölge zorunlu" });
  });

  it("error when both missing (single message regardless)", () => {
    expect(
      validateVillaCreate({ form: { title: "" }, selectedLocation: "" })
    ).toEqual({ ok: false, message: "Villa adı ve bölge zorunlu" });
  });
});

describe("validateVillaCreateStep1 (goNext guard)", () => {
  it("ok when title + location both present", () => {
    expect(validateVillaCreateStep1({ form: { title: "T" }, selectedLocation: "loc" })).toEqual({
      ok: true,
    });
  });

  it("ORDER: title check FIRST (returns 'Villa adı zorunlu' when both missing)", () => {
    /* Kuralı: title FIRST, location SECOND.
       Her ikisi de boşsa title hatası dönmeli. */
    expect(
      validateVillaCreateStep1({ form: { title: "" }, selectedLocation: "" })
    ).toEqual({ ok: false, message: "Villa adı zorunlu" });
  });

  it("location check SECOND (when title OK, location fails)", () => {
    expect(
      validateVillaCreateStep1({ form: { title: "T" }, selectedLocation: "" })
    ).toEqual({ ok: false, message: "Bölge zorunlu" });
  });

  it("returns title error when location is OK but title missing", () => {
    expect(
      validateVillaCreateStep1({ form: { title: "" }, selectedLocation: "loc" })
    ).toEqual({ ok: false, message: "Villa adı zorunlu" });
  });
});

describe("validateVillaUpdate (submit guard)", () => {
  it("ok when title present", () => {
    expect(validateVillaUpdate({ form: { title: "T" } })).toEqual({ ok: true });
  });

  it("error 'Villa adı zorunlu' when title missing", () => {
    expect(validateVillaUpdate({ form: { title: "" } })).toEqual({
      ok: false,
      message: "Villa adı zorunlu",
    });
  });

  it("no location check (update flow asimetrisi vs create)", () => {
    /* update'te location DB'den hidrate; UI'da silinemez, ayrı kural yok. */
    expect(validateVillaUpdate({ form: { title: "T" } })).toEqual({ ok: true });
  });
});
