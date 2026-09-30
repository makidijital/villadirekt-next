/* ===============================================================
   🛡️ PHASE 10E BATCH 1 — VILLA LAYOUT LABEL HELPER TESTS
   ===============================================================
   Hedef: lib/villa-layout-label.helper.ts (enum etiketi → locale).

   GERÇEK (mock'lanmamış) dictionary + GERÇEK BED_TYPES/BATHROOM_TYPES
   kullanılır — Batch 4'teki distance-label.helper.test.ts ile AYNI
   desen. Böylece hem helper hem dictionary içeriği birlikte doğrulanır.

   KRİTİK: TR etiketleri lib/villa-layout.helper.ts'teki mevcut
   BED_TYPE_LABELS/BATHROOM_TYPE_LABELS ile BİREBİR aynı olmalı —
   aksi halde TR public render DEĞİŞİR (regresyon).
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  getBedTypeLabel,
  getBathroomTypeLabel,
  getBedroomNameLabel,
  getBathroomNameLabel,
} from "@/lib/villa-layout-label.helper";
import {
  BED_TYPES,
  BATHROOM_TYPES,
  BED_TYPE_LABELS,
  BATHROOM_TYPE_LABELS,
  BEDROOM_NAME_SUGGESTIONS,
} from "@/lib/villa-layout.helper";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

const LOCALES: Locale[] = ["tr", "en", "de"];

describe("getBedTypeLabel", () => {
  it.each(BED_TYPES.map((t) => [t] as const))(
    "%s → TR etiketi mevcut BED_TYPE_LABELS ile BİREBİR aynı (regresyon guard)",
    (type) => {
      expect(getBedTypeLabel(type, "tr")).toBe(BED_TYPE_LABELS[type]);
    }
  );

  it("EN beklenen sabit değerler", () => {
    expect(getBedTypeLabel("double", "en")).toBe("Double Bed");
    expect(getBedTypeLabel("single", "en")).toBe("Single Bed");
    expect(getBedTypeLabel("queen", "en")).toBe("Queen Bed");
    expect(getBedTypeLabel("king", "en")).toBe("King Bed");
    expect(getBedTypeLabel("bunk", "en")).toBe("Bunk Bed");
    expect(getBedTypeLabel("sofa", "en")).toBe("Sofa Bed");
  });

  it("DE beklenen sabit değerler", () => {
    expect(getBedTypeLabel("double", "de")).toBe("Doppelbett");
    expect(getBedTypeLabel("single", "de")).toBe("Einzelbett");
    expect(getBedTypeLabel("queen", "de")).toBe("Queensize-Bett");
    expect(getBedTypeLabel("king", "de")).toBe("Kingsize-Bett");
    expect(getBedTypeLabel("bunk", "de")).toBe("Etagenbett");
    expect(getBedTypeLabel("sofa", "de")).toBe("Schlafsofa");
  });

  it.each(LOCALES)("locale=%s için 6 yatak tipinin TAMAMI dolu", (locale) => {
    for (const type of BED_TYPES) {
      expect(getBedTypeLabel(type, locale)).toBeTruthy();
    }
  });
});

describe("getBathroomTypeLabel", () => {
  it.each(BATHROOM_TYPES.map((t) => [t] as const))(
    "%s → TR etiketi mevcut BATHROOM_TYPE_LABELS ile BİREBİR aynı (regresyon guard)",
    (type) => {
      expect(getBathroomTypeLabel(type, "tr")).toBe(BATHROOM_TYPE_LABELS[type]);
    }
  );

  it("EN/DE beklenen sabit değerler", () => {
    expect(getBathroomTypeLabel("full", "en")).toBe("Full Bathroom");
    expect(getBathroomTypeLabel("shower_wc", "en")).toBe("Shower + WC");
    expect(getBathroomTypeLabel("wc", "en")).toBe("WC");
    expect(getBathroomTypeLabel("full", "de")).toBe("Vollbad");
    expect(getBathroomTypeLabel("shower_wc", "de")).toBe("Dusche + WC");
    expect(getBathroomTypeLabel("wc", "de")).toBe("WC");
  });

  it.each(LOCALES)("locale=%s için 3 banyo tipinin TAMAMI dolu", (locale) => {
    for (const type of BATHROOM_TYPES) {
      expect(getBathroomTypeLabel(type, locale)).toBeTruthy();
    }
  });
});

describe("dictionary — enum kapsama (drift koruması)", () => {
  it.each(LOCALES)(
    "locale=%s: dictionary key kümesi BED_TYPES/BATHROOM_TYPES ile birebir",
    (locale) => {
      const dict = getDictionary(locale);
      expect(Object.keys(dict.bedTypeLabels).sort()).toEqual(
        [...BED_TYPES].sort()
      );
      expect(Object.keys(dict.bathroomTypeLabels).sort()).toEqual(
        [...BATHROOM_TYPES].sort()
      );
    }
  );

  it("accommodation UI metinleri TR'de mevcut component metinleriyle aynı", () => {
    const tr = getDictionary("tr");
    expect(tr.accommodation.sectionTitle).toBe("Konaklama Düzeni");
    expect(tr.accommodation.noDetail).toBe("Detay belirtilmedi");
    expect(tr.accommodation.bedroomFallback).toBe("{n}. Yatak Odası");
    expect(tr.accommodation.bathroomFallback).toBe("{n}. Banyo");
  });

  it.each(LOCALES)("locale=%s: accommodation şablonları {n} içeriyor", (locale) => {
    const dict = getDictionary(locale);
    expect(dict.accommodation.bedroomFallback).toContain("{n}");
    expect(dict.accommodation.bathroomFallback).toContain("{n}");
    expect(dict.accommodation.sectionTitle).toBeTruthy();
    expect(dict.accommodation.noDetail).toBeTruthy();
  });
});

/* ===============================================================
   🛡️ PHASE 10F — ODA/BANYO ADI SÖZLÜK ÇÖZÜMÜ
   ===============================================================
   Villa bazlı EN/DE ad çevirisi kaldırıldı; adlar yalnız buradan
   çözülür. TR identity-map olduğu için TR çıktısı DEĞİŞMEZ.
=============================================================== */
describe("getBedroomNameLabel / getBathroomNameLabel", () => {
  it("🛡️ TR: canonical adlar AYNEN döner (TR regresyon kilidi)", () => {
    for (const name of BEDROOM_NAME_SUGGESTIONS) {
      expect(getBedroomNameLabel(name, "tr")).toBe(name);
    }
    expect(getBathroomNameLabel("1. Banyo", "tr")).toBe("1. Banyo");
    expect(getBathroomNameLabel("Banyo", "tr")).toBe("Banyo");
  });

  it("EN canonical oda adları", () => {
    expect(getBedroomNameLabel("Ana Yatak Odası", "en")).toBe("Master Bedroom");
    expect(getBedroomNameLabel("Çocuk Odası", "en")).toBe("Children's Room");
    expect(getBedroomNameLabel("Misafir Odası", "en")).toBe("Guest Room");
    expect(getBedroomNameLabel("Yatak Odası", "en")).toBe("Bedroom");
  });

  it("DE canonical oda adları", () => {
    expect(getBedroomNameLabel("Ana Yatak Odası", "de")).toBe(
      "Hauptschlafzimmer"
    );
    expect(getBedroomNameLabel("Çocuk Odası", "de")).toBe("Kinderzimmer");
    expect(getBedroomNameLabel("Misafir Odası", "de")).toBe("Gästezimmer");
  });

  it("numaralı oda adı şablondan üretilir (EN/DE)", () => {
    expect(getBedroomNameLabel("1. Yatak Odası", "en")).toBe("Bedroom 1");
    expect(getBedroomNameLabel("3. Yatak Odası", "en")).toBe("Bedroom 3");
    expect(getBedroomNameLabel("2. Yatak Odası", "de")).toBe("Schlafzimmer 2");
    /* Sözlükte olmayan 12. gibi bir numara da çalışır. */
    expect(getBedroomNameLabel("12. Yatak Odası", "en")).toBe("Bedroom 12");
  });

  it("numaralı banyo adı şablondan üretilir (EN/DE)", () => {
    expect(getBathroomNameLabel("1. Banyo", "en")).toBe("Bathroom 1");
    expect(getBathroomNameLabel("2. Banyo", "de")).toBe("Badezimmer 2");
    expect(getBathroomNameLabel("Banyo", "en")).toBe("Bathroom");
  });

  it("🛡️ sözlükte OLMAYAN serbest ad her locale'de AYNEN döner", () => {
    for (const locale of LOCALES) {
      expect(getBedroomNameLabel("Deniz Manzaralı Süit", locale)).toBe(
        "Deniz Manzaralı Süit"
      );
      expect(getBathroomNameLabel("Jakuzili Banyo", locale)).toBe(
        "Jakuzili Banyo"
      );
    }
  });

  it("boş/null/undefined ad → boş string (çağıran numara fallback'i uygular)", () => {
    for (const locale of LOCALES) {
      expect(getBedroomNameLabel("", locale)).toBe("");
      expect(getBedroomNameLabel("   ", locale)).toBe("");
      expect(getBedroomNameLabel(null, locale)).toBe("");
      expect(getBedroomNameLabel(undefined, locale)).toBe("");
      expect(getBathroomNameLabel(null, locale)).toBe("");
    }
  });

  it("baştaki/sondaki boşluk trim edilir", () => {
    expect(getBedroomNameLabel("  Ana Yatak Odası  ", "en")).toBe(
      "Master Bedroom"
    );
    expect(getBathroomNameLabel("  1. Banyo ", "en")).toBe("Bathroom 1");
  });

  it("geçersiz numara biçimi sözlüğe/TR'ye düşer, crash etmez", () => {
    expect(getBedroomNameLabel("0. Yatak Odası", "en")).toBe("0. Yatak Odası");
    expect(getBedroomNameLabel("A. Yatak Odası", "en")).toBe("A. Yatak Odası");
    expect(() => getBedroomNameLabel("1. Bilinmeyen", "en")).not.toThrow();
    expect(getBedroomNameLabel("1. Bilinmeyen", "en")).toBe("1. Bilinmeyen");
  });

  it("dictionary roomNameLabels üç locale'de de aynı key kümesine sahip", () => {
    const trKeys = Object.keys(getDictionary("tr").roomNameLabels).sort();
    expect(Object.keys(getDictionary("en").roomNameLabels).sort()).toEqual(
      trKeys
    );
    expect(Object.keys(getDictionary("de").roomNameLabels).sort()).toEqual(
      trKeys
    );
    expect(trKeys.length).toBeGreaterThan(0);
  });
});
