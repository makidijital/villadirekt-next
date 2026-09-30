import { describe, it, expect } from "vitest";

import {
  hydrateVillaMapDataFromRow,
  hydrateVillaSlugFromRow,
  hydrateVillaLocationIdFromRow,
  hydrateVillaYouTubeVideosFromRow,
} from "@/app/(admin)/maki-admin/villas/_helpers/hydrate";

/* ===============================================================
   🛡️ FAZ 5 — VILLA HYDRATE HELPERS UNIT TESTS
   ===============================================================
   Pure helpers. fetchVilla inline body'sinden BYTE-IDENTICAL extract.
   Number coerce + fallback chain regression guard.
=============================================================== */

describe("hydrateVillaMapDataFromRow", () => {
  it("passes through coords + map_embed", () => {
    expect(
      hydrateVillaMapDataFromRow({
        map_type: "coords",
        latitude: 36.5,
        longitude: 30.1,
        map_embed: "",
      })
    ).toEqual({
      map_type: "coords",
      latitude: 36.5,
      longitude: 30.1,
      map_embed: "",
    });
  });

  it("default map_type 'coords' when null/undefined", () => {
    expect(hydrateVillaMapDataFromRow({ map_type: null }).map_type).toBe("coords");
    expect(hydrateVillaMapDataFromRow({}).map_type).toBe("coords");
  });

  it("default latitude 36.36 / longitude 29.35 when missing or non-numeric", () => {
    const r = hydrateVillaMapDataFromRow({});
    expect(r.latitude).toBe(36.36);
    expect(r.longitude).toBe(29.35);
  });

  it("Number() coerce: string number → number", () => {
    expect(
      hydrateVillaMapDataFromRow({ latitude: "40.5", longitude: "29.5" } as Record<string, unknown>)
    ).toMatchObject({ latitude: 40.5, longitude: 29.5 });
  });

  it("Number() falsy fallback (0 → 36.36)", () => {
    /* `Number("") || 36.36` → "" coerce 0 → falsy → fallback */
    const r = hydrateVillaMapDataFromRow({ latitude: "", longitude: "" } as Record<string, unknown>);
    expect(r.latitude).toBe(36.36);
    expect(r.longitude).toBe(29.35);
  });

  it("map_embed default empty string", () => {
    expect(hydrateVillaMapDataFromRow({}).map_embed).toBe("");
  });
});

describe("hydrateVillaSlugFromRow", () => {
  it("returns slug when present (non-empty string)", () => {
    expect(hydrateVillaSlugFromRow({ slug: "villa-1", title: "T" })).toBe("villa-1");
  });

  it("falls back to slugifyTr(title) when slug missing", () => {
    expect(hydrateVillaSlugFromRow({ title: "Villa Şahane" })).toBe("villa-sahane");
  });

  it("falls back to slugifyTr(title) when slug empty string", () => {
    expect(hydrateVillaSlugFromRow({ slug: "", title: "Hello World" })).toBe("hello-world");
  });

  it("returns slugifyTr('') for empty input", () => {
    /* slugifyTr returns '' for empty input — safe edge. */
    expect(hydrateVillaSlugFromRow({})).toBe("");
  });
});

describe("hydrateVillaLocationIdFromRow", () => {
  it("returns location_id when string", () => {
    expect(hydrateVillaLocationIdFromRow({ location_id: "loc-1" })).toBe("loc-1");
  });

  it("returns empty string when missing", () => {
    expect(hydrateVillaLocationIdFromRow({})).toBe("");
  });

  it("returns empty string when null", () => {
    expect(hydrateVillaLocationIdFromRow({ location_id: null })).toBe("");
  });
});

describe("hydrateVillaYouTubeVideosFromRow", () => {
  it("returns [] for null input", () => {
    expect(hydrateVillaYouTubeVideosFromRow({ youtube_videos: null })).toEqual([]);
  });

  it("returns [] for missing input", () => {
    expect(hydrateVillaYouTubeVideosFromRow({})).toEqual([]);
  });

  it("passes valid videos through", () => {
    const result = hydrateVillaYouTubeVideosFromRow({
      youtube_videos: [
        { id: "dQw4w9WgXcQ", url: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
      ],
    });
    expect(result.length).toBeGreaterThan(0);
  });
});
