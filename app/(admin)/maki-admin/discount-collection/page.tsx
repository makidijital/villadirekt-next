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
  Tag,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import {
  listDiscountCollectionAction as listDiscountCollection,
  addToDiscountCollectionAction as addToDiscountCollection,
  removeFromDiscountCollectionAction as removeFromDiscountCollection,
  toggleDiscountCollectionActiveAction as toggleDiscountCollectionActive,
  updateDiscountCollectionItemAction as updateDiscountCollectionItem,
  reorderDiscountCollectionAction as reorderDiscountCollection,
  listVillaDiscountPeriodsAction,
  type VillaDiscountPeriodOption,
} from "./discount-collection.action";
import type {
  DiscountCollectionItem,
  SelectedDiscountRange,
} from "@/app/services/discount-collection.service";
import { revalidateDiscount } from "@/app/services/revalidate.actions";
/* 🐛 FIX — /maki-admin/villas aramasıyla aynı Türkçe-tolerant normalize. */
import { normalizeSearchText } from "@/lib/search";

/* ===============================================================
   🛡️ DISCOUNT COLLECTION ADMIN — "İndirimli Koleksiyon" curasyon UI
   ===============================================================
   homepage-collection/page.tsx'in BİREBİR klonu (migration 062).
   SETTINGS BAĞIMLILIĞI YOK: section başlık/alt başlık frontend'de
   hardcoded; görünürlük otomatik (aktif villa varsa render). Villa
   seçimi/sıralama/aktif discount_collections tablosunda; her mutation
   revalidateDiscount().

   🛡️ VİLLA SEÇİM HAVUZU FİLTRESİ — "Villa Ekle" seçicisi artık YALNIZCA
   `villa_discounts` tablosunda EN AZ 1 kaydı olan villaları listeler
   (`/api/admin/villas?activeOnly=1&hasDiscount=1` — yeni opt-in
   `hasDiscount` query param'ı, bkz. route.ts). Tarih filtresi YOK —
   aktif/geçmiş/gelecek fark etmez, yalnız kaydın VARLIĞI yeterli.
   Arama (`search`) ve sayfalama (`.slice(0, 50)`) zaten bu (artık
   önceden filtrelenmiş) `allVillas` state'i üzerinde çalışıyor — ek
   bir değişiklik gerekmedi. Mevcut discount_collections kayıtlarının
   ekleme/silme/güncelleme/sıralama/görüntüleme akışına (action'lar,
   DnD, toggle, title save) HİÇ dokunulmadı.
=============================================================== */

type VillaOption = {
  id: string;
  title: string;
  slug: string | null;
};

export default function DiscountCollectionPage() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [items, setItems] = useState<DiscountCollectionItem[]>([]);
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
    const [list, villasJson] = await Promise.all([
      listDiscountCollection(),
      (async () => {
        try {
          const res = await adminFetch(
            "/api/admin/villas?activeOnly=1&hasDiscount=1"
          );
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
    revalidateDiscount().catch(() => {});
  }

  async function handleAdd(villa_id: string) {
    setPersisting(true);
    const ok = await addToDiscountCollection(villa_id);
    setPersisting(false);
    if (!ok) {
      toast.error("Eklenemedi", { id: "dc-add" });
      return;
    }
    setShowPicker(false);
    setSearch("");
    await load();
    fireRevalidate();
    toast.success("İndirimli koleksiyona eklendi", { id: "dc-add" });
  }

  async function handleRemove(item: DiscountCollectionItem) {
    const proceed = await confirm({
      title: "Koleksiyondan çıkarılsın mı?",
      description:
        "Mülk kaydı silinmez — sadece indirimli koleksiyondan çıkarılır.",
      confirmLabel: "Çıkar",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await removeFromDiscountCollection(item.id);
    if (!ok) {
      toast.error("Silinemedi", { id: `dc-rm-${item.id}` });
      return;
    }
    await load();
    fireRevalidate();
    toast.success("Koleksiyondan çıkarıldı", { id: `dc-rm-${item.id}` });
  }

  async function handleToggle(item: DiscountCollectionItem) {
    const next = !item.is_active;
    setItems((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, is_active: next } : p))
    );
    const ok = await toggleDiscountCollectionActive(item.id, next);
    if (!ok) {
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, is_active: item.is_active } : p
        )
      );
      toast.error("Güncellenemedi", { id: `dc-tg-${item.id}` });
      return;
    }
    fireRevalidate();
  }

  async function handleSaveTitle(
    item: DiscountCollectionItem,
    newTitle: string
  ) {
    const ok = await updateDiscountCollectionItem(item.id, {
      custom_title: newTitle,
    });
    if (!ok) {
      toast.error("Kaydedilemedi", { id: `dc-tt-${item.id}` });
      return;
    }
    await load();
    fireRevalidate();
    toast.success("Başlık güncellendi", { id: `dc-tt-${item.id}` });
  }

  /* 🛡️ MIGRATION 092 — indirim dönemi küratörlük seçimi.
     `villa_discounts` kayıtlarına DOKUNMAZ; yalnız
     `discount_collections.selected_discount_ranges` güncellenir.
     Mevcut `updateDiscountCollectionItem` yolu kullanılır (yeni
     action/servis YOK). */
  async function handleSaveRanges(
    item: DiscountCollectionItem,
    ranges: SelectedDiscountRange[]
  ) {
    const ok = await updateDiscountCollectionItem(item.id, {
      selected_discount_ranges: ranges,
    });
    if (!ok) {
      toast.error("Dönem seçimi kaydedilemedi", { id: `dc-rg-${item.id}` });
      return;
    }
    await load();
    fireRevalidate();
    toast.success("Dönem seçimi güncellendi", { id: `dc-rg-${item.id}` });
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
    setItems(next);
    setPersisting(true);
    const ok = await reorderDiscountCollection(next.map((i) => i.id));
    setPersisting(false);
    if (!ok) {
      toast.error("Sıra kaydedilemedi", { id: "dc-reorder" });
      load();
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
          İndirimli Koleksiyon
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Anasayfada &quot;İndirimli Koleksiyon&quot; bölümünde gösterilecek
          villaları manuel seç, sırala ve aktif/pasif yönet. Bölüm, en az bir
          aktif villa eklenince otomatik görünür; villa yoksa gizlenir.
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
            <Tag size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Koleksiyon boş
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-md mx-auto">
            İndirimli koleksiyon bölümü, en az bir aktif mülk eklenince
            anasayfada görünür. Yukarıdan mülk ekleyin.
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
                  onSaveRanges={(r) => handleSaveRanges(item, r)}
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
  onSaveRanges,
}: {
  item: DiscountCollectionItem;
  onRemove: () => void;
  onToggle: () => void;
  onSaveTitle: (t: string) => void;
  onSaveRanges: (ranges: SelectedDiscountRange[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const villaImages = item.villa?.villa_images ?? [];
  const cover = resolveVillaImageUrl(
    [...villaImages].sort((a, b) => {
      if (a?.is_cover) return -1;
      if (b?.is_cover) return 1;
      return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
    })[0]?.image_url
  );

  /* ---- 🛡️ MIGRATION 092 — indirim dönemi seçimi (lazy) ----
     Liste YALNIZ bölüm açılınca çekilir → sayfa ilk yüklemesinde
     villa başına ek istek (N+1) OLUŞMAZ. */
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [periods, setPeriods] = useState<VillaDiscountPeriodOption[] | null>(
    null
  );
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(
    () =>
      new Set(
        (item.selected_discount_ranges ?? []).map((r) => `${r.start}|${r.end}`)
      )
  );
  const [rangesSaving, setRangesSaving] = useState(false);
  /* NULL/[] → seçim yok → TÜM görünür dönemler (legacy davranış). */
  const hasExplicitSelection = (item.selected_discount_ranges ?? []).length > 0;

  async function togglePeriodsOpen() {
    const next = !periodsOpen;
    setPeriodsOpen(next);
    if (next && periods === null && !periodsLoading) {
      setPeriodsLoading(true);
      const rows = await listVillaDiscountPeriodsAction(item.villa_id).catch(
        () => [] as VillaDiscountPeriodOption[]
      );
      setPeriods(rows);
      setPeriodsLoading(false);
    }
  }

  const [title, setTitle] = useState(
    item.custom_title ?? item.villa?.title ?? ""
  );
  const titleDirty =
    (title || "").trim() !==
    (item.custom_title ?? item.villa?.title ?? "").trim();

  return (
    /* 🛡️ Dış sarmalayıcı: MEVCUT satır görünümü (card-premium p-3 +
       opacity) AYNEN korunur; satırın kendisi değişmeden bir alt
       bölüm eklenebilsin diye dikey konteyner yapıldı. */
    <div
      ref={setNodeRef}
      style={style}
      className={
        "card-premium p-3 " + (item.is_active ? "" : "opacity-60")
      }
    >
    <div className="flex items-center gap-3">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] p-1 shrink-0"
        aria-label="Sürükle"
      >
        <GripVertical size={16} />
      </button>

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

      <button
        type="button"
        onClick={() => onSaveTitle(title)}
        disabled={!titleDirty}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Save size={13} />
        Kaydet
      </button>

      <button
        type="button"
        onClick={onToggle}
        title={item.is_active ? "Pasif yap" : "Aktif yap"}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
      >
        {item.is_active ? <Eye size={13} /> : <EyeOff size={13} />}
        {item.is_active ? "Aktif" : "Pasif"}
      </button>

      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition"
      >
        <Trash2 size={13} />
        Çıkar
      </button>
    </div>

    {/* ═══════════════════════════════════════════════════════
        🛡️ MIGRATION 092 — İNDİRİM DÖNEMİ SEÇİMİ
        ═══════════════════════════════════════════════════════
        Admin bu villanın HANGİ indirim dönemlerinin public ana
        sayfada gösterileceğini seçer. Seçilen her dönem public'te
        AYRI bir kart olur.
        ⚠️ Seçim YALNIZ küratörlük tercihidir — `villa_discounts`
        kayıtları ASLA silinmez/değiştirilmez (fiyat sistemi onlara
        bağlıdır).
        ⚠️ Hiçbiri seçili değilse TÜM görünür dönemler gösterilir. */}
    <div className="mt-2.5 border-t border-[var(--color-stone-100)] pt-2.5">
      <button
        type="button"
        onClick={togglePeriodsOpen}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] transition"
      >
        {periodsOpen ? (
          <ChevronDown size={13} />
        ) : (
          <ChevronRight size={13} />
        )}
        İndirim dönemleri
        <span className="text-[11px] text-[var(--color-stone-400)]">
          {hasExplicitSelection
            ? `(${(item.selected_discount_ranges ?? []).length} seçili)`
            : "(tümü)"}
        </span>
      </button>

      {periodsOpen && (
        <div className="mt-2.5 pl-1">
          {periodsLoading && (
            <p className="text-[12px] text-[var(--color-stone-400)]">
              Yükleniyor…
            </p>
          )}
          {!periodsLoading && periods !== null && periods.length === 0 && (
            <p className="text-[12px] text-[var(--color-stone-400)]">
              Bu mülkte indirim dönemi yok.
            </p>
          )}
          {!periodsLoading && periods !== null && periods.length > 0 && (
            <>
              <ul className="space-y-1.5">
                {periods.map((p) => {
                  const key = `${p.start_date}|${p.end_date}`;
                  const isChecked = checked.has(key);
                  return (
                    <li key={key}>
                      <label className="flex items-center gap-2 text-[13px] text-[var(--color-stone-700)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                          className="accent-[var(--color-champagne-600)]"
                        />
                        <span className="font-mono text-[12px]">
                          {p.start_date} – {p.end_date}
                        </span>
                        <span className="text-[12px] text-[var(--color-stone-500)]">
                          {p.discount_type === "percent"
                            ? `%${p.discount_value}`
                            : `${p.discount_value} ${p.currency || ""}`.trim()}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center gap-3 mt-2.5">
                <button
                  type="button"
                  disabled={rangesSaving}
                  onClick={async () => {
                    setRangesSaving(true);
                    const ranges: SelectedDiscountRange[] = periods
                      .filter((p) =>
                        checked.has(`${p.start_date}|${p.end_date}`)
                      )
                      .map((p) => ({ start: p.start_date, end: p.end_date }));
                    await onSaveRanges(ranges);
                    setRangesSaving(false);
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-50)] transition disabled:opacity-40"
                >
                  <Save size={13} />
                  Seçimi kaydet
                </button>
                <p className="text-[11px] text-[var(--color-stone-400)]">
                  Hiçbiri seçili değilse tüm dönemler gösterilir.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
