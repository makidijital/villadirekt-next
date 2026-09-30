/* ===============================================================
   🛡️ MIGRATION 092 — ADMIN DÖNEM SEÇİMİ + P3 (DÖNEM BAŞINA KART)
   ===============================================================
   KURALLAR:
     • Admin `selected_discount_ranges` ile hangi indirim dönemlerinin
       public'te gösterileceğini seçer (TARİH ÇİFTİ ile; id ile DEĞİL).
     • NULL / [] / hiç eşleşmeyen seçim → TÜM görünür dönemler
       (legacy davranış; kart SESSİZCE kaybolmaz).
     • Seçilen HER uygun dönem AYRI bir kart (P3).
     • 0/N dolu → kart var + rezervasyon · 1..N-1 dolu → kart var + detay
     • N/N dolu → O DÖNEM için kart YOK (villanın diğer dönemleri kalır)
     • Seçilmeyen dönem availability sorgusuna HİÇ girmez.

   `getBlockedVillaIds` mock'lanır ama davranışı SAHTE DEĞİL: gerçek
   RPC'nin half-open overlap kuralı (migration 039) birebir uygulanır.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function iso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Dört gelecek dönem (hepsi `end_date >= bugün`). */
const P1 = { start: iso(20), end: iso(27) }; // sezon A
const P2 = { start: iso(30), end: iso(37) }; // sezon A
const P3_ = { start: iso(50), end: iso(57) }; // sezon B
const P4 = { start: iso(60), end: iso(67) }; // sezon B

type Block = { villa_id: string; start_date: string; end_date: string };
let BLOCKS: Block[] = [];

const getBlockedVillaIdsMock = vi.fn(
  async (start: string, end: string, villaIds?: string[]) => {
    const blocked = new Set<string>();
    if (!start || !end || !(start < end)) return blocked;
    const scope = Array.isArray(villaIds) ? new Set(villaIds) : null;
    for (const b of BLOCKS) {
      if (scope && !scope.has(b.villa_id)) continue;
      if (b.start_date < end && b.end_date > start) blocked.add(b.villa_id);
    }
    return blocked;
  }
);

vi.mock("@/lib/availability.helper", () => ({
  getBlockedVillaIds: (...a: unknown[]) =>
    (getBlockedVillaIdsMock as unknown as (...x: unknown[]) => unknown)(...a),
}));

const findActivePublicCardsMock = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
}));
vi.mock("@/lib/db/discount.repository", () => ({
  discountRepository: {
    findActivePublicCards: (...a: unknown[]) => findActivePublicCardsMock(...a),
    findAllForAdmin: async () => ({ data: [], error: null }),
    updateById: async () => ({ error: null }),
  },
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null) => u,
  resolveAssetUrl: (u: string | null) => u,
}));
vi.mock("@/app/services/villa-review.service", () => ({
  getApprovedVillaReviews: async () => [],
  getFeaturedHomepageReviews: async () => [],
  getGlobalReviewStats: async () => ({ average: 0, count: 0 }),
  getVillaReviewStats: async () => ({ average: 0, count: 0 }),
  getVillaReviewStatsBatch: async () => ({}),
}));
vi.mock("@/app/services/settings.service", () => ({ getPublicSettings: async () => null }));
vi.mock("@/app/services/menu.service", () => ({ getMenu: async () => [] }));
vi.mock("@/app/services/villa.service", () => ({ getVillas: async () => [] }));
vi.mock("@/app/services/faq.service", () => ({ getFaqs: async () => [] }));
vi.mock("@/lib/i18n/get-faq-translations.server", () => ({
  applyFaqTranslations: async (f: unknown[]) => f,
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findActiveLocationIds: async () => ({ data: [], error: null }),
    findActiveImagesByIds: async () => ({ data: [], error: null }),
  },
}));
vi.mock("@/lib/db/villa-type.repository", () => ({ villaTypeRepository: {} }));
vi.mock("@/lib/db/villa-location.repository", () => ({ villaLocationRepository: {} }));
vi.mock("@/lib/db/homepage.repository", () => ({ homepageRepository: {} }));

import { getCachedDiscountCollectionVillas } from "@/lib/cache.helpers";
import { normalizeSelectedDiscountRanges } from "@/app/services/discount-collection.service";

/* İki fiyat sezonu → dönem başına fiyat türetimi doğrulanabilsin. */
const SEASON_A = { price: 10000, currency: "TRY", start_date: iso(0), end_date: iso(40) };
const SEASON_B = { price: 20000, currency: "TRY", start_date: iso(41), end_date: iso(120) };

type Period = { start: string; end: string; value?: number };

function publicRow(
  villaId: string,
  periods: Period[],
  selected?: Array<{ start: string; end: string }> | null
) {
  return {
    id: `dc-${villaId}`,
    sort_order: 0,
    is_active: true,
    custom_title: null,
    custom_cover_image: null,
    selected_discount_ranges: selected === undefined ? null : selected,
    villa: {
      id: villaId,
      slug: villaId,
      title: villaId,
      badge: null,
      bedrooms: 3,
      bathrooms: 2,
      guests: 6,
      is_active: true,
      deleted_at: null,
      location: { name: "Kaş" },
      villa_images: [{ image_url: "a.webp", is_cover: true, sort_order: 0 }],
      villa_prices: [SEASON_A, SEASON_B],
      villa_discounts: periods.map((p) => ({
        start_date: p.start,
        end_date: p.end,
        discount_type: "percent" as const,
        discount_value: p.value ?? 20,
        currency: null,
      })),
    },
  };
}

function setCards(rows: unknown[]) {
  findActivePublicCardsMock.mockResolvedValue({ data: rows, error: null });
}

async function cards() {
  return await getCachedDiscountCollectionVillas();
}
async function cardsOf(villaId: string) {
  return (await cards()).filter((c) => c.id === villaId);
}
function periodsOf(list: Awaited<ReturnType<typeof cards>>) {
  return list.map((c) => `${c.discount?.start_date}|${c.discount?.end_date}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  BLOCKS = [];
});

describe("1–2) NULL / [] seçim → TÜM görünür dönemler (legacy korunur)", () => {
  it("1) selected_discount_ranges NULL → 4 dönem → 4 kart", async () => {
    setCards([publicRow("v1", [P1, P2, P3_, P4], null)]);
    const list = await cardsOf("v1");
    expect(list).toHaveLength(4);
    expect(periodsOf(list)).toEqual([
      `${P1.start}|${P1.end}`,
      `${P2.start}|${P2.end}`,
      `${P3_.start}|${P3_.end}`,
      `${P4.start}|${P4.end}`,
    ]);
  });

  it("2) selected_discount_ranges [] → yine TÜM dönemler (kart kaybolmaz)", async () => {
    setCards([publicRow("v1", [P1, P2, P3_, P4], [])]);
    expect(await cardsOf("v1")).toHaveLength(4);
  });

  it("2b) Seçim var ama HİÇBİRİ eşleşmiyor (orphan) → TÜM dönemlere düşer", async () => {
    setCards([
      publicRow("v1", [P1, P2], [{ start: "2020-01-01", end: "2020-01-05" }]),
    ]);
    expect(await cardsOf("v1")).toHaveLength(2);
  });
});

describe("3–7) Seçim + P3 çoğaltma", () => {
  it("3) 4 dönemden 2'si seçili → SADECE 2 kart", async () => {
    setCards([publicRow("v1", [P1, P2, P3_, P4], [P1, P3_])]);
    const list = await cardsOf("v1");
    expect(list).toHaveLength(2);
    expect(periodsOf(list)).toEqual([
      `${P1.start}|${P1.end}`,
      `${P3_.start}|${P3_.end}`,
    ]);
  });

  it("4) 8 dönemden 3'ü seçili → SADECE 3 kart", async () => {
    const eight: Period[] = Array.from({ length: 8 }, (_, i) => ({
      start: iso(20 + i * 10),
      end: iso(25 + i * 10),
    }));
    const pick = [eight[0], eight[3], eight[6]];
    setCards([publicRow("v1", eight, pick)]);
    const list = await cardsOf("v1");
    expect(list).toHaveLength(3);
    expect(periodsOf(list)).toEqual(
      pick.map((p) => `${p.start}|${p.end}`)
    );
  });

  it("5) Aynı villanın farklı dönemleri AYRI kartlar (aynı villa id, farklı dönem)", async () => {
    setCards([publicRow("v1", [P1, P2], [P1, P2])]);
    const list = await cardsOf("v1");
    expect(list).toHaveLength(2);
    expect(new Set(list.map((c) => c.id)).size).toBe(1); // aynı villa
    expect(new Set(periodsOf(list)).size).toBe(2); // farklı dönem
  });

  it("6) Her kart KENDİ start/end tarihini taşır (+1 gün YOK)", async () => {
    setCards([publicRow("v1", [P1, P3_], [P1, P3_])]);
    const list = await cardsOf("v1");
    expect(list[0].discount).toMatchObject({
      start_date: P1.start,
      end_date: P1.end,
    });
    expect(list[1].discount).toMatchObject({
      start_date: P3_.start,
      end_date: P3_.end,
    });
  });

  it("7) Her kart KENDİ indirimini ve sezona göre KENDİ fiyatını gösterir", async () => {
    setCards([
      publicRow(
        "v1",
        [
          { ...P1, value: 20 }, // sezon A → 10000
          { ...P3_, value: 30 }, // sezon B → 20000
        ],
        [P1, P3_]
      ),
    ]);
    const list = await cardsOf("v1");
    expect(list[0].discount?.discount_value).toBe(20);
    expect(list[0].price).toBe(10000);
    expect(list[1].discount?.discount_value).toBe(30);
    expect(list[1].price).toBe(20000);
    expect(list[0].currency).toBe("TRY");
  });
});

describe("8–11) Availability — üç davranış dönem bazında", () => {
  it("8) Bir dönem TAMAMEN dolu → O KART YOK, diğeri kalır", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: P1.start, end_date: P1.end }];
    setCards([publicRow("v1", [P1, P2], [P1, P2])]);
    const list = await cardsOf("v1");
    expect(list).toHaveLength(1);
    expect(periodsOf(list)).toEqual([`${P2.start}|${P2.end}`]);
  });

  it("9) Bir dönem KISMEN dolu → kart var, discount_available=false (detay CTA)", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: iso(22), end_date: iso(23) }];
    setCards([publicRow("v1", [P1], [P1])]);
    const list = await cardsOf("v1");
    expect(list).toHaveLength(1);
    expect(list[0].discount_available).toBe(false);
  });

  it("10) Bir dönem TAMAMEN müsait → kart var, discount_available=true (rezervasyon CTA)", async () => {
    setCards([publicRow("v1", [P1], [P1])]);
    const list = await cardsOf("v1");
    expect(list[0].discount_available).toBe(true);
    expect(list[0].discount?.start_date).toBe(P1.start);
    expect(list[0].discount?.end_date).toBe(P1.end);
  });

  it("11) Biri TAM DOLU + diğeri müsait → yalnız müsait dönem kartı", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: P1.start, end_date: P1.end }];
    setCards([publicRow("v1", [P1, P3_], [P1, P3_])]);
    const list = await cardsOf("v1");
    expect(list).toHaveLength(1);
    expect(list[0].discount?.start_date).toBe(P3_.start);
    expect(list[0].discount_available).toBe(true);
  });

  it("11b) Biri KISMİ + diğeri müsait → İKİSİ de var, CTA'ları FARKLI", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: iso(22), end_date: iso(23) }];
    setCards([publicRow("v1", [P1, P3_], [P1, P3_])]);
    const list = await cardsOf("v1");
    expect(list).toHaveLength(2);
    expect(list[0].discount_available).toBe(false); // detay
    expect(list[1].discount_available).toBe(true); // rezervasyon
  });

  it("11c) TÜM seçili dönemler tamamen dolu → o villadan HİÇ kart yok", async () => {
    BLOCKS = [
      { villa_id: "v1", start_date: P1.start, end_date: P1.end },
      { villa_id: "v1", start_date: P2.start, end_date: P2.end },
    ];
    setCards([publicRow("v1", [P1, P2], [P1, P2])]);
    expect(await cardsOf("v1")).toHaveLength(0);
  });

  it("11d) Seçilmeyen dönem müsait olsa bile KULLANILMAZ", async () => {
    BLOCKS = [{ villa_id: "v1", start_date: P1.start, end_date: P1.end }];
    // P1 seçili ve tamamen dolu; P2 müsait AMA seçili değil
    setCards([publicRow("v1", [P1, P2], [P1])]);
    expect(await cardsOf("v1")).toHaveLength(0);
  });
});

describe("12–13) Sorgu davranışı — seçim filtresi ve N+1", () => {
  it("12) Seçilmeyen dönem availability sorgusuna HİÇ girmez", async () => {
    setCards([publicRow("v1", [P1, P2, P3_, P4], [P1])]);
    await cards();
    const windows = getBlockedVillaIdsMock.mock.calls.map(
      (c) => `${c[0]}|${c[1]}`
    );
    expect(windows).toContain(`${P1.start}|${P1.end}`);
    expect(windows).not.toContain(`${P2.start}|${P2.end}`);
    expect(windows).not.toContain(`${P3_.start}|${P3_.end}`);
    expect(windows).not.toContain(`${P4.start}|${P4.end}`);
    expect(getBlockedVillaIdsMock).toHaveBeenCalledTimes(1);
  });

  it("13a) 100 villa AYNI pencereyi paylaşıyor → 1 sorgu (N+1 YOK)", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `v${i}`);
    setCards(ids.map((id) => publicRow(id, [P1], [P1])));
    const list = await cards();
    expect(getBlockedVillaIdsMock).toHaveBeenCalledTimes(1);
    expect(getBlockedVillaIdsMock.mock.calls[0][2]).toHaveLength(100);
    expect(list).toHaveLength(100);
  });

  it("13b) 100 villa × AYNI 8 dönem → 8 sorgu (800 DEĞİL)", async () => {
    const eight: Period[] = Array.from({ length: 8 }, (_, i) => ({
      start: iso(20 + i * 10),
      end: iso(25 + i * 10),
    }));
    const ids = Array.from({ length: 100 }, (_, i) => `v${i}`);
    setCards(ids.map((id) => publicRow(id, eight, eight)));
    const list = await cards();
    expect(getBlockedVillaIdsMock).toHaveBeenCalledTimes(8);
    expect(list).toHaveLength(800); // 100 villa × 8 dönem = 800 kart
  });

  it("13c) Sorgu sayısı VİLLA SAYISINDAN bağımsız (1500 villa)", async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `v${i}`);
    setCards(ids.map((id) => publicRow(id, [P1, P2], [P1, P2])));
    await cards();
    expect(getBlockedVillaIdsMock).toHaveBeenCalledTimes(2); // 2 distinct pencere
  });
});

describe("14) React key — card_key benzersizliği", () => {
  it("14a) Aynı villanın 4 kartı → 4 FARKLI card_key", async () => {
    setCards([publicRow("v1", [P1, P2, P3_, P4], null)]);
    const list = await cardsOf("v1");
    const keys = list.map((c) => c.card_key);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
    expect(keys[0]).toBe(`v1|${P1.start}|${P1.end}`);
  });

  it("14b) Çok villa + çok dönem → TÜM kartlarda duplicate key YOK", async () => {
    setCards([
      publicRow("v1", [P1, P2], null),
      publicRow("v2", [P1, P2], null),
      publicRow("v3", [P1], null),
    ]);
    const list = await cards();
    const keys = list.map((c) => c.card_key);
    expect(keys).toHaveLength(5);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("14c) card_key deterministik — iki çağrı AYNI anahtarları verir", async () => {
    setCards([publicRow("v1", [P1, P2], null)]);
    const a = (await cardsOf("v1")).map((c) => c.card_key);
    const b = (await cardsOf("v1")).map((c) => c.card_key);
    expect(a).toEqual(b);
  });
});

describe("Sıralama — (sort_order ASC, start_date ASC)", () => {
  it("S1) Villalar sort_order sırasını, dönemler start_date sırasını korur", async () => {
    const rowA = publicRow("vA", [P3_, P1], null); // bilinçli KARIŞIK sıra
    const rowB = publicRow("vB", [P2], null);
    rowA.sort_order = 0;
    rowB.sort_order = 1;
    setCards([rowA, rowB]);
    const list = await cards();
    expect(list.map((c) => c.card_key)).toEqual([
      `vA|${P1.start}|${P1.end}`,
      `vA|${P3_.start}|${P3_.end}`,
      `vB|${P2.start}|${P2.end}`,
    ]);
  });
});

describe("normalizeSelectedDiscountRanges — seçim sözleşmesi", () => {
  it("N1) NULL / non-array → null (tüm dönemler)", () => {
    expect(normalizeSelectedDiscountRanges(null)).toBeNull();
    expect(normalizeSelectedDiscountRanges(undefined)).toBeNull();
    expect(normalizeSelectedDiscountRanges("x")).toBeNull();
  });
  it("N2) [] → null (tüm dönemler)", () => {
    expect(normalizeSelectedDiscountRanges([])).toBeNull();
  });
  it("N3) Geçerli çiftler korunur", () => {
    expect(
      normalizeSelectedDiscountRanges([{ start: "2026-10-10", end: "2026-10-17" }])
    ).toEqual([{ start: "2026-10-10", end: "2026-10-17" }]);
  });
  it("N4) Bozuk kayıtlar elenir, throw ETMEZ", () => {
    expect(
      normalizeSelectedDiscountRanges([
        { start: "bozuk", end: "2026-10-17" },
        null,
        { start: "2026-10-10" },
        { start: "2026-11-01", end: "2026-11-08" },
      ])
    ).toEqual([{ start: "2026-11-01", end: "2026-11-08" }]);
  });
  it("N5) Aynı dönem iki kez seçilemez (tekilleştirme)", () => {
    expect(
      normalizeSelectedDiscountRanges([
        { start: "2026-10-10", end: "2026-10-17" },
        { start: "2026-10-10", end: "2026-10-17" },
      ])
    ).toHaveLength(1);
  });
  it("N6) `villa_discounts.id` KULLANILMAZ — sözleşme tarih çifti", () => {
    const src = readFileSync(
      join(process.cwd(), "app/services/discount-collection.service.ts"),
      "utf8"
    );
    const fn = src.slice(src.indexOf("export function normalizeSelectedDiscountRanges"));
    expect(fn.slice(0, 900)).not.toContain("discount_id");
  });
});

describe("15–18) Koruma kilitleri (source-lock)", () => {
  const cacheSrc = readFileSync(join(process.cwd(), "lib/cache.helpers.ts"), "utf8");

  it("15) Cache key / tag / revalidate DEĞİŞMEDİ", () => {
    expect(cacheSrc).toContain('["discount-collection:get"]');
    expect(cacheSrc).toContain('tags: ["discount", "villa-reviews"], revalidate: 600');
  });

  it("16) Migration 092 additive — mevcut migration'lara dokunulmadı", () => {
    const m = readFileSync(
      join(process.cwd(), "db/migrations/092_discount_collection_selected_ranges.sql"),
      "utf8"
    );
    /* ÇALIŞAN SQL (doc-comment HARİÇ) — yalnız ADD COLUMN + COMMENT.
       Not: başlıktaki ROLLBACK notu da "ALTER TABLE" içerdiği için
       SON eşleşmeden itibaren dilimlenir. */
    const sql = m.slice(m.lastIndexOf("\nALTER TABLE"));
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS selected_discount_ranges jsonb");
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bCREATE\s+(TABLE|INDEX)\b/i);
    /* `villa_discounts` tablosuna DDL uygulanmaz (yalnız COMMENT
       metninde referans olarak geçer). */
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+villa_discounts/i);
    expect(sql).not.toContain("discount_collections_villa_unique");
  });

  it("17) cache.helpers hiçbir yazma/silme yapmaz (reservation & cleanup güvenliği)", () => {
    expect(cacheSrc).not.toContain(".delete(");
    expect(cacheSrc).not.toContain(".insert(");
    expect(cacheSrc).not.toContain(".update(");
    /* `replace_villa_discounts` ve `revalidateTag` yalnız YORUMLARDA
       geçebilir; ÇAĞRI olarak kullanılmaz. */
    expect(cacheSrc).not.toContain('rpc("replace_villa_discounts"');
    expect(cacheSrc).not.toContain("revalidateTag(");
  });

  it("18) VillaCard'ın discount prop sözleşmesi TEKİL kaldı (P3 tipi değiştirmedi)", () => {
    const card = readFileSync(
      join(process.cwd(), "app/components/villa/VillaCard.tsx"),
      "utf8"
    );
    expect(card).toContain("discount?: {");
    expect(card).not.toContain("discounts?: Array<{ start_date");
    expect(card).not.toContain("card_key");
  });

  it("18b) DiscountCollection card_key'i kullanır, fallback korunur", () => {
    const dc = readFileSync(
      join(process.cwd(), "app/components/home/DiscountCollection.tsx"),
      "utf8"
    );
    expect(dc).toContain("key={c.card_key || c.slug || c.id}");
  });
});
