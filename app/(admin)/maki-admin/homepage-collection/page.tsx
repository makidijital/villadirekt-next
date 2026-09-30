"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  GripVertical,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Save,
  Home,
  Image as ImageIcon,
} from "lucide-react";

/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   Villa list /api/admin/villas?activeOnly=1 üzerinden (aynı select +
   filter + order semantic). */
import { adminFetch } from "@/lib/admin-fetch";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import {
  listHomepageCollectionAction as listHomepageCollection,
  addToHomepageCollectionAction as addToHomepageCollection,
  removeFromHomepageCollectionAction as removeFromHomepageCollection,
  toggleHomepageCollectionActiveAction as toggleHomepageCollectionActive,
  updateHomepageCollectionItemAction as updateHomepageCollectionItem,
  reorderHomepageCollectionAction as reorderHomepageCollection,
} from "./homepage-collection.action";
import type { HomepageCollectionItem } from "@/app/services/homepage-collection.service";
import { revalidateHomepage } from "@/app/services/revalidate.actions";
/* 🐛 FIX — /maki-admin/villas aramasıyla aynı Türkçe-tolerant normalize. */
import { normalizeSearchText } from "@/lib/search";

/* ===============================================================
   🛡️ HOMEPAGE COLLECTION ADMIN — manuel curasyon UI
   ===============================================================
   Migration 012 sonrası sidebar > İçerik > "Anasayfa Koleksiyon".
   - Villa search dropdown: aktif + silinmemiş villalar
   - Drag-drop sıralama (@dnd-kit/sortable)
   - Aktif toggle
   - Custom title input (villa kartında gösterilen başlığı override)
   - Silme (hard delete satır — villa silinmez)
   - Her mutation sonrası revalidateHomepage() fire-and-forget

   FALLBACK CONTRACT:
     Aktif kayıt yoksa veya hepsi pasifse → VillaList eski
     getCachedVillas() otomatik moduna düşer. Admin tek tıkla
     "Pasif" yaparsa otomatik moda dönebilir.
=============================================================== */

type VillaOption = {
  id: string;
  title: string;
  slug: string | null;
};

export default function HomepageCollectionPage() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [items, setItems] = useState<HomepageCollectionItem[]>([]);
  const [allVillas, setAllVillas] = useState<VillaOption[]>([]);
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [persisting, setPersisting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  async function load() {
    setLoading(true);
    /* 🛡️ FAZ 2 — adminFetch GET /api/admin/villas?activeOnly=1.
       Route içinde aynı .eq("is_active", true).is("deleted_at", null)
       .order("title", asc) zinciri. Davranış BYTE-IDENTICAL: aynı select
       shape (id, title, slug; ek field'lar VillaOption type'ına uymaz
       ama cast harmless). Parallel fetch semantic'i Promise.all aynen. */
    const [list, villasJson] = await Promise.all([
      listHomepageCollection(),
      (async () => {
        try {
          const res = await adminFetch("/api/admin/villas?activeOnly=1");
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            villas?: any[];
          };
          return res.ok && json.ok ? json.villas || [] : [];
        } catch {
          return [];
        }
      })(),
    ]);
    setItems(list);
    setAllVillas(villasJson as VillaOption[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const usedVillaIds = useMemo(
    () => new Set(items.map((i) => i.villa_id)),
    [items]
  );
  const availableVillas = useMemo(
    () =>
      allVillas
        .filter((v) => !usedVillaIds.has(v.id))
        .filter((v) =>
          search.trim().length === 0
            ? true
            : normalizeSearchText(v.title || "").includes(
                normalizeSearchText(search)
              )
        ),
    [allVillas, usedVillaIds, search]
  );

  function fireRevalidate() {
    revalidateHomepage().catch(() => {});
  }

  async function handleAdd(villa_id: string) {
    setPersisting(true);
    const ok = await addToHomepageCollection(villa_id);
    setPersisting(false);
    if (!ok) {
      toast.error("Eklenemedi", { id: "hc-add" });
      return;
    }
    setShowPicker(false);
    setSearch("");
    await load();
    fireRevalidate();
    toast.success("Koleksiyona eklendi", { id: "hc-add" });
  }

  async function handleRemove(item: HomepageCollectionItem) {
    const proceed = await confirm({
      title: "Koleksiyondan çıkarılsın mı?",
      description:
        "Mülk kaydı silinmez — sadece anasayfa koleksiyonundan çıkarılır.",
      confirmLabel: "Çıkar",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await removeFromHomepageCollection(item.id);
    if (!ok) {
      toast.error("Silinemedi", { id: `hc-rm-${item.id}` });
      return;
    }
    await load();
    fireRevalidate();
    toast.success("Koleksiyondan çıkarıldı", { id: `hc-rm-${item.id}` });
  }

  async function handleToggle(item: HomepageCollectionItem) {
    /* Optimistic toggle */
    const next = !item.is_active;
    setItems((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, is_active: next } : p))
    );
    const ok = await toggleHomepageCollectionActive(item.id, next);
    if (!ok) {
      /* revert */
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, is_active: item.is_active } : p
        )
      );
      toast.error("Güncellenemedi", { id: `hc-tg-${item.id}` });
      return;
    }
    fireRevalidate();
  }

  async function handleSaveTitle(
    item: HomepageCollectionItem,
    newTitle: string
  ) {
    const ok = await updateHomepageCollectionItem(item.id, {
      custom_title: newTitle,
    });
    if (!ok) {
      toast.error("Kaydedilemedi", { id: `hc-tt-${item.id}` });
      return;
    }
    await load();
    fireRevalidate();
    toast.success("Başlık güncellendi", { id: `hc-tt-${item.id}` });
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx).map((i, idx) => ({
      ...i,
      sort_order: idx,
    }));
    setItems(next); // optimistic
    setPersisting(true);
    const ok = await reorderHomepageCollection(next.map((i) => i.id));
    setPersisting(false);
    if (!ok) {
      toast.error("Sıra kaydedilemedi", { id: "hc-reorder" });
      load(); // revert via reload
      return;
    }
    fireRevalidate();
  }

  return (
    <div className="space-y-8 w-full">
      {/* HEADER */}
      <div>
        <p className="eyebrow">İçerik</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Anasayfa Koleksiyon
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Anasayfada gösterilecek villaları manuel seç, sırala ve aktif/pasif
          yönet. Aktif kayıt yoksa anasayfa otomatik villa listesine
          (en yeni eklenenler) düşer.
        </p>
      </div>

      {/* ADD VILLA */}
      <div className="card-premium p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-medium text-[var(--color-stone-900)]">
            Mülk ekle
          </h2>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="btn-primary"
          >
            <Plus size={15} />
            {showPicker ? "Kapat" : "Mülk Seç"}
          </button>
        </div>
        {showPicker && (
          <div className="border-t border-[var(--color-stone-100)] pt-4">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mülk ara…"
              className="input w-full mb-3"
            />
            {availableVillas.length === 0 ? (
              <p className="text-sm text-[var(--color-stone-500)]">
                {usedVillaIds.size === allVillas.length
                  ? "Tüm aktif mülkler koleksiyonda."
                  : "Eşleşen mülk bulunamadı."}
              </p>
            ) : (
              <ul className="max-h-72 overflow-auto divide-y divide-[var(--color-stone-100)]">
                {availableVillas.slice(0, 50).map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => handleAdd(v.id)}
                      disabled={persisting}
                      className="w-full text-left px-3 py-2.5 hover:bg-[var(--color-sand-50)] flex items-center justify-between gap-3 disabled:opacity-50"
                    >
                      <span className="text-[14px] text-[var(--color-stone-900)] truncate">
                        {v.title}
                      </span>
                      <span className="text-[11px] text-[var(--color-stone-400)] tracking-[0.06em] font-mono">
                        /{v.slug || "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* LIST */}
      {loading ? (
        <div className="card-premium p-10 text-center text-sm text-[var(--color-stone-500)]">
          Yükleniyor…
        </div>
      ) : items.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Home size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Koleksiyon boş
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-md mx-auto">
            Anasayfa şu an otomatik mülk listesi gösteriyor. Manuel
            yönetmek için yukarıdan mülk ekleyin.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2.5">
              {items.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  onRemove={() => handleRemove(item)}
                  onToggle={() => handleToggle(item)}
                  onSaveTitle={(t) => handleSaveTitle(item, t)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {persisting && (
        <p className="text-[11px] text-[var(--color-stone-400)]">
          Kaydediliyor…
        </p>
      )}
    </div>
  );
}

/* ===============================================================
   SortableRow — drag handle + thumbnail + title input + actions
=============================================================== */
function SortableRow({
  item,
  onRemove,
  onToggle,
  onSaveTitle,
}: {
  item: HomepageCollectionItem;
  onRemove: () => void;
  onToggle: () => void;
  onSaveTitle: (t: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const villaImages = item.villa?.villa_images ?? [];
  /* 🛡️ Bucket-fix — resolveVillaImageUrl: villa-images bucket'ından
     URL üretir; legacy FULL URL pass-through, Phase B path → URL. */
  const cover = resolveVillaImageUrl(
    [...villaImages].sort((a, b) => {
      if (a?.is_cover) return -1;
      if (b?.is_cover) return 1;
      return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
    })[0]?.image_url
  );

  const [title, setTitle] = useState(
    item.custom_title ?? item.villa?.title ?? ""
  );
  const titleDirty = (title || "").trim() !== (item.custom_title ?? item.villa?.title ?? "").trim();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "card-premium p-3 flex items-center gap-3 " +
        (item.is_active ? "" : "opacity-60")
      }
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] p-1 shrink-0"
        aria-label="Sürükle"
      >
        <GripVertical size={16} />
      </button>

      {/* Thumbnail */}
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-[var(--color-sand-50)] border border-[var(--color-stone-200)] shrink-0">
        {cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[var(--color-stone-400)]">
            <ImageIcon size={14} />
          </span>
        )}
      </div>

      {/* Title (custom override) */}
      <div className="flex-1 min-w-0">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={item.villa?.title ?? "Mülk başlığı"}
          className="input w-full"
        />
        <p className="text-[11px] text-[var(--color-stone-400)] tracking-[0.06em] font-mono truncate mt-1.5 pl-3">
          /{item.villa?.slug ?? "—"}
        </p>
      </div>

      {/* Save title */}
      <button
        type="button"
        onClick={() => onSaveTitle(title)}
        disabled={!titleDirty}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Save size={13} />
        Kaydet
      </button>

      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        title={item.is_active ? "Pasif yap" : "Aktif yap"}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
      >
        {item.is_active ? <Eye size={13} /> : <EyeOff size={13} />}
        {item.is_active ? "Aktif" : "Pasif"}
      </button>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition"
      >
        <Trash2 size={13} />
        Çıkar
      </button>
    </div>
  );
}
