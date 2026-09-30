/* ===============================================================
   🛡️ /maki-admin/villas/siralama — REGRESYON KİLİDİ
   ===============================================================
   Bu ekranın daha önce HİÇ testi yoktu. Performans optimizasyonu
   (minimal projection + memo) sırasında eklendi.

   KİLİTLENEN INVARIANT'LAR:
     A) Global yeniden numaralandırma:
        `reordered.map((v, idx) => ({ id, sort_order: idx }))`
        — TÜM liste 0'dan yeniden numaralanır (subset DEĞİL).
     B) API sözleşmesi: endpoint + payload shape.
     C) Sıralama ekranının SQL'i: minimal projection, LIMIT YOK,
        `listForAdmin` ile AYNI WHERE + ORDER BY.
     D) Paylaşılan `listForAdmin` DARALTILMADI (operasyon ekranı).
=============================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arrayMove } from "@dnd-kit/sortable";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

const PANEL = "app/(admin)/maki-admin/villas/siralama/_components/VillaSortPanel.tsx";
const PAGE = "app/(admin)/maki-admin/villas/siralama/page.tsx";
const REPO = "lib/db/villa.repository.server.ts";

/* Panel'deki gerçek dönüşümün birebir kopyası (A invariant'ı). */
type Item = { id: string; title: string };
function buildUpdates(items: Item[], oldIndex: number, newIndex: number) {
  const reordered = arrayMove(items, oldIndex, newIndex);
  return reordered.map((v, idx) => ({ id: String(v.id), sort_order: idx }));
}

const N = 1500;
const LIST: Item[] = Array.from({ length: N }, (_, i) => ({
  id: `v${i}`,
  title: `Villa ${i}`,
}));

describe("A) global sort_order — 1500 elemanlı senaryolar", () => {
  const cases: Array<[string, number, number]> = [
    ["1. → 2. sıraya", 0, 1],
    ["1. → 500. sıraya", 0, 499],
    ["500. → 1. sıraya", 499, 0],
    ["son → ilk", N - 1, 0],
    ["ilk → son", 0, N - 1],
    ["ortadaki → başka orta", 700, 300],
  ];

  for (const [label, from, to] of cases) {
    it(`${label}: TÜM liste 0..N-1 aralığında KESİNTİSİZ numaralanır`, () => {
      const updates = buildUpdates(LIST, from, to);

      /* Tüm liste gönderilir — subset DEĞİL. */
      expect(updates).toHaveLength(N);

      /* sort_order tam olarak 0,1,2,...,N-1 */
      expect(updates.map((u) => u.sort_order)).toEqual(
        Array.from({ length: N }, (_, i) => i)
      );

      /* Hiçbir villa kaybolmaz / çoğalmaz. */
      expect(new Set(updates.map((u) => u.id)).size).toBe(N);

      /* Taşınan eleman hedef index'te. */
      expect(updates[to].id).toBe(LIST[from].id);
    });
  }

  it("aynı yere bırakma listeyi DEĞİŞTİRMEZ", () => {
    const updates = buildUpdates(LIST, 42, 42);
    expect(updates.map((u) => u.id)).toEqual(LIST.map((v) => v.id));
  });
});

describe("B) API sözleşmesi — kaynak kilidi", () => {
  const src = read(PANEL);

  it("invariant satırı AYNEN duruyor", () => {
    expect(src).toMatch(
      /reordered\.map\(\(v,\s*idx\)\s*=>\s*\(\{[\s\S]*?id:\s*String\(v\.id\)[\s\S]*?sort_order:\s*idx[\s\S]*?\}\)\)/
    );
  });

  it("endpoint + method DEĞİŞMEDİ", () => {
    expect(src).toContain('"/api/admin/villas/sort-orders"');
    expect(src).toContain('method: "POST"');
    expect(src).toContain("JSON.stringify({ updates })");
  });

  it("drag/drop sözleşmesi DEĞİŞMEDİ", () => {
    expect(src).toContain("closestCenter");
    expect(src).toContain("verticalListSortingStrategy");
    expect(src).toContain("arrayMove(items, oldIndex, newIndex)");
    /* id aynı; yalnız performans seçenekleri eklendi (transition +
       O(1) getNewIndex) — bkz. villa-sort-drag-speed.test.ts. */
    expect(src).toMatch(/useSortable\(\{\s*id: villa\.id,/);
  });

  it("fail-revert + cache invalidation + refresh duruyor", () => {
    expect(src).toContain("setItems(prev)");
    expect(src).toContain("revalidateVillas()");
    expect(src).toContain("router.refresh()");
  });

  it("pagination sızmamış — liste dilimlenmiyor", () => {
    /* `villa.id.slice(0, 8)` (ID kısaltma) pagination DEĞİLDİR;
       bu yüzden yalnız gerçek sayfalama yapıları aranır. */
    /* NOT: `underline-offset-4` bir Tailwind sınıfıdır → `offset`
       kelimesi aranmaz. */
    expect(src).not.toMatch(/\bpageSize\b|\.range\(|\bcurrentPage\b/);
    /* Liste dilimleme: items/reordered üzerinde slice YOK. */
    expect(src).not.toMatch(/\b(items|reordered)\.slice\(/);
    /* Tüm liste render edilir (virtualization/subset yok). */
    expect(src).toContain("items.map((villa, index) =>");
  });
});

describe("C) sıralama sorgusu — minimal projection", () => {
  const repo = read(REPO);
  const fn = repo.slice(repo.indexOf("async listForSortOrder"));
  const body = fn.slice(0, fn.indexOf("\n  },") + 1);

  it("yalnız id, title, sort_order seçilir", () => {
    expect(body).toContain('.select("id, title, sort_order")');
  });

  it("embed (relation) YOK", () => {
    expect(body).not.toMatch(/villa_images|villa_prices|villa_locations|villa_discounts/);
  });

  it("WHERE + ORDER BY listForAdmin ile AYNI", () => {
    expect(body).toContain('.is("deleted_at", null)');
    expect(body).toContain('.order("sort_order", { ascending: true })');
    expect(body).toContain('.order("created_at", { ascending: false })');
  });

  it("LIMIT / OFFSET / range YOK — global sıralama şart", () => {
    expect(body).not.toMatch(/\.range\(|\.limit\(/);
  });

  it("sayfa bu servisi kullanır", () => {
    expect(read(PAGE)).toContain("getVillasForSortOrder()");
  });
});

describe("D) paylaşılan listForAdmin DARALTILMADI", () => {
  const repo = read(REPO);
  const fn = repo.slice(repo.indexOf("async listForAdmin"));
  const body = fn.slice(0, fn.indexOf("\n  },") + 1);

  it("operasyon ekranının embed'leri ve select(*) duruyor", () => {
    expect(body).toContain("*,");
    expect(body).toContain("location:villa_locations(name)");
    expect(body).toContain("villa_images");
    expect(body).toContain("villa_prices");
  });

  it("opt-in pagination (.range) hâlâ mevcut", () => {
    expect(body).toContain(".range(opts.offset, opts.offset + opts.limit - 1)");
  });
});
