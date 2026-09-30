import { describe, it, expect } from "vitest";

import { buildVillaCorePayload } from "@/app/services/villa-admin/_helpers/payload";

import type {
  VillaForm,
  VillaMapData,
} from "@/app/services/villa-admin/types";

/* ===============================================================
   🛡️ FAZ 5 — buildVillaCorePayload UNIT TESTS
   ===============================================================
   Pure 40+ alanlı INSERT/UPDATE payload builder. Eski createVillaFull
   + updateVillaFull inline body'sinden BYTE-IDENTICAL extract.
=============================================================== */

const minimalForm: VillaForm = {
  title: "Villa Test",
  description: "Test villa",
};

const coordsMap: VillaMapData = {
  map_type: "coords",
  latitude: 36.5,
  longitude: 30.2,
  map_embed: null,
};

const iframeMap: VillaMapData = {
  map_type: "iframe",
  latitude: null,
  longitude: null,
  map_embed: "<iframe>...</iframe>",
};

describe("buildVillaCorePayload — required fields", () => {
  it("preserves title and description as-is", () => {
    const p = buildVillaCorePayload({
      form: minimalForm,
      mapData: coordsMap,
      slug: "villa-test",
    });
    expect(p.title).toBe("Villa Test");
    expect(p.description).toBe("Test villa");
  });

  it("passes slug through", () => {
    const p = buildVillaCorePayload({
      form: minimalForm,
      mapData: coordsMap,
      slug: "custom-slug-42",
    });
    expect(p.slug).toBe("custom-slug-42");
  });
});

describe("buildVillaCorePayload — location_id fallback", () => {
  it("uses selectedLocation when provided", () => {
    const p = buildVillaCorePayload({
      form: minimalForm,
      mapData: coordsMap,
      selectedLocation: "loc-1",
      slug: "v",
    });
    expect(p.location_id).toBe("loc-1");
  });

  it("falls back to null when undefined", () => {
    const p = buildVillaCorePayload({
      form: minimalForm,
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.location_id).toBeNull();
  });

  it("falls back to null when empty string", () => {
    const p = buildVillaCorePayload({
      form: minimalForm,
      mapData: coordsMap,
      selectedLocation: "",
      slug: "v",
    });
    expect(p.location_id).toBeNull();
  });
});

describe("buildVillaCorePayload — numeric coercion", () => {
  it("coerces string number to number with 0 fallback", () => {
    const p = buildVillaCorePayload({
      form: {
        ...minimalForm,
        guests: "6",
        bedrooms: "3",
        bathrooms: "2",
        deposit: "5000",
        cleaning_fee: "1500",
        cleaning_limit: "7",
      },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.guests).toBe(6);
    expect(p.bedrooms).toBe(3);
    expect(p.bathrooms).toBe(2);
    expect(p.deposit).toBe(5000);
    expect(p.cleaning_fee).toBe(1500);
    expect(p.cleaning_limit).toBe(7);
  });

  it("returns 0 for undefined / empty / NaN inputs", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.guests).toBe(0);
    expect(p.bedrooms).toBe(0);
    expect(p.bathrooms).toBe(0);
    expect(p.deposit).toBe(0);
    expect(p.cleaning_fee).toBe(0);
    expect(p.cleaning_limit).toBe(0);
  });
});

describe("buildVillaCorePayload — string defaults", () => {
  it("cleaning_currency defaults to TRY", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.cleaning_currency).toBe("TRY");
  });

  it("cleaning_currency passes through when provided", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm, cleaning_currency: "EUR" },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.cleaning_currency).toBe("EUR");
  });

  it("badge defaults to empty string", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.badge).toBe("");
  });
});

describe("buildVillaCorePayload — map type encoding (CRITICAL)", () => {
  it("coords: lat/lng set, embed null", () => {
    const p = buildVillaCorePayload({
      form: minimalForm,
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.map_type).toBe("coords");
    expect(p.latitude).toBe(36.5);
    expect(p.longitude).toBe(30.2);
    expect(p.map_embed).toBeNull();
  });

  it("iframe: embed set, lat/lng null", () => {
    const p = buildVillaCorePayload({
      form: minimalForm,
      mapData: iframeMap,
      slug: "v",
    });
    expect(p.map_type).toBe("iframe");
    expect(p.latitude).toBeNull();
    expect(p.longitude).toBeNull();
    expect(p.map_embed).toBe("<iframe>...</iframe>");
  });
});

describe("buildVillaCorePayload — pool fields pass-through", () => {
  it("preserves pool/indoor_pool/child_pool fields", () => {
    const p = buildVillaCorePayload({
      form: {
        ...minimalForm,
        pool_type: "private",
        pool_depth: "1.8",
        pool_width: "5",
        pool_length: "12",
        indoor_pool: true,
        indoor_pool_depth: "1.5",
        child_pool: true,
        child_pool_depth: "0.5",
      },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.pool_type).toBe("private");
    expect(p.pool_depth).toBe("1.8");
    expect(p.pool_width).toBe("5");
    expect(p.pool_length).toBe("12");
    expect(p.indoor_pool).toBe(true);
    expect(p.indoor_pool_depth).toBe("1.5");
    expect(p.child_pool).toBe(true);
    expect(p.child_pool_depth).toBe("0.5");
  });
});

describe("buildVillaCorePayload — SEO normalization", () => {
  it("empty seo_title/description → null", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm, seo_title: "", seo_description: "" },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.seo_title).toBeNull();
    expect(p.seo_description).toBeNull();
  });

  it("passes seo strings as-is", () => {
    const p = buildVillaCorePayload({
      form: {
        ...minimalForm,
        seo_title: "Best Villa",
        seo_description: "Amazing villa",
      },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.seo_title).toBe("Best Villa");
    expect(p.seo_description).toBe("Amazing villa");
  });

  it("noindex coerces to boolean (!!)", () => {
    const p1 = buildVillaCorePayload({
      form: { ...minimalForm, noindex: true },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p1.noindex).toBe(true);

    const p2 = buildVillaCorePayload({
      form: { ...minimalForm },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p2.noindex).toBe(false);
  });
});

describe("buildVillaCorePayload — delegated normalizers", () => {
  it("custom_prepayment_rate: '' → null", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm, custom_prepayment_rate: "" },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.custom_prepayment_rate).toBeNull();
  });

  it("custom_prepayment_rate: '25' → 25", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm, custom_prepayment_rate: "25" },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.custom_prepayment_rate).toBe(25);
  });

  it("commission_rate: invalid → 20 default", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm, commission_rate: -5 },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.commission_rate).toBe(20);
  });

  it("commission_rate: valid → passes through", () => {
    const p = buildVillaCorePayload({
      form: { ...minimalForm, commission_rate: 15 },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p.commission_rate).toBe(15);
  });

  it("minimum_stay_nights: 0 → null, 2.7 → 2", () => {
    const p1 = buildVillaCorePayload({
      form: { ...minimalForm, minimum_stay_nights: 0 },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p1.minimum_stay_nights).toBeNull();

    const p2 = buildVillaCorePayload({
      form: { ...minimalForm, minimum_stay_nights: 2.7 },
      mapData: coordsMap,
      slug: "v",
    });
    expect(p2.minimum_stay_nights).toBe(2);
  });
});

describe("buildVillaCorePayload — key set invariant", () => {
  it("returns EXACTLY 44 expected keys (regression guard)", () => {
    /* Bu test payload object'in key set'inin sabit kaldığını
       garantiler. Yeni alan eklenirse buradaki sayı + listenin
       bilinçli güncellenmesi gerekir. DB write surface kontrolü. */
    const p = buildVillaCorePayload({
      form: minimalForm,
      mapData: coordsMap,
      slug: "v",
    });
    const keys = Object.keys(p).sort();
    const EXPECTED = [
      "badge",
      "bathroom_layout",
      "bathrooms",
      "bedroom_layout",
      "bedrooms",
      "child_pool",
      "child_pool_depth",
      "child_pool_length",
      "child_pool_width",
      "cleaning_currency",
      "cleaning_fee",
      "cleaning_limit",
      "commission_rate",
      "custom_prepayment_rate",
      "deposit",
      "description",
      "guests",
      "indoor_pool",
      "indoor_pool_depth",
      "indoor_pool_length",
      "indoor_pool_width",
      "latitude",
      "location_id",
      "longitude",
      "map_embed",
      "map_type",
      "minimum_stay_nights",
      "noindex",
      "owner_id",
      "pool_depth",
      "pool_heating_currency",
      "pool_heating_fee",
      "pool_heating_months",
      "pool_length",
      "pool_sheltered",
      "pool_type",
      "pool_width",
      "real_title",
      "seo_description",
      "seo_title",
      "slug",
      "title",
      "tourism_document_number",
      "youtube_videos",
    ].sort();
    /* 🛡️ SABİT LİSTE GÜNCELLEMESİ (FAZ 1/A): testin kendi yorumunun
       öngördüğü bakım adımı. Sonradan eklenen 8 alan — bathroom_layout
       + bedroom_layout (migration 047), pool_sheltered (073),
       pool_heating_fee/_currency/_months (074-076), real_title (072),
       owner_id (property owners) — listeye eklendi. Anahtar SİLİNMEDİ;
       `toEqual(EXPECTED)` tam-küme kontrolü AYNEN duruyor, yani guard
       gevşemedi. Üretim kodu DEĞİŞMEDİ. */
    expect(keys.length).toBe(44);
    expect(keys).toEqual(EXPECTED);
  });
});
