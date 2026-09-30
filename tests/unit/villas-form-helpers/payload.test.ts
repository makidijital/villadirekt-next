import { describe, it, expect } from "vitest";

import {
  buildVillaCreatePayload,
  buildVillaUpdatePayload,
} from "@/app/(admin)/maki-admin/villas/_helpers/payload";
import {
  initialVillaFormData,
  type VillaMapData,
} from "@/app/(admin)/maki-admin/villas/_types/villa-form-data";

/* ===============================================================
   🛡️ FAZ 5 — VILLA FORM PAYLOAD BUILDERS UNIT TESTS
   ===============================================================
   Pure helpers. Inline ekle/[id] payload body'lerinden BYTE-IDENTICAL
   extract edilenler için regression guard.
=============================================================== */

const map: VillaMapData = {
  map_type: "coords",
  latitude: 36.5,
  longitude: 30.2,
  map_embed: "",
};

describe("buildVillaCreatePayload", () => {
  const baseForm = {
    ...initialVillaFormData("create"),
    title: "Villa Test",
  };

  it("returns full payload with form + selectedLocation + arrays + filters", () => {
    const p = buildVillaCreatePayload({
      form: baseForm,
      selectedLocation: "loc-1",
      selectedTypes: ["t1"],
      selectedFeatures: ["f1"],
      mapData: map,
      distances: [
        { title: "Plaj", distance: "500m" },
        { title: "", distance: "1km" }, // filter out
      ],
      prices: [
        { start_date: "2026-06-01", end_date: "2026-06-08", price: 5000, currency: "TRY" },
        { start_date: "", end_date: "2026-06-15", price: 100, currency: "TRY" }, // filter out
      ],
      selectedRules: ["r1"],
      selectedPriceIncludes: ["i1"],
      youtubeVideos: [],
    });

    expect(p.selectedLocation).toBe("loc-1");
    expect(p.selectedTypes).toEqual(["t1"]);
    expect(p.selectedFeatures).toEqual(["f1"]);
    expect(p.mapData).toEqual(map);
    expect(p.selectedRules).toEqual(["r1"]);
    expect(p.selectedPriceIncludes).toEqual(["i1"]);
    expect(p.distances?.length).toBe(1);
    expect(p.prices?.length).toBe(1);
  });

  it("create asimetrisi: distances.filter(title && distance) aynen", () => {
    const p = buildVillaCreatePayload({
      form: baseForm,
      selectedLocation: "loc-1",
      selectedTypes: [],
      selectedFeatures: [],
      mapData: map,
      distances: [
        { title: "X", distance: "Y" },
        { title: "", distance: "Z" }, // out
        { title: "A", distance: "" }, // out
        { title: "B", distance: "C" },
      ],
      prices: [],
      selectedRules: [],
      selectedPriceIncludes: [],
      youtubeVideos: [],
    });
    expect(p.distances).toEqual([
      { title: "X", distance: "Y" },
      { title: "B", distance: "C" },
    ]);
  });

  it("create asimetrisi: prices.filter(start_date && end_date && price>0) aynen", () => {
    const p = buildVillaCreatePayload({
      form: baseForm,
      selectedLocation: "loc-1",
      selectedTypes: [],
      selectedFeatures: [],
      mapData: map,
      distances: [],
      prices: [
        { start_date: "2026-06-01", end_date: "2026-06-08", price: 5000, currency: "TRY" },
        { start_date: "", end_date: "2026-06-08", price: 5000, currency: "TRY" }, // out
        { start_date: "2026-06-01", end_date: "", price: 5000, currency: "TRY" }, // out
        { start_date: "2026-06-01", end_date: "2026-06-08", price: 0, currency: "TRY" }, // out (≤0)
        { start_date: "2026-06-01", end_date: "2026-06-08", price: -100, currency: "TRY" }, // out (≤0)
      ],
      selectedRules: [],
      selectedPriceIncludes: [],
      youtubeVideos: [],
    });
    expect(p.prices?.length).toBe(1);
  });

  it("form.slug injected via slugifyTr(title); youtube_videos injected", () => {
    const p = buildVillaCreatePayload({
      form: { ...baseForm, title: "Villa Şahane" },
      selectedLocation: "loc-1",
      selectedTypes: [],
      selectedFeatures: [],
      mapData: map,
      distances: [],
      prices: [],
      selectedRules: [],
      selectedPriceIncludes: [],
      youtubeVideos: [{ id: "abc12345678", url: "https://youtube.com/?v=abc12345678" }],
    });
    expect((p.form as Record<string, unknown>).slug).toBe("villa-sahane");
    expect((p.form as Record<string, unknown>).youtube_videos).toEqual([
      { id: "abc12345678", url: "https://youtube.com/?v=abc12345678" },
    ]);
  });
});

describe("buildVillaUpdatePayload", () => {
  const baseForm = {
    ...initialVillaFormData("edit"),
    title: "Villa Edit",
  };

  it("returns full payload with id + form + arrays (NO filter on prices/distances)", () => {
    const p = buildVillaUpdatePayload({
      id: "v-1",
      form: baseForm,
      slug: "villa-edit",
      selectedLocation: "loc-1",
      selectedTypes: ["t1"],
      selectedFeatures: ["f1"],
      mapData: map,
      distances: [
        { title: "Plaj", distance: "500m" },
        { title: "", distance: "1km" }, // KEPT (update asimetrisi — no filter)
      ],
      prices: [
        { start_date: "2026-06-01", end_date: "2026-06-08", price: 5000, currency: "TRY" },
        { start_date: "", end_date: "2026-06-15", price: 100, currency: "TRY" }, // KEPT
      ],
      selectedRules: ["r1"],
      selectedPriceIncludes: ["i1"],
      youtubeVideos: [],
    });

    expect(p.id).toBe("v-1");
    expect(p.distances?.length).toBe(2); // update asimetrisi: no filter
    expect(p.prices?.length).toBe(2);   // update asimetrisi: no filter
  });

  it("form.slug from input (not regenerated via slugifyTr)", () => {
    const p = buildVillaUpdatePayload({
      id: "v-1",
      form: { ...baseForm, title: "Different Title" },
      slug: "explicit-slug",
      selectedLocation: "loc-1",
      selectedTypes: [],
      selectedFeatures: [],
      mapData: map,
      distances: [],
      prices: [],
      selectedRules: [],
      selectedPriceIncludes: [],
      youtubeVideos: [],
    });
    expect((p.form as Record<string, unknown>).slug).toBe("explicit-slug");
  });

  it("youtube_videos injected via form spread", () => {
    const p = buildVillaUpdatePayload({
      id: "v-1",
      form: baseForm,
      slug: "v",
      selectedLocation: "loc-1",
      selectedTypes: [],
      selectedFeatures: [],
      mapData: map,
      distances: [],
      prices: [],
      selectedRules: [],
      selectedPriceIncludes: [],
      youtubeVideos: [{ id: "xyz98765432", url: "https://youtube.com/?v=xyz98765432" }],
    });
    expect((p.form as Record<string, unknown>).youtube_videos).toEqual([
      { id: "xyz98765432", url: "https://youtube.com/?v=xyz98765432" },
    ]);
  });
});
