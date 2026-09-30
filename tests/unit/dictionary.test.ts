/* ===============================================================
   🛡️ PHASE 2 — UI TRANSLATION DICTIONARY CORE TESTS
   ===============================================================
   Hedef: lib/i18n/get-dictionary.ts + lib/i18n/dictionaries/{tr,en,de}.ts
     • üç dictionary yükleniyor
     • üç dictionary aynı key yapısına sahip (deep structural check)
     • kritik common/header/footer/booking key'leri mevcut
     • getDictionary() locale çözümlemesi (tr/en/de/unsupported/null/
       undefined) resolveLocale ile tutarlı

   price-engine / discount / pool-heating / reservation testlerine
   HİÇ dokunulmadı (regresyon: Phase 2 raporunda ayrıca doğrulandı).
=============================================================== */

import { describe, it, expect } from "vitest";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";
import type { Dictionary } from "@/lib/i18n/dictionaries/types";

/** İki nesnenin (herhangi bir derinlikte) BİREBİR aynı key kümesine
 *  sahip olup olmadığını recursive kontrol eder. Değerlerin kendisini
 *  DEĞİL, yalnız key YAPISINI karşılaştırır (çeviri metinleri farklı
 *  olmalı zaten — TR/EN/DE). */
function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (
    obj === null ||
    typeof obj !== "object" ||
    Array.isArray(obj)
  ) {
    return [prefix];
  }
  const record = obj as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .flatMap((key) =>
      collectKeyPaths(record[key], prefix ? `${prefix}.${key}` : key)
    );
}

describe("Dictionary — TR/EN/DE yükleniyor", () => {
  it("TR dictionary yükleniyor ve obje döner", () => {
    expect(tr).toBeTruthy();
    expect(typeof tr).toBe("object");
  });

  it("EN dictionary yükleniyor ve obje döner", () => {
    expect(en).toBeTruthy();
    expect(typeof en).toBe("object");
  });

  it("DE dictionary yükleniyor ve obje döner", () => {
    expect(de).toBeTruthy();
    expect(typeof de).toBe("object");
  });
});

describe("Dictionary — üç dictionary aynı key yapısına sahip (eksik key yok)", () => {
  const trKeys = collectKeyPaths(tr);
  const enKeys = collectKeyPaths(en);
  const deKeys = collectKeyPaths(de);

  it("TR key sayısı sıfır değil (sanity)", () => {
    expect(trKeys.length).toBeGreaterThan(0);
  });

  it("EN key yapısı TR ile birebir aynı", () => {
    expect(enKeys).toEqual(trKeys);
  });

  it("DE key yapısı TR ile birebir aynı", () => {
    expect(deKeys).toEqual(trKeys);
  });

  it("hiçbir dictionary'de boş string değer yok (sessiz undefined/boş render riski)", () => {
    for (const dict of [tr, en, de]) {
      for (const path of collectKeyPaths(dict)) {
        const value = path
          .split(".")
          .reduce<unknown>(
            (acc, key) => (acc as Record<string, unknown>)?.[key],
            dict
          );
        /* 🛡️ PHASE 10B — `availability.weekdayShort` gibi bazı dictionary
           key'leri artık ARRAY (7 hafta günü kısaltması) — `collectKeyPaths`
           yukarıda (dosya-üstü yorum) array'leri BİLEREK leaf olarak
           (tek path) ele alıyor, elemanlarına inmiyor. Bu yüzden buradaki
           "boş değer yok" kontrolü de İKİ ŞEKLİ desteklemeli: scalar
           string (eski/mevcut TÜM key'ler) VE string[] (yeni array
           key'ler) — her iki durumda da HİÇBİR eleman boş/undefined
           olmamalı. Scalar path'ler için davranış BİREBİR ESKİSİYLE aynı. */
        if (Array.isArray(value)) {
          expect(value.length).toBeGreaterThan(0);
          for (const item of value) {
            expect(typeof item).toBe("string");
            expect((item as string).length).toBeGreaterThan(0);
          }
          continue;
        }
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Dictionary — kritik common/header/footer/booking key'leri mevcut", () => {
  const requiredPaths: Array<(d: Dictionary) => string> = [
    (d) => d.common.search,
    (d) => d.common.loading,
    (d) => d.header.offer,
    (d) => d.header.menuOpen,
    (d) => d.header.menuClose,
    (d) => d.footer.explore,
    (d) => d.footer.checkReservation,
    (d) => d.booking.discountedTotal,
    (d) => d.booking.accommodation,
  ];

  it.each([
    ["tr", tr],
    ["en", en],
    ["de", de],
  ] as const)("%s dictionary'de tüm kritik key'ler dolu", (_label, dict) => {
    for (const getPath of requiredPaths) {
      expect(getPath(dict)).toBeTruthy();
    }
  });

  it("TR'deki onaylanmış mevcut UI metinleri birebir korunuyor", () => {
    /* Bu değerler mevcut, kullanıcı tarafından onaylanmış UI
       metinleriyle (Header.tsx "Teklif Al", BookingSummary.tsx/
       ReservationForm.tsx "İndirimli Tutar" vb.) birebir eşleşmeli —
       dictionary bu fazda bu iki component'e bağlandığı için TR
       render'ı DEĞİŞMEMELİ. */
    expect(tr.header.offer).toBe("Teklif Al");
    expect(tr.booking.discountedTotal).toBe("İndirimli Tutar");
    expect(tr.footer.explore).toBe("Keşfet");
    expect(tr.footer.checkReservation).toBe("Rezervasyon Sorgula");
  });
});

describe("getDictionary(locale)", () => {
  it("getDictionary('tr') çalışıyor ve tr dictionary'sini döner", () => {
    expect(getDictionary("tr")).toBe(tr);
  });

  it("getDictionary('en') çalışıyor ve en dictionary'sini döner", () => {
    expect(getDictionary("en")).toBe(en);
  });

  it("getDictionary('de') çalışıyor ve de dictionary'sini döner", () => {
    expect(getDictionary("de")).toBe(de);
  });

  it("desteklenmeyen locale -> tr fallback", () => {
    expect(getDictionary("fr")).toBe(tr);
    expect(getDictionary("xx")).toBe(tr);
  });

  it("null/undefined/parametresiz -> tr fallback", () => {
    expect(getDictionary(null)).toBe(tr);
    expect(getDictionary(undefined)).toBe(tr);
    expect(getDictionary()).toBe(tr);
  });
});
