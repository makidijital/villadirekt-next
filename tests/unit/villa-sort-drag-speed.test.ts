/* ===============================================================
   ⚡ /maki-admin/villas/siralama — sürükleme hızı iyileştirmesi
   ===============================================================
   1) `fastNewIndex` dnd-kit `defaultNewIndexGetter` ile BİREBİR aynı
      sonucu verir (görsel yer değiştirme hesabı; kaydetme değil).
   2) Kaynak kilidi: hız ayarları yalnız bu panelde; kaydetme akışı
      (arrayMove + 0..N-1 + endpoint) değişmedi.
=============================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultNewIndexGetter } from "@dnd-kit/sortable";
import type { UniqueIdentifier } from "@dnd-kit/core";

import { fastNewIndex } from "@/app/(admin)/maki-admin/villas/siralama/_components/sort-new-index";

const PANEL = "app/(admin)/maki-admin/villas/siralama/_components/VillaSortPanel.tsx";
const src = readFileSync(join(process.cwd(), PANEL), "utf-8");

describe("fastNewIndex ≡ defaultNewIndexGetter", () => {
  it("küçük listelerde TÜM (id, activeIndex, overIndex) kombinasyonları", () => {
    for (let n = 1; n <= 7; n++) {
      const items: UniqueIdentifier[] = Array.from({ length: n }, (_, i) => `v${i}`);
      for (let a = 0; a < n; a++) {
        for (let o = 0; o < n; o++) {
          for (const id of [...items, "yok"]) {
            const args = { id, items, activeIndex: a, overIndex: o };
            expect(fastNewIndex(args)).toBe(defaultNewIndexGetter(args));
          }
        }
      }
    }
  });

  it("1500 elemanlı listede rastgele 5000 durum (sayısal id dahil)", () => {
    const items: UniqueIdentifier[] = Array.from({ length: 1500 }, (_, i) =>
      i % 3 === 0 ? i : `villa-${i}`
    );
    let seed = 42;
    const rnd = (m: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % m;
    };
    for (let k = 0; k < 5000; k++) {
      const args = {
        id: items[rnd(1500)],
        items,
        activeIndex: rnd(1500),
        overIndex: rnd(1500),
      };
      expect(fastNewIndex(args)).toBe(defaultNewIndexGetter(args));
    }
  });

  it("items dizisi değişince (yeni kimlik) eski önbellek kullanılmaz", () => {
    const a: UniqueIdentifier[] = ["x", "y", "z"];
    const b: UniqueIdentifier[] = ["z", "y", "x"];
    expect(fastNewIndex({ id: "x", items: a, activeIndex: 1, overIndex: 1 })).toBe(0);
    expect(fastNewIndex({ id: "x", items: b, activeIndex: 1, overIndex: 1 })).toBe(2);
  });
});

describe("hız ayarları — yalnız bu panel, dnd-kit'in kendi seçenekleri", () => {
  it("auto-scroll dnd-kit `autoScroll` prop'u ile (özel scroll loop yok)", () => {
    expect(src).toMatch(/const AUTO_SCROLL: AutoScrollOptions = \{ acceleration: \d+ \}/);
    expect(src).toContain("autoScroll={AUTO_SCROLL}");
    expect(src).not.toMatch(/requestAnimationFrame|setInterval|scrollBy\(/);
  });

  it("smooth scroll yalnız sürükleme süresince kapatılır ve geri yüklenir", () => {
    expect(src).toContain('root.style.scrollBehavior = "auto"');
    expect(src).toContain("root.style.scrollBehavior = prevInline");
    expect(src).toContain("onDragCancel={handleDragCancel}");
    /* bırakma + iptal + unmount yolları geri yükler */
    expect(src.match(/restoreScrollBehavior\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).toContain("useEffect(() => restoreScrollBehavior, [restoreScrollBehavior])");
  });

  it("DragOverlay + O(1) getNewIndex", () => {
    expect(src).toContain("<DragOverlay dropAnimation={null}>");
    expect(src).toContain("getNewIndex: fastNewIndex");
  });

  it("kaydetme akışı DEĞİŞMEDİ", () => {
    expect(src).toContain("arrayMove(items, oldIndex, newIndex)");
    expect(src).toContain('"/api/admin/villas/sort-orders"');
    expect(src).toMatch(/sort_order:\s*idx/);
    /* SortableContext TÜM listeyi alır (pencereleme yalnız dnd kaydı) */
    expect(src).toContain("items={sortableIds}");
    expect(src).toContain("const sortableIds = useMemo(() => items.map((v) => v.id), [items]);");
  });

  it("sürüklenen kart pencere dışına çıksa da dnd-kit'e kayıtlı kalır", () => {
    expect(src).toContain("forceSortable={villa.id === activeId}");
    expect(src).toContain("near || forceSortable ?");
  });
});
