/* ===============================================================
   🛡️ PHASE 10E BATCH 5 — POOL HELPER + LABEL TESTLERİ
   ===============================================================
   Hedef: lib/pool.helper.ts (canonical türetim) ve
          lib/pool-label.helper.ts (locale etiketi).

   GERÇEK (mock'lanmamış) dictionary kullanılır — Batch 1/4'teki
   distance-label / villa-layout-label testleriyle AYNI prensip.

   KRİTİK: TR etiketleri, bu batch ÖNCESİNDE kiralik-villa/[slug] ve
   v/[token] sayfalarında inline yazılı olan literal'lerle BİREBİR
   aynı olmalı (byte-identical TR davranışı).
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  buildPoolCards,
  hasAnyPool,
  POOL_TYPE_KEYS,
  type PoolCardSource,
} from "@/lib/pool.helper";
import { getPoolTypeLabel } from "@/lib/pool-label.helper";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

const LOCALES: Locale[] = ["tr", "en", "de"];

/* Bu batch ÖNCESİNDEKİ inline TR literal'leri — regresyon kilidi. */
const TR_LEGACY: Record<string, string> = {
  private: "Özel Havuz",
  private_sheltered: "Özel Korunaklı Havuz",
  shared: "Ortak Havuz",
  indoor: "Kapalı Havuz",
  child: "Çocuk Havuzu",
};

const FULL_VILLA: PoolCardSource = {
  pool_type: "ozel",
  pool_sheltered: false,
  pool_width: "4",
  pool_length: "8",
  pool_depth: "1.5",
  indoor_pool: true,
  indoor_pool_width: "3",
  indoor_pool_length: "6",
  indoor_pool_depth: "1.2",
  child_pool: true,
  child_pool_width: "2",
  child_pool_length: "2",
  child_pool_depth: "0.4",
};

/* ---------------------------------------------------------------
   DICTIONARY
   --------------------------------------------------------------- */
describe("dictionary — poolTypeLabels", () => {
  it("🛡️ TR değerleri eski inline literal'lerle BİREBİR aynı", () => {
    for (const key of POOL_TYPE_KEYS) {
      expect(getPoolTypeLabel(key, "tr")).toBe(TR_LEGACY[key]);
    }
  });

  it("EN değerleri doğru", () => {
    expect(getPoolTypeLabel("private", "en")).toBe("Private Pool");
    expect(getPoolTypeLabel("private_sheltered", "en")).toBe(
      "Private Sheltered Pool"
    );
    expect(getPoolTypeLabel("shared", "en")).toBe("Shared Pool");
    expect(getPoolTypeLabel("indoor", "en")).toBe("Indoor Pool");
    expect(getPoolTypeLabel("child", "en")).toBe("Children's Pool");
  });

  it("DE değerleri doğru", () => {
    expect(getPoolTypeLabel("private", "de")).toBe("Privatpool");
    expect(getPoolTypeLabel("private_sheltered", "de")).toBe(
      "Privater überdachter Pool"
    );
    expect(getPoolTypeLabel("shared", "de")).toBe("Gemeinschaftspool");
    expect(getPoolTypeLabel("indoor", "de")).toBe("Hallenbad");
    expect(getPoolTypeLabel("child", "de")).toBe("Kinderpool");
  });

  it("TR/EN/DE key parity — POOL_TYPE_KEYS ile birebir", () => {
    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      expect(Object.keys(dict.poolTypeLabels).sort()).toEqual(
        [...POOL_TYPE_KEYS].sort()
      );
      for (const key of POOL_TYPE_KEYS) {
        expect(dict.poolTypeLabels[key]).toBeTruthy();
      }
    }
  });

  it("pool UI metinleri üç locale'de de dolu", () => {
    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      for (const v of Object.values(dict.pool)) {
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });

  it("🛡️ TR pool UI metinleri TR sayfasının mevcut metinleriyle aynı", () => {
    const tr = getDictionary("tr");
    expect(tr.pool.sectionTitle).toBe("Havuz Bilgileri");
    expect(tr.pool.width).toBe("Genişlik");
    expect(tr.pool.length).toBe("Uzunluk");
    expect(tr.pool.depth).toBe("Derinlik");
    expect(tr.pool.noDimensions).toBe("Ölçü bilgisi yok");
  });

  it("bilinmeyen tip CRASH ETMEZ, anahtarın kendisi döner", () => {
    expect(() =>
      // @ts-expect-error — bilinçli olarak geçersiz tip
      getPoolTypeLabel("jacuzzi", "en")
    ).not.toThrow();
    // @ts-expect-error — bilinçli olarak geçersiz tip
    expect(getPoolTypeLabel("jacuzzi", "en")).toBe("jacuzzi");
  });
});

/* ---------------------------------------------------------------
   buildPoolCards — CANONICAL TÜRETİM
   --------------------------------------------------------------- */
describe("buildPoolCards", () => {
  it("üç havuz da varsa sıra ve React key'leri korunur", () => {
    const cards = buildPoolCards(FULL_VILLA);
    expect(cards.map((c) => c.key)).toEqual(["main", "indoor", "child"]);
    expect(cards.map((c) => c.type)).toEqual(["private", "indoor", "child"]);
  });

  it("ozel + sheltered → private_sheltered", () => {
    const cards = buildPoolCards({
      pool_type: "ozel",
      pool_sheltered: true,
    });
    expect(cards[0].type).toBe("private_sheltered");
    expect(getPoolTypeLabel(cards[0].type, "tr")).toBe("Özel Korunaklı Havuz");
  });

  it("ortak → shared (sheltered dikkate alınmaz)", () => {
    const cards = buildPoolCards({
      pool_type: "ortak",
      pool_sheltered: true,
    });
    expect(cards[0].type).toBe("shared");
  });

  it("pool_type 'yok' → ana havuz kartı YOK", () => {
    const cards = buildPoolCards({ pool_type: "yok", child_pool: true });
    expect(cards.map((c) => c.key)).toEqual(["child"]);
  });

  it("hiç havuz yoksa boş dizi + hasAnyPool false", () => {
    const empty: PoolCardSource = { pool_type: "yok" };
    expect(buildPoolCards(empty)).toEqual([]);
    expect(hasAnyPool(empty)).toBe(false);
  });

  it("ölçüler doğru alanlardan taşınır", () => {
    const cards = buildPoolCards(FULL_VILLA);
    expect(cards[0]).toMatchObject({ width: "4", length: "8", depth: "1.5" });
    expect(cards[1]).toMatchObject({ width: "3", length: "6", depth: "1.2" });
    expect(cards[2]).toMatchObject({ width: "2", length: "2", depth: "0.4" });
  });

  it("🛡️ distinguishSheltered:false → v/[token]'ın BUGÜNKÜ davranışı korunur", () => {
    const cards = buildPoolCards(
      { pool_type: "ozel", pool_sheltered: true },
      { distinguishSheltered: false }
    );
    expect(cards[0].type).toBe("private");
    expect(getPoolTypeLabel(cards[0].type, "tr")).toBe("Özel Havuz");
  });

  it("eksik/bozuk alanlar CRASH ETMEZ", () => {
    expect(() => buildPoolCards({})).not.toThrow();
    expect(buildPoolCards({})).toEqual([]);
    expect(() =>
      buildPoolCards({ pool_type: null, indoor_pool: null })
    ).not.toThrow();
  });

  it("🛡️ TİP ↔ ETİKET tek yönlü: kart canonical tip taşır, etiket DEĞİL", () => {
    const cards = buildPoolCards(FULL_VILLA);
    for (const c of cards) {
      expect(POOL_TYPE_KEYS).toContain(c.type);
      expect(c).not.toHaveProperty("label");
    }
  });

  it("🛡️ ikon/tip eşlemesi locale'den ETKİLENMEZ", () => {
    const cards = buildPoolCards(FULL_VILLA);
    for (const locale of LOCALES) {
      const again = buildPoolCards(FULL_VILLA);
      expect(again.map((c) => c.type)).toEqual(cards.map((c) => c.type));
      /* Etiket locale'e göre değişse de tip sabit kalır. */
      expect(getPoolTypeLabel(again[0].type, locale)).toBeTruthy();
    }
  });
});
