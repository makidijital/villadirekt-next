/* ===============================================================
   🛡️ FAZ 51 — OFFER REQUEST HUMANIZE TESTS
   ===============================================================
   Hedef: lib/offer-request.humanize.ts (FAZ 48'de eklenen
   render-layer helpers).
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  TRAVEL_GROUP_LABEL,
  humanizeTravelGroup,
  humanizeSlug,
  buildLabelMap,
  resolveTokenLabel,
  resolveFeatureLabel,
  formatBudgetRange,
} from "@/lib/offer-request.humanize";

describe("TRAVEL_GROUP_LABEL", () => {
  it("maps all expected enum keys to Turkish labels", () => {
    expect(TRAVEL_GROUP_LABEL.couple).toBe("Çift");
    expect(TRAVEL_GROUP_LABEL.honeymoon).toBe("Balayı Çifti");
    expect(TRAVEL_GROUP_LABEL.core_family).toBe("Çekirdek Aile");
    expect(TRAVEL_GROUP_LABEL.extended_family).toBe("Geniş Aile");
    expect(TRAVEL_GROUP_LABEL.friends).toBe("Arkadaş Grubu");
  });
});

describe("humanizeTravelGroup", () => {
  it("returns Turkish label for known enums", () => {
    expect(humanizeTravelGroup("extended_family")).toBe("Geniş Aile");
    expect(humanizeTravelGroup("friends")).toBe("Arkadaş Grubu");
  });

  it("falls back to humanizeSlug for unknown values", () => {
    expect(humanizeTravelGroup("some_new_group")).toBe("Some New Group");
  });

  it("returns em-dash for null/empty", () => {
    expect(humanizeTravelGroup(null)).toBe("—");
    expect(humanizeTravelGroup(undefined)).toBe("—");
    expect(humanizeTravelGroup("")).toBe("—");
  });
});

describe("humanizeSlug", () => {
  it("converts villa-type slugs to Turkish capitalized labels", () => {
    expect(humanizeSlug("balayi-villalari")).toBe("Balayı Villaları");
    expect(humanizeSlug("cocuk-havuzlu-villalar")).toBe("Çocuk Havuzlu Villalar");
    expect(humanizeSlug("isitmali-havuzlu")).toBe("Isıtmalı Havuzlu");
    expect(humanizeSlug("deniz-manzarali")).toBe("Deniz Manzaralı");
  });

  it("capitalizes regular region slugs", () => {
    expect(humanizeSlug("fethiye")).toBe("Fethiye");
    expect(humanizeSlug("kalkan")).toBe("Kalkan");
  });

  it("handles multi-word region slugs", () => {
    expect(humanizeSlug("kas-kalkan")).toBe("Kas Kalkan");
  });

  it("does NOT humanize UUIDs (passes them through)", () => {
    const uuid = "1507196d-7a3b-4c5e-9d2f-8e1a4b3c5d7e";
    expect(humanizeSlug(uuid)).toBe(uuid);
  });

  it("returns empty string for falsy inputs", () => {
    expect(humanizeSlug("")).toBe("");
    expect(humanizeSlug(null)).toBe("");
    expect(humanizeSlug(undefined)).toBe("");
  });
});

describe("buildLabelMap", () => {
  it("indexes both id and slug to the same name", () => {
    const map = buildLabelMap([
      { id: "abc-123", name: "Fethiye", slug: "fethiye" },
      { id: "def-456", name: "Kalkan", slug: "kalkan" },
    ]);
    expect(map["abc-123"]).toBe("Fethiye");
    expect(map["fethiye"]).toBe("Fethiye");
    expect(map["def-456"]).toBe("Kalkan");
    expect(map["kalkan"]).toBe("Kalkan");
  });

  it("skips rows with null slug (id-only lookup still works)", () => {
    const map = buildLabelMap([
      { id: "uuid-1", name: "Isıtmalı Havuz", slug: null },
    ]);
    expect(map["uuid-1"]).toBe("Isıtmalı Havuz");
  });
});

describe("resolveTokenLabel", () => {
  const lookup = { fethiye: "Fethiye", "abc-uuid": "Pool" };

  it("returns the looked-up label when token is present", () => {
    expect(resolveTokenLabel("fethiye", lookup)).toBe("Fethiye");
  });

  it("humanizes slug-shaped tokens when lookup misses", () => {
    expect(resolveTokenLabel("balayi-villalari", lookup)).toBe("Balayı Villaları");
  });

  it("returns the UUID fallback when token is a UUID and lookup misses", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    expect(resolveTokenLabel(uuid, lookup, "Özel")).toBe("Özel");
  });
});

describe("resolveFeatureLabel", () => {
  it("returns 'Özel özellik' for unresolved UUIDs (no raw UUID leak)", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    expect(resolveFeatureLabel(uuid, {})).toBe("Özel özellik");
  });

  it("returns the actual feature name when resolved", () => {
    const map = { "feat-1": "Isıtmalı Havuz" };
    expect(resolveFeatureLabel("feat-1", map)).toBe("Isıtmalı Havuz");
  });
});

describe("formatBudgetRange", () => {
  it("returns em-dash for both-null", () => {
    expect(formatBudgetRange(null, null, "TRY")).toBe("—");
    expect(formatBudgetRange(undefined, undefined, "TRY")).toBe("—");
  });

  it("formats a full range with currency symbol", () => {
    const out = formatBudgetRange(5000, 15000, "TRY");
    expect(out).toMatch(/5\.000/);
    expect(out).toMatch(/15\.000/);
    expect(out).toMatch(/–/);
  });

  it("formats min-only with '+' suffix", () => {
    const out = formatBudgetRange(5000, null, "TRY");
    expect(out).toMatch(/5\.000/);
    expect(out).toMatch(/\+/);
  });

  it("formats max-only with '<' prefix", () => {
    const out = formatBudgetRange(null, 15000, "TRY");
    expect(out).toMatch(/15\.000/);
    expect(out.startsWith("<")).toBe(true);
  });

  it("falls back to plain locale + code for unsupported currency", () => {
    const out = formatBudgetRange(1000, 2000, "ZZZ");
    expect(out).toMatch(/1\.000/);
    expect(out).toMatch(/2\.000/);
  });
});
