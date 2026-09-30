"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import Link from "next/link";

import {
  DndContext,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Trash2,
  GripVertical,
  Layers,
  FileText,
  Tag,
  MapPin,
  AlertCircle,
  Languages,
} from "lucide-react";

/* 🛡️ MIGRATION 086 — menü adı EN/DE çeviri paneli. Satır tasarımı,
   drag-drop sözleşmesi ve mevcut CRUD DEĞİŞMEDİ; panel yalnız
   satırın ALTINDA, istendiğinde açılan ek bir blok olarak render
   edilir. `kind="page-auto"` satırlarda GÖSTERİLMEZ (onların adı
   `pages.title`'dan gelir ve çevirisi Sayfalar ekranında
   `page_translations` ile yönetilir — ikinci bir kaynak
   yaratılmaz). */
import MenuTranslationsPanel from "./MenuTranslationsPanel";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import {
  resolveMenuRow,
  type MenuRow,
  type MenuSourceMaps,
  type MenuSourceType,
} from "@/lib/menu-resolver";
import { revalidateMenu } from "@/app/services/revalidate.actions";

/* ===============================================================
   🛡️ MENU MANAGEMENT — UNIFIED SORTABLE TREE (manual + CMS)
   ===============================================================
   Tek tree, iki kaynak:
     1) `menu` tablosu   → manuel menu öğeleri (full CRUD)
     2) `pages` tablosu  → CMS sayfaları (CONTENT readonly burada;
                            yalnız PRESENTATION = sıralama + parent
                            burada düzenlenebilir)

   PRESENTATION VS CONTENT AYRIMI:
     - menu items   : tüm field'ler düzenlenebilir; drag, nest,
                      delete, /maki-admin/menu/new edit destekli.
     - CMS pages    : drag + nest açık; menu_order ve menu_parent_id
                      (db/migrations/004) UPDATE edilir. Content
                      düzenleme ve silme YOK — bunlar "Sayfalar"
                      ekranında yapılır. Row'da: drag handle, "Otomatik"
                      badge, "Sayfalar'dan yönet" linki.

   TABLOYA YAZIM ROUTING (handleDragEnd, makeChild, makeRoot):
     - type === "menu"  → UPDATE menu  SET order, parent_id
     - type === "page"  → UPDATE pages SET menu_order, menu_parent_id
     Tek transaction batch (Promise.all); cross-table failure
     yarısı uygulanırsa fetchAll ile state tam re-sync.

   FRONTEND ETKİSİ:
     menu.service.ts > getMenu() pages.menu_parent_id okuyup
     mevcut buildTree'sine besler. Render tree değişmez (parent
     match olmazsa orphan root'a düşer).
   =============================================================== */

/* Admin tarafı row tipi: persistence katmanı (menu vs pages) +
   navigation source ayrımı.

   - kind="menu" + sourceType: navigation source ne olursa olsun
     persistence menu tablosunda (id menu.id). Yatay drag → menu.order,
     menu.parent_id. UI'da sourceType'a göre badge.
   - kind="page-auto": LEGACY pages auto-include. Persistence pages
     tablosunda (id pages.id). Yatay drag → pages.menu_order,
     pages.menu_parent_id. CRUD kapalı (sadece "Sayfalar"dan).

   `orphan` flag: non-manual menu satırının source'u bulunamadıysa
   true; UI'da uyarı + silme imkanı verir. */
type ItemKind = "menu" | "page-auto";

type RowItem = {
  id: string;
  name: string;
  href: string;
  order: number;
  parent_id: string | null;
  kind: ItemKind;
  sourceType: MenuSourceType;
  sourceId: string | null;
  orphan?: boolean;
  /** page-auto için Sayfalar ekranı derin link slug'ı. */
  slug?: string;
};

/** Tree görüntü sırası: root → children inline. */
function buildTree(items: RowItem[]) {
  const roots = items.filter((i) => !i.parent_id);
  const result: RowItem[] = [];
  roots.forEach((root) => {
    result.push(root);
    const children = items.filter((i) => i.parent_id === root.id);
    result.push(...children);
  });
  /* Defensive: orphan refs (parent_id var ama parent yok) — yine de
     listelenmesi için root sonrası ekle, böylece kullanıcı görür ve
     drag ile düzeltebilir. */
  const visited = new Set(result.map((r) => r.id));
  for (const it of items) {
    if (!visited.has(it.id)) result.push(it);
  }
  return result;
}

export default function MenuPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [items, setItems] = useState<RowItem[]>([]);
  /* 🛡️ MIGRATION 086 — aynı anda TEK satırın çeviri paneli açık
     (accordion). Mevcut list/drag/delete state'lerinden TAMAMEN AYRI. */
  const [openTranslationsId, setOpenTranslationsId] = useState<string | null>(
    null
  );

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    /* 🛡️ FAZ 2 frontend purge — adminFetch GET /api/admin/menu.
       Eski 4 paralel anon DB client fetch tek route response'unda
       birleştirildi. Davranış BYTE-IDENTICAL: aynı select shape'leri
       repository üzerinden (menuRepository.findAll/findActivePagesForMenu/
       findAllVillaTypes/findAllVillaLocations), aynı filter (pages
       is_active=true). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let menuRes: { data: any[] | null } = { data: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pagesRes: { data: any[] | null } = { data: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let typesRes: { data: any[] | null } = { data: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let locsRes: { data: any[] | null } = { data: [] };
    try {
      const res = await adminFetch("/api/admin/menu");
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        menu?: any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pages?: any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        types?: any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        locations?: any[];
      };
      if (res.ok && json.ok) {
        menuRes = { data: json.menu || [] };
        pagesRes = { data: json.pages || [] };
        typesRes = { data: json.types || [] };
        locsRes = { data: json.locations || [] };
      }
    } catch {
      /* fail-soft: liste boş; caller error mesajı göstermez (eski davranış da
         hata göstermezdi, sadece boş state). */
    }

    const pagesMap = new Map<string, { title: string; slug: string }>();
    for (const p of pagesRes.data || []) {
      if (p?.id) pagesMap.set(p.id, { title: p.title, slug: p.slug });
    }
    /* villa_types.slug (migration 008) — SEO-friendly URL için.
       Eski kayıtlarda NULL olabilir; resolver UUID fallback'ine düşer. */
    const typesMap = new Map<string, { name: string; slug: string | null }>();
    for (const t of typesRes.data || []) {
      if (t?.id) {
        typesMap.set(t.id, {
          name: t.name,
          slug: (t as { slug?: string | null }).slug ?? null,
        });
      }
    }
    /* villa_locations.slug (migration 009) — SEO-friendly URL için.
       Eski kayıtlarda NULL olabilir; resolver UUID fallback'ine düşer. */
    const locsMap = new Map<string, { name: string; slug: string | null }>();
    for (const l of locsRes.data || []) {
      if (l?.id) {
        locsMap.set(l.id, {
          name: l.name,
          slug: (l as { slug?: string | null }).slug ?? null,
        });
      }
    }
    const sourceMaps: MenuSourceMaps = {
      pages: pagesMap,
      types: typesMap,
      locations: locsMap,
    };

    /* Menu satırları: resolver çalıştır; orphan'ları gizleme — admin
       görüp temizleyebilsin. Resolver null döndürdüyse manual fallback
       ile satırı orphan olarak işaretle.

       NOTE: DB client embed-select inference v2.105+ gevşek; select
       string'i ile dönen tipler `unknown` benzeri. Burada satır-bazlı
       narrow için minimum DB shape tanımlı. */
    type MenuFetchRow = {
      id: string;
      name: string | null;
      href: string | null;
      order: number | null;
      parent_id: string | null;
      source_type: string | null;
      source_id: string | null;
    };
    const mappedMenu: RowItem[] = ((menuRes.data || []) as MenuFetchRow[]).map((m) => {
      const rawRow: MenuRow = {
        id: m.id,
        name: m.name,
        href: m.href,
        order: m.order ?? 999,
        parent_id: m.parent_id ?? null,
        source_type: m.source_type,
        source_id: m.source_id,
      };
      const resolved = resolveMenuRow(rawRow, sourceMaps);

      const sourceType: MenuSourceType =
        m.source_type === "page" ||
        m.source_type === "category" ||
        m.source_type === "region"
          ? m.source_type
          : "manual";

      if (resolved) {
        return {
          id: resolved.id,
          name: resolved.name,
          href: resolved.href,
          order: resolved.order,
          parent_id: resolved.parent_id,
          kind: "menu",
          sourceType: resolved.source_type,
          sourceId: resolved.source_id,
          orphan: false,
        };
      }

      /* Orphan: source çözülemedi. Admin'in görüp temizleyebilmesi için
         menu.name / menu.href fallback'iyle render et. */
      return {
        id: m.id,
        name: m.name || "(kaynağı bulunamayan menü)",
        href: m.href || "#",
        order: m.order ?? 999,
        parent_id: m.parent_id ?? null,
        kind: "menu",
        sourceType,
        sourceId: m.source_id ?? null,
        orphan: true,
      };
    });

    /* Legacy pages auto-include: menu tarafında source_type='page' &
       source_id=p.id ile referansı olmayan sayfalar. Aynı sayfa hem
       auto-include hem explicit menu satırı olarak DUPLICATE
       görünmesin diye filter.

       🛡️ MANUEL MENÜ GÖRÜNÜRLÜĞÜ (migration 045): "OTOMATİK SAYFA"
       (page-auto) item'ları YALNIZ show_in_menu=true sayfalar için
       oluşur — public getMenu() ile BİREBİR senkron. show_in_menu=false
       sayfa admin menü listesinde de görünmez (CSS hide DEĞİL; kaynakta
       filtrelenir). NOT: explicit menü satırları (mappedMenu, menu
       tablosu) bu filtreden BAĞIMSIZ — admin'in manuel eklediği page
       item'ı show_in_menu=false olsa bile KAYBOLMAZ (explicit intent). */
    const referencedPageIds = new Set(
      (menuRes.data || [])
        .filter((m: any) => m.source_type === "page" && m.source_id)
        .map((m: any) => m.source_id as string)
    );

    const mappedPages: RowItem[] = (pagesRes.data || [])
      .filter(
        (p: any) => p.show_in_menu === true && !referencedPageIds.has(p.id)
      )
      .map((p: any) => ({
        id: p.id,
        name: p.title,
        href: `/p/${p.slug}`,
        order: p.menu_order ?? 999,
        parent_id: p.menu_parent_id ?? null,
        kind: "page-auto",
        sourceType: "page",
        sourceId: p.id,
        slug: p.slug,
      }));

    const merged = [...mappedMenu, ...mappedPages].sort(
      (a, b) => (a.order ?? 999) - (b.order ?? 999)
    );
    setItems(merged);
  }

  /* Persistence helper — `kind` doğru tabloyu seçer.
     kind="menu"     → menu.order, menu.parent_id (sourceType ne olursa
                       olsun; source_type/source_id presentation drag'da
                       değişmez, sadece order/parent güncellenir).
     kind="page-auto"→ pages.menu_order, pages.menu_parent_id */
  async function persistRow(
    item: RowItem,
    nextOrder: number,
    nextParentId: string | null
  ) {
    /* 🛡️ FAZ 2 frontend purge — adminFetch PATCH.
       menu satırı → /api/admin/menu?id=… body { order, parent_id }
       page-auto satırı → /api/admin/pages?id=… body { menu_order, menu_parent_id }
       Davranış BYTE-IDENTICAL: aynı update payload, aynı .eq("id", id).
       Eski caller `{ error }` destructure ile döner; route response'u
       aynı shape'e taşınıyor → caller dokunulmadan çalışır. */
    if (item.kind === "menu") {
      const res = await adminFetch(
        `/api/admin/menu?id=${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: nextOrder, parent_id: nextParentId }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      return {
        error:
          !res.ok || !json.ok
            ? { message: json.error || `HTTP ${res.status}` }
            : null,
      };
    }
    const res = await adminFetch(
      `/api/admin/pages?id=${encodeURIComponent(item.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu_order: nextOrder,
          menu_parent_id: nextParentId,
        }),
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    return {
      error:
        !res.ok || !json.ok
          ? { message: json.error || `HTTP ${res.status}` }
          : null,
    };
  }

  /* ===============================================================
     🛡️ HORIZONTAL-OFFSET NESTING (Notion / Framer / Shopify pattern)
     ===============================================================
     "Alt yap" / "Üst yap" butonları kaldırıldı; nesting tamamen
     drag jest'iyle yapılıyor:
       - Yatayda + NEST_THRESHOLD'dan fazla sağa sürükle → child
         (üstündeki item'a göre)
       - Yatayda − NEST_THRESHOLD'dan fazla sola sürükle → root
       - Aksi halde → mevcut parent_id korunur (sadece order değişir)

     Üstündeki item zaten child ise yeni item onunla SIBLING olur
     (max 2 seviye nesting korunur — frontend Header bu seviyeyi
     render ediyor; daha derin nesting visual'i bozardı).

     persistRow type-aware: menu vs pages tablosuna doğru kolon
     adlarıyla UPDATE. handleDragEnd batch Promise.all; herhangi bir
     fail'de fetchAll re-sync.
  =============================================================== */
  const NEST_THRESHOLD = 24; // px — Notion'a yakın bir eşik

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const movedItem = items[oldIndex];
    const reordered = arrayMove(items, oldIndex, newIndex);

    /* Hedef parent kararı — yatay drag offset'ine göre. */
    const horizontalOffset = delta?.x ?? 0;
    const itemAbove =
      newIndex > 0
        ? reordered[newIndex - 1]
        : null;

    let nextParentId: string | null = movedItem.parent_id ?? null;

    if (horizontalOffset > NEST_THRESHOLD && itemAbove) {
      /* Sağa belirgin sürükleme → nest. Üst item child ise onunla
         sibling ol (max 2 seviye); değilse onun altına geç. */
      nextParentId = itemAbove.parent_id
        ? itemAbove.parent_id
        : itemAbove.id;
    } else if (horizontalOffset < -NEST_THRESHOLD) {
      /* Sola belirgin sürükleme → root. */
      nextParentId = null;
    }
    /* Yatay yön çok küçük: mevcut parent_id korunur (sadece reorder). */

    /* Edge: ilk eleman olduysa zorla root (parent yukarısı olmaz). */
    if (newIndex === 0) nextParentId = null;

    const updatedItems = reordered.map((item, index) => {
      if (item.id === active.id) {
        return {
          ...item,
          order: index,
          parent_id: nextParentId,
        };
      }
      return { ...item, order: index };
    });

    setItems(updatedItems);

    try {
      await Promise.all(
        updatedItems.map((item) =>
          persistRow(item, item.order, item.parent_id ?? null)
        )
      );
      revalidateMenu().catch(() => {});
    } catch (err) {
      console.error("[menu.dragEnd] persist error:", err);
      fetchAll();
    }
  }

  /* Delete: kind="menu" satırlar silinebilir (manual, page, category,
     region — hepsi menu tablosunda). kind="page-auto" silinemez (auto-
     include LEGACY; yönetimi Sayfalar ekranında). */
  async function deleteItem(item: RowItem) {
    if (item.kind !== "menu") return;
    const proceed = await confirm({
      title: "Menü öğesi silinsin mi?",
      description: "Seçili kayıt kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    /* 🛡️ FAZ 2 frontend purge — adminFetch DELETE /api/admin/menu.
       Davranış BYTE-IDENTICAL: aynı .delete().eq("id", id) route içinde. */
    let delErr: string | null = null;
    try {
      const res = await adminFetch(
        `/api/admin/menu?id=${encodeURIComponent(item.id)}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        delErr = json.error || `HTTP ${res.status}`;
      }
    } catch (err) {
      delErr = err instanceof Error ? err.message : "İstek başarısız";
    }
    if (delErr) {
      toast.error("Silinemedi", {
        id: `menu-delete-${item.id}`,
        description: delErr,
      });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    toast.success("Menü öğesi silindi", { id: `menu-delete-${item.id}` });
    revalidateMenu().catch(() => {});
  }

  const tree = buildTree(items);

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="eyebrow">İçerik</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            Menü yönetimi
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Yukarı–aşağı sürükle: sırala. Yana sürükle:{" "}
            <span className="text-[var(--color-stone-900)] font-medium">
              sağa
            </span>{" "}
            ile alt menü,{" "}
            <span className="text-[var(--color-stone-900)] font-medium">
              sola
            </span>{" "}
            ile üst seviye. CMS sayfaları aynı tree&apos;de yer alır;
            içerikleri{" "}
            <Link
              href="/maki-admin/pages"
              className="text-[var(--color-stone-900)] underline decoration-[var(--color-champagne-500)] decoration-1 underline-offset-4 hover:decoration-[var(--color-champagne-700)] transition-colors"
            >
              Sayfalar
            </Link>{" "}
            ekranında düzenlenir.
          </p>
        </div>
        <Link
          href="/maki-admin/menu/new"
          className="btn-primary self-start"
        >
          <Plus size={15} />
          Menü Ekle
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Layers size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz menü yok
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            &ldquo;Menü Ekle&rdquo; ile ilk öğeni oluştur veya Sayfalar
            ekranından bir CMS sayfası yayınla.
          </p>
        </div>
      ) : (
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2.5">
              {tree.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  items={items}
                  onDelete={deleteItem}
                  translationsOpen={openTranslationsId === item.id}
                  onToggleTranslations={(id) =>
                    setOpenTranslationsId((prev) =>
                      prev === id ? null : id
                    )
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/* ===============================================================
   SortableItem — tek satır row component, type-aware render
   ===============================================================
   Drag handle her iki type için aktif.
   type === "page" iken:
     - "Otomatik" badge görünür
     - subtle sand background
     - Edit/delete YOK; "Sayfalar'dan yönet" linki
   type === "menu" iken:
     - Normal CRUD: Alt yap / Üst yap / Sil
=============================================================== */
function SortableItem({
  item,
  items,
  onDelete,
  translationsOpen,
  onToggleTranslations,
}: {
  item: RowItem;
  items: RowItem[];
  onDelete: (i: RowItem) => void;
  /** 🛡️ MIGRATION 086 — çeviri panelinin açık/kapalı durumu. */
  translationsOpen: boolean;
  onToggleTranslations: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isChild = !!item.parent_id;
  const parent = items.find((i) => i.id === item.parent_id);
  const isPageAuto = item.kind === "page-auto";
  const isOrphan = !!item.orphan;
  /* 🛡️ MIGRATION 086 — çeviri paneli YALNIZ manuel menülerde.
     page / page-auto adı `pages.title`'dan, category adı
     `villa_types.name`'den gelir; onların çevirisi kendi
     ekranlarındadır (Sayfalar / Villa Tipleri). region ise Phase
     10I gereği çevrilmez. Bu satırlarda buton HİÇ render edilmez. */
  const canTranslate = item.kind === "menu" && item.sourceType === "manual";

  /* Source badge metadata — UI'da ne tür navigation reference olduğunu
     açıkça gösterir. Manual badge'siz (default; gürültü yapmasın). */
  const sourceBadge = (() => {
    if (isPageAuto) {
      return { label: "Otomatik Sayfa", icon: FileText };
    }
    switch (item.sourceType) {
      case "page":
        return { label: "CMS Sayfa", icon: FileText };
      case "category":
        return { label: "Mülk Tipi", icon: Tag };
      case "region":
        return { label: "Bölge", icon: MapPin };
      default:
        return null;
    }
  })();

  const SourceIcon = sourceBadge?.icon;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        marginLeft: isChild ? 28 : 0,
        opacity: isDragging ? 0.55 : 1,
      }}
      className={
        "card-premium p-4 relative " +
        (isPageAuto ? "bg-[var(--color-sand-50)]/60 " : "") +
        (isOrphan ? "border-amber-200 bg-amber-50/40 " : "") +
        (isChild
          ? "before:absolute before:left-[-14px] before:top-1/2 before:h-px before:w-2.5 before:bg-[var(--color-stone-200)] before:content-['']"
          : "")
      }
    >
    <div className="flex justify-between items-center gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] p-1 -m-1 transition shrink-0"
          aria-label="Sürükle — yatay hareketle nest et"
          title="Sağa: alt yap • Sola: üst yap"
        >
          <GripVertical size={16} />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--color-stone-900)] truncate">
              {item.name}
            </p>

            {parent && (
              <span className="text-[10px] tracking-[0.1em] uppercase font-semibold text-[var(--color-champagne-700)] bg-[var(--color-sand-100)] px-2 py-0.5 rounded-full">
                ↳ {parent.name}
              </span>
            )}

            {sourceBadge && SourceIcon && (
              <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.1em] uppercase font-semibold text-[var(--color-champagne-700)] bg-white border border-[var(--color-stone-100)] px-2 py-0.5 rounded-full">
                <SourceIcon size={10} />
                {sourceBadge.label}
              </span>
            )}

            {isOrphan && (
              <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.1em] uppercase font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <AlertCircle size={10} />
                Kaynak Bulunamadı
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-stone-400)] tracking-[0.04em] uppercase font-mono truncate mt-0.5">
            {item.href}
          </p>
        </div>
      </div>

      {/* Tail aksiyon:
            - kind="page-auto"  → Sayfalar'dan yönet (silme yok)
            - kind="menu"       → Sil (manual, page, category, region — hepsi
                                   menu tablosunda, silmek menu satırını kaldırır;
                                   kaynak entity'ye dokunmaz) */}
      <div className="flex gap-1 items-center shrink-0">
        {isPageAuto ? (
          <Link
            href="/maki-admin/pages"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] px-2.5 py-1.5 rounded-lg hover:bg-white transition"
          >
            Sayfalar&apos;dan yönet →
          </Link>
        ) : (
          <>
            {/* 🛡️ MIGRATION 086 — menü adı çevirileri (EN/DE). YALNIZ
                `source_type === "manual"` satırlarda; silme butonunun
                SOLUNDA, mevcut aksiyon dili korunarak. */}
            {canTranslate && (
              <button
                type="button"
                onClick={() => onToggleTranslations(item.id)}
                aria-expanded={translationsOpen}
                className={
                  "inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg transition " +
                  (translationsOpen
                    ? "text-[var(--color-stone-900)] bg-[var(--color-sand-100)]"
                    : "text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] hover:bg-white")
                }
              >
                <Languages size={12} />
                Çeviriler
              </button>
            )}
            <button
              onClick={() => onDelete(item)}
              className="inline-flex items-center gap-1.5 text-[12px] text-red-600 hover:text-red-700 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition"
            >
              <Trash2 size={12} />
              Sil
            </button>
          </>
        )}
      </div>
    </div>

      {/* Çeviri paneli — satırın ALTINDA, drag handle'ın dışında.
          Kapalıyken hiçbir DOM/istek üretmez (lazy mount). */}
      {translationsOpen && canTranslate && (
        <div className="mt-3">
          <MenuTranslationsPanel menuId={item.id} menuName={item.name} />
        </div>
      )}
    </div>
  );
}
