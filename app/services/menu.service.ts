import { menuRepository } from "@/lib/db/menu.repository";
import {
  resolveMenuRows,
  type MenuRow,
  type MenuSourceMaps,
} from "@/lib/menu-resolver";

/* ===============================================================
   🛡️ getMenu — UNIFIED NAVIGATION SOURCE PIPELINE
   ===============================================================
   3 katmanı tek tree'de birleştirir:

     1) `menu` tablosu (source_type'a göre resolve edilir):
          - manual   → menu.name + menu.href
          - page     → pages.title + /p/{slug}
          - category → villa_types.name + /arama?categories={id}
          - region   → villa_locations.name + /arama?regions={id}

     2) Active `pages` (LEGACY auto-include): menu satırı tarafından
        zaten referans verilen sayfaları HARİÇ tutar (duplicate
        engellenir). Geri kalanlar root olarak eklenir (eski davranış).

   Tree builder mevcut parent_id mantığını korur. Half-open vs.
   availability vs. arama filtering — hepsi etkilenmez; menu sadece
   URL üretir, route handler aynı semantic'i çalıştırır.
   =============================================================== */

/* 🛡️ Faz 9 TS hardening: buildTree tipli.
   Input minimum shape (resolveMenuRows çıktısı + autoIncludedPages
   literal'ı kapsar). Output node'ları children array'i ile genişletir.
   Mutation/davranış byte-identical. */
type MenuNodeInput = {
  id: string;
  name: string;
  href: string;
  order: number;
  parent_id: string | null;
  source_type?: string;
  source_id?: string | null;
};

type MenuTreeNode = MenuNodeInput & { children: MenuTreeNode[] };

// 🔥 TREE BUILDER (mevcut mantık aynen)
function buildTree(items: MenuNodeInput[]): MenuTreeNode[] {
  const map = new Map<string, MenuTreeNode>();
  const roots: MenuTreeNode[] = [];

  items.forEach((item) => {
    map.set(item.id, { ...item, children: [] });
  });

  items.forEach((item) => {
    const node = map.get(item.id);
    if (!node) return;
    if (item.parent_id) {
      const parent = map.get(item.parent_id);
      if (parent) {
        parent.children.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export async function getMenu() {
  /* Paralel fetch — 4 kaynak.
     menu : navigation kayıtları (source_type'a göre resolve edilecek)
     pages: hem 'page' source'unun lookup'ı hem legacy auto-include
     villa_types / villa_locations : category / region kaynakları */
  /* FAZ 40: menuRepository delege — 4 paralel fetch. */
  const [menuRes, pagesRes, typesRes, locsRes] = await Promise.all([
    menuRepository.findAll(),
    menuRepository.findActivePagesForMenu(),
    menuRepository.findAllVillaTypes(),
    menuRepository.findAllVillaLocations(),
  ]);

  /* Lookup map'leri kur (O(1) erişim). */
  const pagesMap = new Map<string, { title: string; slug: string }>();
  for (const p of pagesRes.data || []) {
    if (p?.id) pagesMap.set(p.id, { title: p.title, slug: p.slug });
  }

  const typesMap = new Map<string, { name: string; slug: string | null }>();
  for (const t of typesRes.data || []) {
    if (t?.id) {
      typesMap.set(t.id, {
        name: t.name,
        slug: (t as { slug?: string | null }).slug ?? null,
      });
    }
  }

  const locsMap: MenuSourceMaps["locations"] = new Map();
  for (const l of locsRes.data || []) {
    if (l?.id) {
      locsMap.set(l.id, {
        name: l.name,
        slug: (l as { slug?: string | null }).slug ?? null,
        /* 🛡️ SEO landing — grup kökü tespiti (veri zaten SELECT'te). */
        filter_group_name:
          (l as { filter_group_name?: string | null }).filter_group_name ??
          null,
      });
    }
  }

  const sourceMaps: MenuSourceMaps = {
    pages: pagesMap,
    types: typesMap,
    locations: locsMap,
  };

  /* menu tablosundaki satırları resolve et. Orphan'lar (source bulunmayan
     non-manual) listeden düşer → frontend menüsünde gizlenir. */
  const resolved = resolveMenuRows((menuRes.data || []) as MenuRow[], sourceMaps);

  /* LEGACY: pages auto-include. Sadece, menu tablosunda
     source_type='page' & source_id=p.id ile referansı OLMAYAN
     sayfaları root olarak ekle. Bu sayede aynı sayfa hem auto-include
     hem explicit menu satırı ile duplicate olarak görünmez. */
  /* 🛡️ Faz 9 hardening: lokal narrow types. */
  type MenuRowMinimal = {
    id: string;
    source_type: string | null;
    source_id: string | null;
  };
  type PageRowMinimal = {
    id: string;
    title: string;
    slug: string;
    menu_order: number | null;
    menu_parent_id: string | null;
    show_in_menu: boolean | null;
  };

  const referencedPageIds = new Set(
    ((menuRes.data || []) as MenuRowMinimal[])
      .filter((m) => m.source_type === "page" && !!m.source_id)
      .map((m) => m.source_id as string)
  );

  /* 🛡️ MANUEL MENÜ GÖRÜNÜRLÜĞÜ (migration 045): auto-include YALNIZ
     show_in_menu=true sayfaları kapsar. show_in_menu=false sayfalar
     (yeni oluşturulanların default'u) menüde GÖRÜNMEZ ama /p/{slug}
     route + SEO + sitemap aynen çalışır. NOT: explicit menü satırı
     (source_type='page') ile eklenen sayfalar bu filtreden bağımsız
     resolve edilir (pagesMap lookup) — admin isterse explicit ekleyebilir. */
  const autoIncludedPages: MenuNodeInput[] = (
    (pagesRes.data || []) as PageRowMinimal[]
  )
    .filter(
      (p) => p.show_in_menu === true && !referencedPageIds.has(p.id)
    )
    .map((p) => ({
      id: p.id,
      name: p.title,
      href: `/p/${p.slug}`,
      order: p.menu_order ?? 999,
      parent_id: p.menu_parent_id ?? null,
      source_type: "page" as const,
      source_id: p.id,
    }));

  /* Birleşik sıralama + tree dönüşüm. */
  const combined = [...resolved, ...autoIncludedPages].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999)
  );

  return buildTree(combined);
}
