/* ===============================================================
   🛡️ PHASE 10L — SETTINGS TRANSLATION REPOSITORY + SERVICE TESTLERİ
   ===============================================================
   Canlı DB YOK — `lib/db/native`'in `dbNative.from()` zinciri
   mock'lanır (`tests/unit/translation-repository.test.ts` ile AYNI
   kanıtlanmış desen).

   KANITLANAN İDDİALAR (§3/§4/§13):
     • Keyfi kolon UPDATE'i mümkün DEĞİL — upsert payload'ı tam olarak
       6 anahtar taşır (settings_id, locale + 4 alan).
     • Keyfi locale mümkün DEĞİL — "tr"/"fr"/"" reddedilir.
     • Boş/whitespace → null (public tarafta TR canonical'e düşsün).
     • Uzunluk limitleri.
     • `settings_id` DIŞARIDAN GELMEZ — server tarafında çözülür.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ---------------- native db mock ---------------- */
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const inMock = vi.fn();
const upsertMock = vi.fn();
const singleMock = vi.fn();
const maybeSingleMock = vi.fn();
const deleteMock = vi.fn();

let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let maybeSingleResult: { data: unknown; error: unknown } = {
  data: { id: "settings-1" },
  error: null,
};
let singleResult: { data: unknown; error: unknown } = { data: null, error: null };

function makeChain() {
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
  chain.upsert = (...args: unknown[]) => {
    upsertMock(...args);
    return chain;
  };
  chain.delete = (...args: unknown[]) => {
    deleteMock(...args);
    return chain;
  };
  chain.single = () => {
    singleMock();
    return Promise.resolve(singleResult);
  };
  chain.maybeSingle = () => {
    maybeSingleMock();
    return Promise.resolve(maybeSingleResult);
  };
  /* Terminal olmayan zincir `await` edilirse (findAllForSettings) */
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(selectResult).then(resolve, reject);
  return chain;
}

vi.mock("@/lib/db/native", () => ({
  dbNative: {
    from: (...args: unknown[]) => {
      fromMock(...args);
      return makeChain();
    },
  },
  dbAdminNative: {
    from: (...args: unknown[]) => {
      fromMock(...args);
      return makeChain();
    },
  },
}));

import { settingsTranslationRepository } from "@/lib/db/settings-translation.repository.server";
import {
  upsertSettingsTranslation,
  getSettingsTranslations,
  deleteSettingsTranslation,
  getPublicSettingsTranslations,
} from "@/app/services/settings-translation.service";
import {
  SETTINGS_TRANSLATABLE_FIELDS,
  SETTINGS_TRANSLATION_MAX_LEN,
  isSettingsTranslationLocale,
  isSettingsTranslatableField,
} from "@/lib/i18n/settings-translations.types";

const OK_ROW = {
  id: "row-1",
  settings_id: "settings-1",
  locale: "en",
  footer_copyright: "© {year} {site_name} · All rights reserved",
  default_meta_title: null,
  default_meta_description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = { data: [], error: null };
  maybeSingleResult = { data: { id: "settings-1" }, error: null };
  singleResult = { data: OK_ROW, error: null };
});

/* ================= 1) TİP/REGİSTRY ================= */

describe("settings-translations.types — whitelist", () => {
  /* 🛡️ MIGRATION 087 — 8 → 9 alan. `business_hours` EKLENDİ:
     `/iletisim` EN/DE sürümü devreye alındı, "Çalışma Saatleri"
     serbest metni artık dile göre çözülüyor. */
  it("1) TAM OLARAK 9 çevrilebilir alan (10M: bakım mesajı YOK · 11: hero VAR · 087: business_hours VAR)", () => {
    expect([...SETTINGS_TRANSLATABLE_FIELDS]).toEqual([
      "footer_copyright",
      "default_meta_title",
      "default_meta_description",
      "hero_title",
      "hero_subtitle",
      "hero_badge_text",
      "hero_primary_cta_text",
      "hero_secondary_cta_text",
      "business_hours",
    ]);
  });

  it("1c) `business_hours` whitelist'te; adres/telefon/e-posta ASLA girmez", () => {
    expect(isSettingsTranslatableField("business_hours")).toBe(true);
    /* VERİ alanları — her dilde aynı kalır. */
    for (const field of ["address", "phone", "email", "whatsapp_link", "instagram"]) {
      expect(isSettingsTranslatableField(field)).toBe(false);
    }
  });

  it("1b) DİL BAĞIMSIZ hero alanları whitelist'e ASLA girmez", () => {
    /* CTA href'leri sayfa-içi anchor; hero görseli görsel — çevrilmez. */
    for (const field of [
      "hero_primary_cta_href",
      "hero_secondary_cta_href",
      "hero_background_image",
      "hero_enabled",
      "hero_overlay_opacity",
    ]) {
      expect(isSettingsTranslatableField(field)).toBe(false);
    }
  });

  it("2) kapsam dışı alanlar whitelist'te YOK", () => {
    for (const field of [
      /* 🛡️ PHASE 10M — bakım mesajı artık çeviri kapsamında DEĞİL. */
      "maintenance_message",
      /* 🛡️ PHASE 11 — hero METİNLERİ kapsama girdi; ama HREF/görsel
         alanları ve teknik hero ayarları HÂLÂ kapsam DIŞI. */
      "hero_primary_cta_href",
      "hero_background_image",
      /* 🛡️ MIGRATION 087 — `business_hours` ARTIK kapsam İÇİNDE
         (bkz. test 1c); bu listeden çıkarıldı. */
      "address",
      "site_name",
      "resend_api_key",
      "mail_from",
    ]) {
      expect(isSettingsTranslatableField(field)).toBe(false);
    }
  });

  it("3) locale guard — yalnız en/de", () => {
    expect(isSettingsTranslationLocale("en")).toBe(true);
    expect(isSettingsTranslationLocale("de")).toBe(true);
    expect(isSettingsTranslationLocale("tr")).toBe(false);
    expect(isSettingsTranslationLocale("fr")).toBe(false);
    expect(isSettingsTranslationLocale("")).toBe(false);
    expect(isSettingsTranslationLocale(null)).toBe(false);
  });

  it("4) her alan için uzunluk limiti tanımlı", () => {
    for (const field of SETTINGS_TRANSLATABLE_FIELDS) {
      expect(SETTINGS_TRANSLATION_MAX_LEN[field]).toBeGreaterThan(0);
    }
  });
});

/* ================= 2) REPOSITORY ================= */

describe("settingsTranslationRepository — query wiring", () => {
  it("5) doğru tabloya gider", async () => {
    await settingsTranslationRepository.findAllForSettings("settings-1");
    expect(fromMock).toHaveBeenCalledWith("settings_translations");
  });

  it("6) upsertOne payload'ı TAM OLARAK 11 anahtar taşır (keyfi kolon İMKÂNSIZ)", async () => {
    await settingsTranslationRepository.upsertOne("settings-1", "en", {
      footer_copyright: "A",
      default_meta_title: "C",
      default_meta_description: "D",
      hero_title: "T",
      hero_subtitle: "S",
      hero_badge_text: "B",
      hero_primary_cta_text: "P",
      hero_secondary_cta_text: "Q",
      business_hours: null,
    });

    const [payload, options] = upsertMock.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(Object.keys(payload).sort()).toEqual(
      [
        "default_meta_description",
        "default_meta_title",
        "footer_copyright",
        "locale",
        "settings_id",
        "hero_title",
        "hero_subtitle",
        "hero_badge_text",
        "hero_primary_cta_text",
        "hero_secondary_cta_text",
        "business_hours",
      ].sort()
    );
    expect(options).toEqual({ onConflict: "settings_id,locale" });
  });

  it("7) upsertOne fazladan alanı SQL'e TAŞIMAZ (spread YOK)", async () => {
    await settingsTranslationRepository.upsertOne("settings-1", "de", {
      footer_copyright: "A",
      default_meta_title: null,
      default_meta_description: null,
      /* @ts-expect-error — tip seviyesinde de reddedilir; runtime kanıtı: */
      resend_api_key: "SECRET",
      site_name: "HACK",
    });

    const [payload] = upsertMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload).not.toHaveProperty("resend_api_key");
    expect(payload).not.toHaveProperty("site_name");
  });

  it("8) deleteOne settings_id + locale ile sınırlı", async () => {
    await settingsTranslationRepository.deleteOne("settings-1", "en");
    expect(deleteMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("settings_id", "settings-1");
    expect(eqMock).toHaveBeenCalledWith("locale", "en");
  });
});

/* ================= 3) SERVICE — locale whitelist ================= */

describe("upsertSettingsTranslation — locale whitelist", () => {
  it("9) 'tr' REDDEDİLİR, DB'ye HİÇ gidilmez", async () => {
    const result = await upsertSettingsTranslation({
      locale: "tr",
      footer_copyright: "TR yazma denemesi",
    });
    expect(result.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("10) bilinmeyen locale ('fr', '', null) reddedilir", async () => {
    for (const locale of ["fr", "", "EN", "en-US"]) {
      const result = await upsertSettingsTranslation({ locale });
      expect(result.ok).toBe(false);
    }
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("11) 'en' ve 'de' kabul edilir", async () => {
    for (const locale of ["en", "de"]) {
      const result = await upsertSettingsTranslation({
        locale,
        footer_copyright: "X",
      });
      expect(result.ok).toBe(true);
    }
  });
});

/* ================= 4) SERVICE — alan whitelist + normalize ================= */

describe("upsertSettingsTranslation — alan whitelist ve normalizasyon", () => {
  it("12) whitelist dışı alanlar payload'a HİÇ girmez", async () => {
    await upsertSettingsTranslation({
      locale: "en",
      footer_copyright: "OK",
      /* @ts-expect-error — kasıtlı: runtime'da da yok sayılmalı */
      resend_api_key: "SECRET",
      site_name: "HACK",
      hero_background_image: "https://evil.example/x.png",
      id: "another-settings-row",
      settings_id: "attacker-controlled",
    });

    const [payload] = upsertMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.settings_id).toBe("settings-1"); // server tarafında çözüldü
    expect(payload).not.toHaveProperty("resend_api_key");
    expect(payload).not.toHaveProperty("site_name");
    expect(payload).not.toHaveProperty("hero_background_image");
    expect(payload).not.toHaveProperty("id");
  });

  it("13) boş / whitespace değer → null (TR canonical fallback tetiklensin)", async () => {
    await upsertSettingsTranslation({
      locale: "en",
      footer_copyright: "   ",
      default_meta_title: undefined,
      default_meta_description: null,
    });

    const [payload] = upsertMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.footer_copyright).toBeNull();
    expect(payload.default_meta_title).toBeNull();
    expect(payload.default_meta_description).toBeNull();
  });

  it("14) değerler trim edilir", async () => {
    await upsertSettingsTranslation({
      locale: "de",
      footer_copyright: "  © {year} {site_name}  ",
    });
    const [payload] = upsertMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.footer_copyright).toBe("© {year} {site_name}");
  });

  it("15) uzunluk limiti aşılırsa REDDEDİLİR ve DB'ye gidilmez", async () => {
    const tooLong = "x".repeat(
      SETTINGS_TRANSLATION_MAX_LEN.default_meta_title + 1
    );
    const result = await upsertSettingsTranslation({
      locale: "en",
      default_meta_title: tooLong,
    });
    expect(result.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("16) limit SINIRINDA kabul edilir", async () => {
    const exact = "x".repeat(SETTINGS_TRANSLATION_MAX_LEN.default_meta_title);
    const result = await upsertSettingsTranslation({
      locale: "en",
      default_meta_title: exact,
    });
    expect(result.ok).toBe(true);
  });

  it("17) settings satırı yoksa yazma yapılmaz", async () => {
    maybeSingleResult = { data: null, error: null };
    const result = await upsertSettingsTranslation({
      locale: "en",
      footer_copyright: "X",
    });
    expect(result.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

/* ================= 5) SERVICE — okuma ================= */

describe("getSettingsTranslations / getPublicSettingsTranslations", () => {
  it("18) satırlar locale'e göre haritalanır; YALNIZ 4 alan döner", async () => {
    selectResult = {
      data: [
        { ...OK_ROW, locale: "en" },
        { ...OK_ROW, id: "row-2", locale: "de", footer_copyright: "DE" },
      ],
      error: null,
    };

    const result = await getSettingsTranslations();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.translations).sort()).toEqual(["de", "en"]);
    expect(Object.keys(result.translations.en!).sort()).toEqual(
      [...SETTINGS_TRANSLATABLE_FIELDS].sort()
    );
    /* id / settings_id / timestamp DIŞARI ÇIKMAZ */
    expect(result.translations.en).not.toHaveProperty("id");
    expect(result.translations.en).not.toHaveProperty("settings_id");
    expect(result.translations.en).not.toHaveProperty("updated_at");
  });

  it("19) geçersiz locale taşıyan satır (savunmacı) YOK SAYILIR", async () => {
    selectResult = {
      data: [
        { ...OK_ROW, locale: "tr" },
        { ...OK_ROW, id: "row-3", locale: "en" },
      ],
      error: null,
    };
    const result = await getSettingsTranslations();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.translations).not.toHaveProperty("tr");
    expect(result.translations).toHaveProperty("en");
  });

  it("20) public okuma — satır yoksa null (TR canonical'e düşülür)", async () => {
    selectResult = { data: [], error: null };
    expect(await getPublicSettingsTranslations("settings-1")).toBeNull();
  });

  it("21) public okuma — DB hatası null döner (public site çökmez)", async () => {
    selectResult = { data: null, error: { message: "boom" } };
    expect(await getPublicSettingsTranslations("settings-1")).toBeNull();
  });
});

/* ================= 6) SERVICE — silme ================= */

describe("deleteSettingsTranslation", () => {
  it("22) 'tr' silme denemesi reddedilir", async () => {
    const result = await deleteSettingsTranslation("tr");
    expect(result.ok).toBe(false);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("23) 'en' silinir", async () => {
    selectResult = { data: null, error: null };
    const result = await deleteSettingsTranslation("en");
    expect(result.ok).toBe(true);
    expect(deleteMock).toHaveBeenCalled();
  });
});
