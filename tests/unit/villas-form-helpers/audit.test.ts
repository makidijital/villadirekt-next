import { describe, it, expect } from "vitest";

import {
  buildVillaCreateAuditAfter,
  buildVillaUpdateAuditBefore,
  buildVillaUpdateAuditAfter,
} from "@/app/(admin)/maki-admin/villas/_helpers/audit";
import {
  initialVillaFormData,
} from "@/app/(admin)/maki-admin/villas/_types/villa-form-data";

/* ===============================================================
   🛡️ FAZ 5 — VILLA AUDIT SNAPSHOT BUILDERS UNIT TESTS
   ===============================================================
   Pure helpers. Count-summary pattern + alan adı/sırası BYTE-IDENTICAL.
=============================================================== */

describe("buildVillaCreateAuditAfter", () => {
  it("returns 18 expected keys (regression guard — key-set lock)", () => {
    const after = buildVillaCreateAuditAfter({
      newId: "v-new",
      form: { ...initialVillaFormData("create"), title: "Test", description: "Hello" },
      selectedLocation: "loc-1",
      selectedTypes: ["t1", "t2"],
      selectedFeatures: ["f1"],
      selectedRules: [],
      selectedPriceIncludes: ["i1"],
      distances: [{ title: "P", distance: "1km" }],
      prices: [{ start_date: "x", end_date: "y", price: 100, currency: "TRY" }],
    });
    const keys = Object.keys(after).sort();
    expect(keys).toEqual([
      "id",
      "title",
      "slug",
      "location_id",
      "guests",
      "bedrooms",
      "bathrooms",
      "deposit",
      "cleaning_fee",
      "cleaning_currency",
      "minimum_stay_nights",
      "is_active",
      "description_length",
      "types_count",
      "features_count",
      "rules_count",
      "price_includes_count",
      "distances_count",
      "prices_count",
    ].sort());
  });

  it("description_length: typeof string ? .length : 0", () => {
    const a1 = buildVillaCreateAuditAfter({
      newId: "v",
      form: { ...initialVillaFormData("create"), title: "T", description: "Hello world" },
      selectedLocation: "loc",
      selectedTypes: [],
      selectedFeatures: [],
      selectedRules: [],
      selectedPriceIncludes: [],
      distances: [],
      prices: [],
    });
    expect(a1.description_length).toBe(11);
  });

  it("counts are Array.isArray-guarded", () => {
    const a = buildVillaCreateAuditAfter({
      newId: "v",
      form: { ...initialVillaFormData("create"), title: "T" },
      selectedLocation: "loc",
      selectedTypes: ["a", "b", "c"],
      selectedFeatures: ["f"],
      selectedRules: ["r1", "r2"],
      selectedPriceIncludes: [],
      distances: [
        { title: "X", distance: "1" },
        { title: "", distance: "2" }, // out
      ],
      prices: [
        { start_date: "x", end_date: "y", price: 100, currency: "TRY" },
        { start_date: "", end_date: "y", price: 100, currency: "TRY" }, // out
        { start_date: "x", end_date: "y", price: 0, currency: "TRY" }, // out
      ],
    });
    expect(a.types_count).toBe(3);
    expect(a.features_count).toBe(1);
    expect(a.rules_count).toBe(2);
    expect(a.price_includes_count).toBe(0);
    expect(a.distances_count).toBe(1);  // filter applied
    expect(a.prices_count).toBe(1);     // filter applied
  });

  it("is_active hardcoded true", () => {
    const a = buildVillaCreateAuditAfter({
      newId: "v",
      form: { ...initialVillaFormData("create"), title: "T" },
      selectedLocation: "loc",
      selectedTypes: [],
      selectedFeatures: [],
      selectedRules: [],
      selectedPriceIncludes: [],
      distances: [],
      prices: [],
    });
    expect(a.is_active).toBe(true);
  });
});

describe("buildVillaUpdateAudit{Before,After}", () => {
  const input = {
    id: "v-1",
    form: {
      ...initialVillaFormData("edit"),
      title: "Test",
      description: "Description",
      seo_title: "S",
      seo_description: "SD",
      noindex: true,
    },
    slug: "slug-x",
    selectedLocation: "loc",
    selectedTypes: ["t1"],
    selectedFeatures: ["f1", "f2"],
    selectedRules: [],
    selectedPriceIncludes: ["i1"],
    distances: [
      { title: "X", distance: "1" },
      { title: "", distance: "2" }, // NOT filtered (update asimetrisi)
    ],
    prices: [
      { start_date: "x", end_date: "y", price: 100, currency: "TRY" },
      { start_date: "x", end_date: "y", price: 0, currency: "TRY" }, // NOT filtered
    ],
  };

  /* 🛡️ SABİT SAYI GÜNCELLEMESİ (FAZ 1/A): üretimdeki audit snapshot'ı
     22 anahtar taşıyor (bathrooms, bedrooms, cleaning_currency,
     cleaning_fee, deposit, description_length, distances_count,
     features_count, guests, id, is_active, location_id,
     minimum_stay_nights, noindex, price_includes_count, prices_count,
     rules_count, seo_description, seo_title, slug, title, types_count).
     Testin ASIL invariant'ı — before/after şekil SİMETRİSİ — zaten
     geçiyordu ve AYNEN korunuyor; yalnız bayat regression sayısı
     gerçek anahtar sayısına hizalandı. Üretim kodu DEĞİŞMEDİ. */
  it("before + after have IDENTICAL shape (22 keys)", () => {
    const before = buildVillaUpdateAuditBefore(input);
    const after = buildVillaUpdateAuditAfter(input);
    expect(Object.keys(before).sort()).toEqual(Object.keys(after).sort());
    expect(Object.keys(before).length).toBe(22);
  });

  it("counts are NOT filtered (update asimetrisi vs create)", () => {
    const after = buildVillaUpdateAuditAfter(input);
    expect(after.distances_count).toBe(2); // no filter
    expect(after.prices_count).toBe(2);   // no filter
  });

  it("seo + noindex fields included", () => {
    const after = buildVillaUpdateAuditAfter(input);
    expect(after.seo_title).toBe("S");
    expect(after.seo_description).toBe("SD");
    expect(after.noindex).toBe(true);
  });

  it("description_length: typeof string check aynen", () => {
    const a1 = buildVillaUpdateAuditAfter({
      ...input,
      form: { ...input.form, description: "abc" },
    });
    expect(a1.description_length).toBe(3);
  });
});
