"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  DndContext,
  DragOverlay,
  closestCenter,
  DragEndEvent,
  type AutoScrollOptions,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { GripVertical } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import { revalidateVillas } from "@/app/services/revalidate.actions";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { fastNewIndex } from "./sort-new-index";

/* ===============================================================
   🛡️ VillaSortPanel — admin drag-drop sıralama (MINIMAL)
   ===============================================================
   `/maki-admin/villas/siralama` route'una bağlı client island.
   Mevcut VillaSortableGrid'in drag-drop core'u BURAYA TAŞINDI.
   `set_villa_sort_orders` RPC + adminFetch + revalidate akışı
   BİREBİR aynı.

   FARKLAR (operasyon kart'ına göre):
     - Search YOK (subset reorder global sort_order'ı bozar
       → sıralama ekranında search yapısal olarak imkansız)
     - Operasyon aksiyonları (düzenle/galeri/takvim/ZIP/Temporary
       URL/kopyala/pasifleştir/sil) YOK
     - Kapak görseli YOK
     - Fiyat / pasif badge YOK
     - Kart minimal: drag handle + villa adı + #ID + sıra no

   AMAÇ: 1000+ villa scale'inde hafif render.

   KORUNAN DAVRANIŞLAR:
     - DndContext + SortableContext + verticalListSortingStrategy
     - arrayMove + idx-based sort_order map
     - adminFetch POST /api/admin/villas/sort-orders
     - setVillaSortOrders → RPC set_villa_sort_orders
     - revalidateVillas() (tag "villas" invalidation)
     - router.refresh() (admin force-dynamic re-fetch)
     - Optimistic UI + fail revert
     - useNotify toast pattern
     - useEffect[initialVillas] state sync (router.refresh sonrası)
=============================================================== */

/* Minimal VillaItem: yalnız sıralama UI'sının okuduğu alanlar.
   Service `getVillasForAdmin` ekstra alanlar döndürür ama bu
   panel onları okumaz (tip loose `[k: string]: unknown`). */
type VillaItem = {
  id: string;
  title: string;
  sort_order?: number;
  [k: string]: unknown;
};

/* ⚡ DRAG HIZI — yalnız bu ekran (başka admin sayfaları etkilenmez)
   ---------------------------------------------------------------
   • Auto-scroll: dnd-kit'in KENDİ ayarı (özel scroll loop'u YOK).
     Hız, pointer viewport'un üst/alt %20'lik bölgesine girdikçe
     doğrusal artar; en kenarda `acceleration` px / 5 ms'ye ulaşır.
     Varsayılan 10 → 40 (en kenarda teorik ≈8.000 px/sn; bölgenin
     iç sınırına yakın yavaş → hassas konumlama korunur).
   • Sibling kart animasyonu: varsayılan 200 ms → 120 ms. Hızlı
     scroll'da kartlar pointer'ın gerisinde kalmaz.
   • DragOverlay: sürüklenen kart `position: fixed` bir kopya olarak
     pointer'a yapışık çizilir; hızlı auto-scroll'da listede geride
     kalmaz. Listedeki asıl kart, bırakılacağı yeri gösteren yer
     tutucu olur. Bırakınca animasyon yok (anında).
   • getNewIndex: O(N²) varsayılan yerine O(1) (bkz. sort-new-index).
   • Uzun liste: yalnız viewport'a YAKIN kartlar (±NEAR_MARGIN)
     dnd-kit'e kayıtlı (useSortable). Uzaktaki kartlar birebir aynı
     görünümde statik render edilir. dnd-kit her pointer/scroll
     adımında tüm kayıtlı kartları yeniden hesapladığı için (çarpışma
     + yer değiştirme) 1.000+ villada ana thread kilitleniyordu; artık
     iş, liste uzunluğundan bağımsız (~görünen kart sayısı).
     Sürüklenen kart her zaman kayıtlı kalır. Sıra/index'ler ve
     SortableContext `items` TÜM listeyi içerir → global sort_order
     semantiği ve kaydedilen değerler değişmez. */
const AUTO_SCROLL: AutoScrollOptions = { acceleration: 40 };
const SORT_TRANSITION = { duration: 120, easing: "ease-out" };
const GRIP_ICON = <GripVertical size={14} />;
const DRAG_HANDLE_CLASS = `
          shrink-0 inline-flex items-center justify-center
          w-7 h-7 rounded-md
          text-[var(--admin-muted-2)] hover:text-[var(--admin-text)]
          hover:bg-[var(--admin-bg-soft)]
          cursor-grab active:cursor-grabbing
          transition-colors motion-reduce:transition-none
          focus:outline-none focus-visible:ring-2
          focus-visible:ring-[var(--admin-accent-soft,rgba(0,0,0,0.1))]
          disabled:opacity-50 disabled:cursor-not-allowed
        `;

/* Viewport'un üst/altından bu kadar uzaktaki kartlar da kayıtlı
   tutulur (hızlı scroll'da hedef kart her zaman hazır olsun). */
const NEAR_MARGIN = "1500px 0px";
/* İlk render (SSR + hydration) için: IntersectionObserver ilk
   sonucunu verene kadar üstteki kartlar kayıtlı başlar. */
const INITIAL_NEAR_COUNT = 40;

/* Tek (paylaşılan) IntersectionObserver — kart başına observer yok. */
type NearCallback = (near: boolean) => void;
let nearObserver: IntersectionObserver | null = null;
const nearCallbacks = new WeakMap<Element, NearCallback>();
function observeNearViewport(el: Element, cb: NearCallback): () => void {
  if (typeof IntersectionObserver === "undefined") {
    cb(true); // eski tarayıcı: eski davranış (tüm kartlar kayıtlı)
    return () => {};
  }
  nearObserver ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) nearCallbacks.get(e.target)?.(e.isIntersecting);
    },
    { rootMargin: NEAR_MARGIN }
  );
  nearCallbacks.set(el, cb);
  nearObserver.observe(el);
  return () => {
    nearObserver?.unobserve(el);
    nearCallbacks.delete(el);
  };
}

export default function VillaSortPanel({
  initialVillas,
}: {
  initialVillas: VillaItem[];
}) {
  const router = useRouter();
  const toast = useNotify();

  const [items, setItems] = useState<VillaItem[]>(initialVillas);
  const [persisting, setPersisting] = useState(false);
  /* Yalnız DragOverlay içeriği için (sıralama mantığı kullanmaz). */
  const [activeId, setActiveId] = useState<string | null>(null);

  /* Prop değişirse (router.refresh sonrası) local state'i senkronize et. */
  useEffect(() => {
    setItems(initialVillas);
  }, [initialVillas]);

  /* ⚡ SMOOTH SCROLL — globals.css `html { scroll-behavior: smooth }`
     dnd-kit'in auto-scroll'u her 5 ms'de `scrollBy` çağırır; smooth
     davranışta her çağrı bir önceki animasyonu kesip yeniden başlatır
     → scroll çok yavaş/takılır. Yalnız SÜRÜKLEME SÜRESİNCE <html>
     inline `scroll-behavior: auto` yapılır; bırakma/iptal/unmount'ta
     önceki inline değer AYNEN geri yüklenir. CSS dosyası değişmez. */
  const restoreScrollRef = useRef<(() => void) | null>(null);
  const restoreScrollBehavior = useCallback(() => {
    restoreScrollRef.current?.();
    restoreScrollRef.current = null;
  }, []);
  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    restoreScrollBehavior();
    const root = document.documentElement;
    const prevInline = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    restoreScrollRef.current = () => {
      root.style.scrollBehavior = prevInline;
    };
  }
  useEffect(() => restoreScrollBehavior, [restoreScrollBehavior]);
  function handleDragCancel() {
    setActiveId(null);
    restoreScrollBehavior();
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    restoreScrollBehavior();
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((v) => v.id === active.id);
    const newIndex = items.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);

    /* Optimistic: önce UI'ı güncelle, sonra persist. Fail olursa revert. */
    const prev = items;
    setItems(reordered);
    setPersisting(true);

    const updates = reordered.map((v, idx) => ({
      id: String(v.id),
      sort_order: idx,
    }));

    /* 🛡️ adminFetch POST /api/admin/villas/sort-orders.
       Route içinde `setVillaSortOrders` service delege; RPC payload +
       return BYTE-IDENTICAL. Mevcut VillaSortableGrid ile aynı endpoint. */
    let res: { ok: boolean; error?: string };
    try {
      const apiRes = await adminFetch("/api/admin/villas/sort-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = (await apiRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      res =
        apiRes.ok && json.ok
          ? { ok: true }
          : { ok: false, error: json.error || `HTTP ${apiRes.status}` };
    } catch (err) {
      res = {
        ok: false,
        error: err instanceof Error ? err.message : "İstek başarısız",
      };
    }
    setPersisting(false);

    if (!res.ok) {
      setItems(prev);
      toast.error("Sıralama kaydedilemedi", {
        id: "villa-sort",
        description: res.error,
      });
      return;
    }

    toast.success("Sıralama güncellendi", { id: "villa-sort" });
    /* Public/SSR cache invalidation — frontend listelerin (/, /arama,
       /kiralik-villalar) yeni sırayı görmesi için. */
    revalidateVillas().catch(() => {});
    router.refresh();
  }

  /* 🛡️ PERF — `SortableContext` her render'da YENİ dizi kimliği
     alıyordu (`items.map(v => v.id)` inline). useMemo ile kimlik
     `items` değişmedikçe sabit kalır → SortableContext gereksiz
     yeniden hesaplama yapmaz. Dizinin İÇERİĞİ ve SIRASI birebir
     aynı; dnd-kit sözleşmesi değişmedi.
     ⚠️ Erken `return`'den ÖNCE çağrılır — hook sırası her render'da
     aynı kalmalı (react-hooks/rules-of-hooks). */
  const sortableIds = useMemo(() => items.map((v) => v.id), [items]);
  const activeIndex = activeId
    ? items.findIndex((v) => v.id === activeId)
    : -1;
  const activeVilla = activeIndex === -1 ? null : items[activeIndex];

  if (items.length === 0) {
    return (
      <div className="admin-card-flat p-12 text-center text-[var(--admin-muted-2)]">
        <p className="font-medium text-[var(--admin-text)]">
          Sıralanacak mülk yok
        </p>
        <p className="text-[12.5px] mt-1">
          Önce{" "}
          <Link
            href="/maki-admin/villas/ekle"
            className="underline underline-offset-4 hover:text-[var(--admin-text)]"
          >
            yeni mülk
          </Link>{" "}
          ekleyin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-[var(--admin-muted-2)]">
          Toplam{" "}
          <span className="font-semibold text-[var(--admin-text)]">
            {items.length}
          </span>{" "}
          villa
        </p>
        {persisting && (
          <p className="text-[12px] text-[var(--admin-muted-2)]">
            Kaydediliyor…
          </p>
        )}
      </div>

      <DndContext
        collisionDetection={closestCenter}
        autoScroll={AUTO_SCROLL}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {items.map((villa, index) => (
              <SortRow
                key={villa.id}
                villa={villa}
                index={index}
                persisting={persisting}
                forceSortable={villa.id === activeId}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeVilla ? (
            <article className="admin-card p-3 flex items-center gap-3 shadow-xl cursor-grabbing">
              <span
                aria-hidden
                className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--admin-text)] bg-[var(--admin-bg-soft)]"
              >
                {GRIP_ICON}
              </span>
              <SortRowContent
                title={activeVilla.title}
                id={String(activeVilla.id)}
                index={activeIndex}
              />
            </article>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/* ⚡ SortRow — kart viewport'a yakınsa (veya sürükleniyorsa) dnd-kit
   kartı, değilse aynı görünümde statik kart. Sarmalayıcı <div> yalnız
   IntersectionObserver hedefi; flex `gap` aynı şekilde uygulanır. */
const SortRow = memo(function SortRow({
  villa,
  index,
  persisting,
  forceSortable,
}: {
  villa: VillaItem;
  index: number;
  persisting: boolean;
  forceSortable: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(index < INITIAL_NEAR_COUNT);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeNearViewport(el, setNear);
  }, []);

  return (
    <div ref={ref}>
      {near || forceSortable ? (
        <SortRowCard villa={villa} index={index} persisting={persisting} />
      ) : (
        <article className="admin-card p-3 flex items-center gap-3">
          <button
            type="button"
            aria-label={`Sürükle: ${villa.title} sırasını değiştir`}
            title="Sürükle: sırala"
            disabled={persisting}
            className={DRAG_HANDLE_CLASS}
          >
            {GRIP_ICON}
          </button>
          <SortRowContent title={villa.title} id={String(villa.id)} index={index} />
        </article>
      )}
    </div>
  );
});

/* ===============================================================
   SortRowCard — minimal kart: drag handle + title + #ID + sıra no
   ===============================================================
   Operasyon kart'ından bilinçli olarak SADELEŞTİRİLDİ. 1000+ villa
   scale'inde DOM'da render edilecek node sayısı düşürüldü.
=============================================================== */
const SortRowCard = memo(function SortRowCard({
  villa,
  index,
  persisting,
}: {
  villa: VillaItem;
  index: number;
  persisting: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: villa.id,
    transition: SORT_TRANSITION,
    getNewIndex: fastNewIndex,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={
        "admin-card p-3 flex items-center gap-3 " +
        (isDragging ? "z-10" : "")
      }
    >
      {/* DRAG HANDLE — tek interactive element; tüm listener'lar
         burada (operasyon kart'ı paterni ile birebir). */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Sürükle: ${villa.title} sırasını değiştir`}
        title="Sürükle: sırala"
        disabled={persisting}
        className={DRAG_HANDLE_CLASS}
      >
        {GRIP_ICON}
      </button>

      <SortRowContent title={villa.title} id={String(villa.id)} index={index} />
    </article>
  );
});


/* ⚡ Kart içeriği (başlık + #ID + sıra no) — memo: sürükleme sırasında
   dnd-kit tüm kartların hook'larını yeniden çalıştırır; içerik props'u
   değişmediği için bu alt ağaç yeniden render EDİLMEZ. Görünüm aynı;
   DragOverlay kopyası da aynı bileşeni kullanır. */
const SortRowContent = memo(function SortRowContent({
  title,
  id,
  index,
}: {
  title: string;
  id: string;
  index: number;
}) {
  return (
    <>
      {/* CONTENT — title + #ID */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--admin-text)] truncate">
          {title}
        </p>
        <p className="text-[11.5px] text-[var(--admin-muted-2)] mt-0.5 font-mono">
          #{id.slice(0, 8)}
        </p>
      </div>

      {/* SIRA NO — sağ tarafta, görünür index (1-based) */}
      <span
        className="shrink-0 text-[12px] text-[var(--admin-muted-2)] tabular-nums"
        title={`sort_order = ${index}`}
      >
        #{index + 1}
      </span>
    </>
  );
});
