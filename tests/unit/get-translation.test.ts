/* ===============================================================
   🛡️ PHASE 5 / 8D-1 — TRANSLATION READ LAYER: TESTLER
   ===============================================================
   Hedef: lib/i18n/get-translation.server.ts (getTranslation,
   resolveTranslatedField, isTranslationEntity — Phase 5;
   getTranslationsForParents — Phase 8D-1)

   `translationRepository` (Phase 3) mock'lanır — GERÇEK DB'YE HİÇ
   DOKUNULMAZ, production translation tabloları (şu an boş olabilir)
   bu testten ETKİLENMEZ/TEST VERİSİ YAZILMAZ. Aynı desen: Phase 3'ün
   translation-repository.test.ts'i (db seviyesinde), burada bir
   katman yukarıda — translationRepository'nin KENDİSİ mock'lanıyor,
   böylece "getTranslation doğru parent/locale ile findOne'ı çağırıyor
   mu" ayrı ve net test edilir (repository'nin kendi DB wiring'i zaten
   Phase 3'te test edili — burada TEKRAR EDİLMEZ).

   🛡️ PHASE 8D-1: mock factory'ye `findManyForLocale` eklendi (yalnız
   EKLEME — mevcut `findOne` mock'u/testleri ETKİLENMEZ).
   `getTranslationsForParents`'ın BU FAZDA HİÇBİR call-site'ı YOK —
   testler yalnız fonksiyonun kendi doğruluğunu kanıtlıyor.

   Mevcut price-engine / discount / pool-heating / reservation / TR
   route / Phase 1B-2-4A-4B testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  getTranslation,
  resolveTranslatedField,
  isTranslationEntity,
  getTranslationsForParents,
} from "@/lib/i18n/get-translation.server";

const findOneMock = vi.fn();
/* 🛡️ PHASE 8D-1 — yalnız getTranslationsForParents'ın kullandığı. */
const findManyForLocaleMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findOne: (...args: unknown[]) => findOneMock(...args),
    findManyForLocale: (...args: unknown[]) =>
      findManyForLocaleMock(...args),
  },
}));

beforeEach(() => {
  findOneMock.mockReset();
  findManyForLocaleMock.mockReset();
});

const enVillaRow = {
  id: "t-en-1",
  villa_id: "villa-uuid-1",
  locale: "en" as const,
  title: "Villa In Love",
  description: null,
  badge: null,
  seo_title: null,
  seo_description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const deVillaRow = {
  ...enVillaRow,
  id: "t-de-1",
  locale: "de" as const,
  title: "Villa Verliebt",
};

describe("getTranslation", () => {
  /* --- 1) TR locale --- */
  it("1) locale='tr' → findOne HİÇ ÇAĞRILMAZ, null döner (TR için gereksiz DB bağımlılığı yok)", async () => {
    const result = await getTranslation("villa", "villa-uuid-1", "tr");
    expect(result).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  /* --- 2) EN + mevcut --- */
  it("2) locale='en' + çeviri mevcut → satırın TAMAMINI döner", async () => {
    findOneMock.mockResolvedValue({ data: enVillaRow, error: null });
    const result = await getTranslation("villa", "villa-uuid-1", "en");
    expect(result).toEqual(enVillaRow);
  });

  /* --- 3) DE + mevcut --- */
  it("3) locale='de' + çeviri mevcut → satırın TAMAMINI döner", async () => {
    findOneMock.mockResolvedValue({ data: deVillaRow, error: null });
    const result = await getTranslation("villa", "villa-uuid-1", "de");
    expect(result).toEqual(deVillaRow);
  });

  /* --- 4) EN yok --- */
  it("4) locale='en' + çeviri YOK (0 satır) → null döner", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const result = await getTranslation("villa", "villa-uuid-2", "en");
    expect(result).toBeNull();
  });

  /* --- 5) DE yok --- */
  it("5) locale='de' + çeviri YOK (0 satır) → null döner", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const result = await getTranslation("villa", "villa-uuid-2", "de");
    expect(result).toBeNull();
  });

  /* --- 6) Geçersiz locale --- */
  it("6) geçersiz locale ('fr') → toLocale ile 'tr'ye düşer, findOne ÇAĞRILMAZ, null döner", async () => {
    const result = await getTranslation(
      "villa",
      "villa-uuid-1",
      // @ts-expect-error kasıtlı geçersiz locale — runtime güvenliği test edilir
      "fr"
    );
    expect(result).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  /* --- 7) Geçersiz entity --- */
  it("7) geçersiz entity ('villa_rule' — audit'in yanlış ismi) → findOne ÇAĞRILMAZ, null döner", async () => {
    const result = await getTranslation(
      // @ts-expect-error kasıtlı geçersiz entity — runtime güvenliği test edilir
      "villa_rule",
      "rule-uuid-1",
      "en"
    );
    expect(result).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  /* --- 8) Doğru parent/locale sorgusu --- */
  it("8) findOne DOĞRU (entity, parentId, resolvedLocale) argümanlarıyla çağrılır", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    await getTranslation("rule_item", "rule-uuid-9", "de");
    expect(findOneMock).toHaveBeenCalledTimes(1);
    expect(findOneMock).toHaveBeenCalledWith("rule_item", "rule-uuid-9", "de");
  });

  /* --- 9) Boş tablo / tüm entity'ler güvenli ---
     🛡️ PHASE 10I — 9 → 8 entity: `villa_location` registry'den kaldırıldı
     (bölge adları özel isimdir, çevrilmez). Liste daraltıldı, test
     mantığı/assertion'ları DEĞİŞMEDİ.
     🛡️ MIGRATION 090 — 8 → 7 entity: `villa_distance` registry'den
     kaldırıldı (villa başına mesafe çevirisi özelliği kaldırıldı;
     mesafe başlıkları statik `distanceLabels` dictionary'sinden
     çözülür). Liste yine yalnız DARALTILDI; test mantığı/assertion'ları
     DEĞİŞMEDİ. */
  it("9) translation tablosu boşken (data:null,error:null) 7 entity'nin TAMAMI için güvenli null döner", async () => {
    findOneMock.mockResolvedValue({ data: null, error: null });
    const entities = [
      "villa",
      "villa_type",
      "villa_feature",
      "rule_item",
      "price_include_item",
      "page",
      "faq",
    ] as const;

    for (const entity of entities) {
      const result = await getTranslation(entity, "some-parent-id", "en");
      expect(result).toBeNull();
    }
    expect(findOneMock).toHaveBeenCalledTimes(entities.length);
  });

  /* --- Ek: DB hatası --- */
  it("DB hatası dönerse (error != null) exception FIRLATMADAN null döner", async () => {
    findOneMock.mockResolvedValue({
      data: null,
      error: { message: "connection lost" },
    });
    await expect(
      getTranslation("villa", "villa-uuid-1", "en")
    ).resolves.toBeNull();
  });

  /* --- Ek: boş parentId --- */
  it("boş parentId → findOne ÇAĞRILMAZ, null döner", async () => {
    const result = await getTranslation("villa", "", "en");
    expect(result).toBeNull();
    expect(findOneMock).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   🛡️ PHASE 8D-1 — getTranslationsForParents
   ===============================================================
   `translationRepository.findManyForLocale` mock'lanır (`findOne` ile
   AYNI mock seviyesi/desen) — GERÇEK DB'YE HİÇ DOKUNULMAZ. Bu
   fonksiyonun BUGÜN HİÇBİR call-site'ı YOK (Phase 8D audit — EN/DE
   villa detail'e location/features/rules/priceIncludes/distances BU
   FAZDA EKLENMEDİ); testler yalnız fonksiyonun kendi sözleşmesini
   (TR kısayolu, boş parentIds, hata güvenliği, Map inşası) kanıtlıyor.
   =============================================================== */
const featureRowA = {
  id: "tf-1",
  feature_id: "feature-uuid-1",
  locale: "en" as const,
  name: "Sea view",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};
const featureRowB = {
  id: "tf-2",
  feature_id: "feature-uuid-2",
  locale: "en" as const,
  name: "Private pool",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};
const featureRowDe = {
  ...featureRowA,
  id: "tf-1-de",
  locale: "de" as const,
  name: "Meerblick",
};

describe("getTranslationsForParents", () => {
  /* a) locale='tr' → repository çağrısı yok + empty Map */
  it("a) locale='tr' → findManyForLocale HİÇ ÇAĞRILMAZ, boş Map döner", async () => {
    const result = await getTranslationsForParents(
      "villa_feature",
      ["feature-uuid-1", "feature-uuid-2"],
      "tr"
    );
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });

  /* b) empty parentIds → repository çağrısı yok + empty Map */
  it("b) parentIds=[] → findManyForLocale HİÇ ÇAĞRILMAZ, boş Map döner", async () => {
    const result = await getTranslationsForParents(
      "villa_feature",
      [],
      "en"
    );
    expect(result.size).toBe(0);
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });

  /* c) EN başarılı sonuç → Map doğru parentId'lerle oluşuyor */
  it("c) locale='en' + çeviri satırları mevcut → Map, feature_id'leri key olarak kullanır", async () => {
    findManyForLocaleMock.mockResolvedValue({
      data: [featureRowA, featureRowB],
      error: null,
    });
    const result = await getTranslationsForParents(
      "villa_feature",
      ["feature-uuid-1", "feature-uuid-2"],
      "en"
    );
    expect(result.size).toBe(2);
    expect(result.get("feature-uuid-1")).toEqual(featureRowA);
    expect(result.get("feature-uuid-2")).toEqual(featureRowB);
  });

  /* d) DE başarılı sonuç → Map doğru parentId'lerle oluşuyor */
  it("d) locale='de' + çeviri satırı mevcut → Map, feature_id'yi key olarak kullanır", async () => {
    findManyForLocaleMock.mockResolvedValue({
      data: [featureRowDe],
      error: null,
    });
    const result = await getTranslationsForParents(
      "villa_feature",
      ["feature-uuid-1"],
      "de"
    );
    expect(result.size).toBe(1);
    expect(result.get("feature-uuid-1")).toEqual(featureRowDe);
  });

  /* e) missing translation row → ilgili parent Map'te yok */
  it("e) istenen parentIds'ten biri için çeviri satırı YOK → o parentId Map'te YOK (diğerleri VAR)", async () => {
    findManyForLocaleMock.mockResolvedValue({
      data: [featureRowA],
      error: null,
    });
    const result = await getTranslationsForParents(
      "villa_feature",
      ["feature-uuid-1", "feature-uuid-99"],
      "en"
    );
    expect(result.size).toBe(1);
    expect(result.has("feature-uuid-1")).toBe(true);
    expect(result.has("feature-uuid-99")).toBe(false);
    expect(result.get("feature-uuid-99")).toBeUndefined();
  });

  /* f) repository/DB error → throw yok + empty Map */
  it("f) repository hata dönerse → exception FIRLATMADAN boş Map döner", async () => {
    findManyForLocaleMock.mockResolvedValue({
      data: null,
      error: { message: "connection lost" },
    });
    await expect(
      getTranslationsForParents("rule_item", ["rule-uuid-1"], "en")
    ).resolves.toEqual(new Map());
  });

  /* g) birden fazla parent'ın aynı çağrıda doğru şekilde Map'e dönüştürülmesi
     — farklı bir entity (rule_item → rule_id) ile TEKRARLANARAK, Map
     anahtarının entity'ye göre DOĞRU dinamik kolonu kullandığı da
     dolaylı doğrulanıyor. */
  it("g) 3 parent ID, TEK çağrıda TAMAMI doğru şekilde Map'e dönüştürülür (rule_item → rule_id)", async () => {
    const ruleRow1 = {
      id: "tr-1",
      rule_id: "rule-uuid-1",
      locale: "en" as const,
      title: "No smoking",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const ruleRow2 = {
      id: "tr-2",
      rule_id: "rule-uuid-2",
      locale: "en" as const,
      title: "No pets",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const ruleRow3 = {
      id: "tr-3",
      rule_id: "rule-uuid-3",
      locale: "en" as const,
      title: "No parties",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    findManyForLocaleMock.mockResolvedValue({
      data: [ruleRow1, ruleRow2, ruleRow3],
      error: null,
    });

    const result = await getTranslationsForParents(
      "rule_item",
      ["rule-uuid-1", "rule-uuid-2", "rule-uuid-3"],
      "en"
    );

    expect(findManyForLocaleMock).toHaveBeenCalledTimes(1);
    expect(findManyForLocaleMock).toHaveBeenCalledWith(
      "rule_item",
      ["rule-uuid-1", "rule-uuid-2", "rule-uuid-3"],
      "en"
    );
    expect(result.size).toBe(3);
    expect(result.get("rule-uuid-1")).toEqual(ruleRow1);
    expect(result.get("rule-uuid-2")).toEqual(ruleRow2);
    expect(result.get("rule-uuid-3")).toEqual(ruleRow3);
  });

  it("geçersiz entity → findManyForLocale ÇAĞRILMAZ, boş Map döner", async () => {
    const result = await getTranslationsForParents(
      // @ts-expect-error kasıtlı geçersiz entity — runtime güvenliği test edilir
      "villa_rule",
      ["rule-uuid-1"],
      "en"
    );
    expect(result.size).toBe(0);
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });

  it("geçersiz locale ('fr') → toLocale ile 'tr'ye düşer, findManyForLocale ÇAĞRILMAZ, boş Map döner", async () => {
    const result = await getTranslationsForParents(
      "villa_feature",
      ["feature-uuid-1"],
      // @ts-expect-error kasıtlı geçersiz locale — runtime güvenliği test edilir
      "fr"
    );
    expect(result.size).toBe(0);
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });
});

describe("isTranslationEntity", () => {
  it("bilinen entity'ler için true döner", () => {
    expect(isTranslationEntity("villa")).toBe(true);
    expect(isTranslationEntity("faq")).toBe(true);
  });

  it("bilinmeyen/geçersiz değerler için false döner", () => {
    expect(isTranslationEntity("villa_rule")).toBe(false);
    expect(isTranslationEntity("")).toBe(false);
    expect(isTranslationEntity(null)).toBe(false);
    expect(isTranslationEntity(42)).toBe(false);
  });
});

describe("resolveTranslatedField", () => {
  it("çeviri değeri dolu bir string'se onu döner", () => {
    expect(resolveTranslatedField("Villa In Love", "Villa Aşkım")).toBe(
      "Villa In Love"
    );
  });

  it("çeviri null ise parent değerine düşer", () => {
    expect(resolveTranslatedField(null, "Villa Aşkım")).toBe("Villa Aşkım");
  });

  it("çeviri undefined ise parent değerine düşer", () => {
    expect(resolveTranslatedField(undefined, "Villa Aşkım")).toBe(
      "Villa Aşkım"
    );
  });

  it("çeviri boş string ise parent değerine düşer", () => {
    expect(resolveTranslatedField("", "Villa Aşkım")).toBe("Villa Aşkım");
  });

  it("çeviri yalnız boşluk karakterlerinden oluşuyorsa parent değerine düşer", () => {
    expect(resolveTranslatedField("   ", "Villa Aşkım")).toBe("Villa Aşkım");
  });

  it("parent değeri de null olabilir (generic T korunur)", () => {
    expect(resolveTranslatedField(null, null)).toBeNull();
  });

  it("dolu çeviri KIRPILMADAN (trim edilmeden) aynen döner", () => {
    expect(resolveTranslatedField("  Villa In Love  ", "fallback")).toBe(
      "  Villa In Love  "
    );
  });
});
