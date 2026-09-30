/* ===============================================================
   🛡️ PHASE 10D BATCH 4 — DISTANCE LABEL HELPER TESTS
   ===============================================================
   Hedef: lib/distance-label.helper.ts (`getTranslatedDistanceLabel`).

   Bu dosya GERÇEK (mock'lanmamış) `DISTANCE_OPTIONS`
   (lib/distance.helper.ts) ve GERÇEK dictionary'leri
   (lib/i18n/dictionaries/{tr,en,de}.ts, lib/i18n/get-dictionary.ts)
   kullanır — helper'ın saf/deterministik davranışı gerçek veriyle
   doğrulanıyor (mock'lu bir "sahte" çeviri katmanıyla değil).

   KAPSAM: Görev tanımının 40 senaryosundan title-çözümleme +
   legacy-fallback + dictionary-tamlığı kısmı (1-36, 39, 40) burada;
   mesafe DEĞERİNİN hiçbir zaman çevrilmediğini doğrulayan senaryolar
   (37, 38) sayfa-entegrasyon seviyesinde
   tests/unit/locale-routes.test.tsx testi #16'da doğrulanıyor (bu
   helper zaten distance DEĞERİNİ hiç parametre olarak almıyor).
=============================================================== */

import { describe, it, expect } from "vitest";
import { getTranslatedDistanceLabel } from "@/lib/distance-label.helper";
import { DISTANCE_OPTIONS } from "@/lib/distance.helper";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

/* 🛡️ Görev tanımının Adım 2/7 örnek eşleme tablosuyla BİREBİR aynı.
   Testin KENDİSİ bu sabit beklenen değerlerle karşılaştırır —
   yalnız "boş değil" gibi zayıf bir kontrol değil, spesifik çeviri
   kararları da regresyona karşı korunuyor. */
const EXPECTED: Record<string, { en: string; de: string }> = {
  Restoran: { en: "Restaurant", de: "Restaurant" },
  Market: { en: "Market", de: "Markt" },
  Plaj: { en: "Beach", de: "Strand" },
  Deniz: { en: "Sea", de: "Meer" },
  "Şehir Merkezi": { en: "City Center", de: "Stadtzentrum" },
  "Havaalanı (Antalya)": {
    en: "Airport (Antalya)",
    de: "Flughafen (Antalya)",
  },
  "Havaalanı (Dalaman)": {
    en: "Airport (Dalaman)",
    de: "Flughafen (Dalaman)",
  },
  "Otobüs Terminali": { en: "Bus Station", de: "Busbahnhof" },
  "Sağlık Merkezi": { en: "Health Center", de: "Gesundheitszentrum" },
  Eczane: { en: "Pharmacy", de: "Apotheke" },
  "Benzin İstasyonu": { en: "Gas Station", de: "Tankstelle" },
  Okul: { en: "School", de: "Schule" },
};

describe("getTranslatedDistanceLabel — canonical title → locale çözümü", () => {
  it("EXPECTED test tablosu DISTANCE_OPTIONS ile birebir senkron (drift koruması)", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...DISTANCE_OPTIONS].sort());
  });

  it.each(DISTANCE_OPTIONS.map((title) => [title] as const))(
    "%s → TR: kendisiyle aynı döner",
    (title) => {
      expect(getTranslatedDistanceLabel(title, "tr")).toBe(title);
    }
  );

  it.each(Object.entries(EXPECTED))(
    "%s → EN/DE beklenen sabit çeviriyle eşleşir",
    (title, expected) => {
      expect(getTranslatedDistanceLabel(title, "en")).toBe(expected.en);
      expect(getTranslatedDistanceLabel(title, "de")).toBe(expected.de);
    }
  );

  it("dictionary'deki 12 canonical title'ın TAMAMININ karşılığı var (tr/en/de)", () => {
    for (const locale of ["tr", "en", "de"] as Locale[]) {
      const dict = getDictionary(locale);
      expect(Object.keys(dict.distanceLabels).sort()).toEqual(
        [...DISTANCE_OPTIONS].sort()
      );
      for (const title of DISTANCE_OPTIONS) {
        expect(
          dict.distanceLabels[title as keyof typeof dict.distanceLabels]
        ).toBeTruthy();
      }
    }
  });
});

describe("getTranslatedDistanceLabel — legacy/custom title fallback", () => {
  it.each(["tr", "en", "de"] as Locale[])(
    "canonical OLMAYAN title locale=%s için DEĞİŞMEDEN döner",
    (locale) => {
      expect(getTranslatedDistanceLabel("Özel Mesafe", locale)).toBe(
        "Özel Mesafe"
      );
      expect(getTranslatedDistanceLabel("Eski Özel Mesafe", locale)).toBe(
        "Eski Özel Mesafe"
      );
      /* 🛡️ Bilinmeyen title'ın dictionary'de YANLIŞLIKLA aranmadığını
         (örn. yarı-eşleşme/başka bir canonical değere düşmediğini)
         de doğrula. */
      expect(getTranslatedDistanceLabel("Migros", locale)).toBe("Migros");
    }
  );

  it("boş/null/undefined title → boş string (çökmez)", () => {
    expect(getTranslatedDistanceLabel("", "en")).toBe("");
    expect(getTranslatedDistanceLabel(null, "en")).toBe("");
    expect(getTranslatedDistanceLabel(undefined, "en")).toBe("");
  });

  it("baştaki/sondaki boşluk trim edilerek canonical title'la eşleşir", () => {
    expect(getTranslatedDistanceLabel("  Restoran  ", "en")).toBe(
      "Restaurant"
    );
  });
});
