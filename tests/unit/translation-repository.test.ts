/* ===============================================================
   🛡️ PHASE 3 / 8D-1 — DATABASE TRANSLATION ARCHITECTURE: REPOSITORY TESTS
   ===============================================================
   Hedef: lib/i18n/translations.types.ts (TRANSLATION_ENTITY_CONFIG)
          lib/db/translation.repository.server.ts (translationRepository
          — findOne/findAllForParent Phase 3, findManyForLocale Phase 8D-1)

   DB bağlantısı KULLANILMAZ — `lib/db/native`'in `dbNative.from()`
   çağrısı mock'lanır, yalnız DOĞRU tablo/kolon adlarıyla
   çağrıldığı doğrulanır (aynı desen: bu projede repository
   testleri de gerçek DB yerine repository/provider mock'lar —
   bkz. discount-collection service testleri).

   🛡️ PHASE 8D-1: mock chain'e `in()` eklendi (yalnız EKLEME —
   `findOne`/`findAllForParent` testleri `.in()` hiç çağırmadığı için
   ETKİLENMEZ). `findManyForLocale` bu fazda hiçbir call-site
   tarafından KULLANILMIYOR — testler yalnız repository/query-wiring
   doğruluğunu kanıtlıyor.

   Mevcut price-engine / discount / pool-heating / reservation
   testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TRANSLATION_ENTITY_CONFIG,
  type TranslationEntity,
} from "@/lib/i18n/translations.types";

/* ---------------- ENTITY_CONFIG — statik registry doğrulaması ---------------- */

/* 🛡️ PHASE 10I — 9 → 8 entity. `villa_location` registry'den KALDIRILDI:
   bölge adları özel isimdir, çevrilmez. `villa_location_translations`
   TABLOSU migration 082'de DURUYOR (migration geçmişi değiştirilmedi) —
   bu yüzden `tests/unit/translation-schema.test.ts` (migration SQL'ini
   doğrular) DEĞİŞMEDİ; burada test edilen şey KOD REGISTRY'sidir. */
/* 🛡️ MIGRATION 086 — 8 → 9 entity. `menu` EKLENDİ: `/maki-admin/menu`
   üzerinden girilen dinamik menü etiketleri (menu.name) çevrilebilir.
   Şema migration 082'nin desenini birebir izler (menu_id + locale + name). */
/* 🛡️ MIGRATION 088 — 9 → 10 entity. `payment_method` EKLENDİ:
   `/maki-admin/payment-methods` üzerinden girilen ödeme yöntemi adları
   (payment_methods.name) çevrilebilir. Şema migration 082/086 desenini
   birebir izler (payment_method_id + locale + name). */
/* 🛡️ MIGRATION 089 — 10 → 11 entity. `blog_post` EKLENDİ: `/maki-admin/blog`
   üzerinden girilen blog içerikleri (title/body/excerpt/seo_*) çevrilebilir.
   Şema migration 082'nin `page_translations` desenini birebir izler
   (blog_post_id + locale + içerik alanları). `slug` ÇEVRİLMEZ. */
/* 🛡️ MIGRATION 090 — 11 → 10 entity. `villa_distance` registry'den
   KALDIRILDI: villa BAŞINA mesafe çevirisi girme özelliği kaldırıldı,
   mesafe başlıkları artık YALNIZ statik `distanceLabels` dictionary'si
   ile çözülür (`lib/distance-label.helper.ts`).
   `villa_distance_translations` TABLOSU migration 082'de DURUYOR
   (migration geçmişi değiştirilmedi) ve migration 090 ile kaldırılır —
   bu yüzden `tests/unit/translation-schema.test.ts` (migration 082
   SQL'ini doğrular) DEĞİŞMEDİ; burada test edilen şey KOD
   REGISTRY'sidir. `villa_location` (Phase 10I) ile AYNI desen. */
describe("TRANSLATION_ENTITY_CONFIG — 10 tablo, doğru table/parentIdColumn", () => {
  const expected: Record<
    TranslationEntity,
    { table: string; parentIdColumn: string }
  > = {
    villa: { table: "villa_translations", parentIdColumn: "villa_id" },
    villa_type: {
      table: "villa_type_translations",
      parentIdColumn: "type_id",
    },
    villa_feature: {
      table: "villa_feature_translations",
      parentIdColumn: "feature_id",
    },
    rule_item: {
      table: "rule_item_translations",
      parentIdColumn: "rule_id",
    },
    price_include_item: {
      table: "price_include_item_translations",
      parentIdColumn: "include_id",
    },
    blog_post: {
      table: "blog_post_translations",
      parentIdColumn: "blog_post_id",
    },
    page: { table: "page_translations", parentIdColumn: "page_id" },
    faq: { table: "faq_translations", parentIdColumn: "faq_id" },
    menu: { table: "menu_translations", parentIdColumn: "menu_id" },
    payment_method: {
      table: "payment_method_translations",
      parentIdColumn: "payment_method_id",
    },
  };

  it("tam olarak 10 entity içeriyor", () => {
    expect(Object.keys(TRANSLATION_ENTITY_CONFIG)).toHaveLength(10);
  });

  /* 🛡️ PHASE 10I — REGRESYON KİLİDİ: bölge çevirisi geri gelmesin. */
  it("villa_location registry'de YOK — bölge adları çevrilmez", () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        TRANSLATION_ENTITY_CONFIG,
        "villa_location"
      )
    ).toBe(false);
  });

  it.each(Object.entries(expected))(
    "%s → doğru table + parentIdColumn",
    (entity, cfg) => {
      expect(
        TRANSLATION_ENTITY_CONFIG[entity as TranslationEntity]
      ).toEqual(cfg);
    }
  );

  it("rule_item YANLIŞ isimle (villa_rule) YOK — audit düzeltmesi kalıcı", () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        TRANSLATION_ENTITY_CONFIG,
        "villa_rule"
      )
    ).toBe(false);
  });
});

/* ---------------- translationRepository — wiring (mock'lu) ---------------- */

const fromMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();
const maybeSingleMock = vi.fn();
/* 🛡️ PHASE 8D-1 — yalnız findManyForLocale'ın kullandığı `.in()` için. */
const inMock = vi.fn();
/* 🛡️ PHASE 10A — yalnız upsertOne'ın kullandığı `.upsert()` / `.single()` için. */
const upsertMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/lib/db/native", () => ({
  dbNative: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

beforeEach(() => {
  fromMock.mockReset();
  eqMock.mockReset();
  selectMock.mockReset();
  maybeSingleMock.mockReset();
  inMock.mockReset();
  upsertMock.mockReset();
  singleMock.mockReset();

  /* Chainable stub: from() → {select} → {eq} → {eq} → {maybeSingle}
     (Phase 3) / from() → {select} → {in} → {eq} (Phase 8D-1, .then()
     ile resolve edilir — .maybeSingle() ÇAĞRILMAZ, findAllForParent
     ile AYNI "çok satır" deseni). Aynı obje her adımda kendini döner
     (fluent chain simülasyonu). */
  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    selectMock(...args);
    return chain;
  };
  chain.eq = (...args: unknown[]) => {
    eqMock(...args);
    return chain;
  };
  chain.in = (...args: unknown[]) => {
    inMock(...args);
    return chain;
  };
  chain.maybeSingle = (...args: unknown[]) => {
    maybeSingleMock(...args);
    return Promise.resolve({ data: null, error: null });
  };
  /* 🛡️ PHASE 10A — upsertOne: .upsert(...).select("*").single() zinciri.
     .upsert() chain'i kendini döner (fluent); .single() Promise resolve
     eder (findOne'daki .maybeSingle() ile AYNI seviyede stub). */
  chain.upsert = (...args: unknown[]) => {
    upsertMock(...args);
    return chain;
  };
  chain.single = (...args: unknown[]) => {
    singleMock(...args);
    return Promise.resolve({
      data: {
        id: "translation-row-1",
        villa_id: "villa-uuid-1",
        locale: "en",
        title: "Mock Title",
        description: null,
        badge: null,
        seo_title: null,
        seo_description: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    });
  };
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  fromMock.mockReturnValue(chain);
});

describe("translationRepository.findOne", () => {
  it("doğru tablo + parentIdColumn + locale ile db.from(...).eq(...).eq('locale', ...) çağırır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findOne("villa", "villa-uuid-1", "en");

    expect(fromMock).toHaveBeenCalledWith("villa_translations");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(eqMock).toHaveBeenCalledWith("villa_id", "villa-uuid-1");
    expect(eqMock).toHaveBeenCalledWith("locale", "en");
    expect(maybeSingleMock).toHaveBeenCalled();
  });

  it("rule_item entity → rule_item_translations + rule_id kullanır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findOne("rule_item", "rule-uuid-1", "de");

    expect(fromMock).toHaveBeenCalledWith("rule_item_translations");
    expect(eqMock).toHaveBeenCalledWith("rule_id", "rule-uuid-1");
    expect(eqMock).toHaveBeenCalledWith("locale", "de");
  });
});

describe("translationRepository.findAllForParent", () => {
  it("doğru tablo + parentIdColumn ile db.from(...).select('*').eq(...) çağırır (locale filtresi YOK)", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findAllForParent("page", "page-uuid-1");

    expect(fromMock).toHaveBeenCalledWith("page_translations");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(eqMock).toHaveBeenCalledWith("page_id", "page-uuid-1");
    expect(eqMock).not.toHaveBeenCalledWith("locale", expect.anything());
  });
});

/* ===============================================================
   🛡️ PHASE 8D-1 — translationRepository.findManyForLocale
   ===============================================================
   "Birden fazla parent, TEK locale" batch okuma — N+1 önleme
   altyapısı (Phase 8D audit bulgusu). BU FAZDA HİÇBİR call-site
   KULLANMIYOR — yalnız repository/query-wiring doğruluğu test
   ediliyor (findOne/findAllForParent ile AYNI mock seviyesi/desen).
   =============================================================== */
describe("translationRepository.findManyForLocale", () => {
  /* a) doğru entity → doğru translation table
     b) doğru parent ID column ile .in(...)
     c) doğru locale ile .eq(...) */
  it("doğru tablo + parentIdColumn ile .in(...) + doğru locale ile .eq(...) çağırır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findManyForLocale(
      "villa_feature",
      ["feature-uuid-1", "feature-uuid-2"],
      "en"
    );

    expect(fromMock).toHaveBeenCalledWith("villa_feature_translations");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(inMock).toHaveBeenCalledWith("feature_id", [
      "feature-uuid-1",
      "feature-uuid-2",
    ]);
    expect(eqMock).toHaveBeenCalledWith("locale", "en");
    /* .maybeSingle() ÇAĞRILMAZ — findAllForParent ile AYNI "çok satır"
       davranışı, findOne'dan FARKLI. */
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("rule_item entity → rule_item_translations + rule_id + 'de' locale kullanır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.findManyForLocale(
      "rule_item",
      ["rule-uuid-1"],
      "de"
    );

    expect(fromMock).toHaveBeenCalledWith("rule_item_translations");
    expect(inMock).toHaveBeenCalledWith("rule_id", ["rule-uuid-1"]);
    expect(eqMock).toHaveBeenCalledWith("locale", "de");
  });

  /* d) birden fazla parent ID'nin TEK sorguda kullanılması */
  it("N parent ID → TEK db.from() çağrısı (N ayrı sorgu DEĞİL)", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    /* 🛡️ MIGRATION 090 — entity `villa_distance` → `villa_feature`
       olarak değiştirildi (o entity registry'den kaldırıldı). Testin
       AMACI DEĞİŞMEDİ: N parent ID hâlâ TEK `.in()` sorgusuna çevrilir
       (N+1 regresyon guard'ı). */
    await translationRepository.findManyForLocale(
      "villa_feature",
      ["d1", "d2", "d3", "d4", "d5"],
      "en"
    );

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledWith("feature_id", [
      "d1",
      "d2",
      "d3",
      "d4",
      "d5",
    ]);
  });

  /* e) parentIds=[] → DB query YOK, boş sonuç */
  it("parentIds=[] → db.from() HİÇ ÇAĞRILMAZ, { data: [], error: null } döner", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    const result = await translationRepository.findManyForLocale(
      "price_include_item",
      [],
      "en"
    );

    expect(fromMock).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], error: null });
  });

  /* f) mevcut 8 TranslationEntity config'inden mapping doğruluğu —
     TRANSLATION_ENTITY_CONFIG ile AYNI kaynaktan (registry testiyle
     tutarlı, tekrar hardcode edilmedi). */
  it.each(
    Object.entries(TRANSLATION_ENTITY_CONFIG) as Array<
      [TranslationEntity, { table: string; parentIdColumn: string }]
    >
  )(
    "%s entity → config'teki table + parentIdColumn ile çağrılır",
    async (entity, cfg) => {
      const { translationRepository } = await import(
        "@/lib/db/translation.repository.server"
      );

      await translationRepository.findManyForLocale(
        entity,
        ["some-parent-id"],
        "en"
      );

      expect(fromMock).toHaveBeenCalledWith(cfg.table);
      expect(inMock).toHaveBeenCalledWith(cfg.parentIdColumn, [
        "some-parent-id",
      ]);
    }
  );
});


/* ===============================================================
   🛡️ PHASE 10A — translationRepository.upsertOne
   ===============================================================
   Admin Villa Translation UI'nin DB yazma primitive'i. Yalnız
   doğru tablo/parentIdColumn/locale/kolonlar/onConflict ile
   db.from(...).upsert(...).select("*").single() çağrıldığını
   doğrular — iş kuralı (locale whitelist, parent existence, alan
   uzunlukları) BU KATMANDA DEĞİL, app/services/villa-translation
   .service.ts'te test edilir (bkz. villa-translation-service.test.ts).
   findOne/findAllForParent/findManyForLocale testleri ETKİLENMEDİ. */
describe("translationRepository.upsertOne", () => {
  it("villa entity → villa_translations + villa_id + onConflict='villa_id,locale' ile upsert çağrılır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.upsertOne("villa", "villa-uuid-1", "en", {
      title: "Test Villa",
      description: "Açıklama",
      badge: null,
      seo_title: null,
      seo_description: null,
    });

    expect(fromMock).toHaveBeenCalledWith("villa_translations");
    expect(upsertMock).toHaveBeenCalledWith(
      {
        villa_id: "villa-uuid-1",
        locale: "en",
        title: "Test Villa",
        description: "Açıklama",
        badge: null,
        seo_title: null,
        seo_description: null,
      },
      { onConflict: "villa_id,locale" }
    );
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(singleMock).toHaveBeenCalled();
  });

  it("rule_item entity → rule_item_translations + rule_id + onConflict='rule_id,locale' kullanır", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.upsertOne("rule_item", "rule-uuid-1", "de", {
      title: "Regel",
    });

    expect(fromMock).toHaveBeenCalledWith("rule_item_translations");
    expect(upsertMock).toHaveBeenCalledWith(
      { rule_id: "rule-uuid-1", locale: "de", title: "Regel" },
      { onConflict: "rule_id,locale" }
    );
  });

  it("upsertOne'ın çağrısı findOne/findAllForParent/findManyForLocale davranışını DEĞİŞTİRMEZ", async () => {
    const { translationRepository } = await import(
      "@/lib/db/translation.repository.server"
    );

    await translationRepository.upsertOne("villa", "villa-uuid-1", "en", {
      title: "X",
    });
    await translationRepository.findOne("villa", "villa-uuid-1", "en");

    expect(maybeSingleMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("villa_id", "villa-uuid-1");
    expect(eqMock).toHaveBeenCalledWith("locale", "en");
  });
});
