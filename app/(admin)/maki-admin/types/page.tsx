"use client";

import { useEffect, useRef, useState } from "react";
import {
  getVillaTypesAction as getVillaTypes,
  addVillaTypeAction as addVillaType,
  updateVillaTypeAction as updateVillaType,
  deleteVillaTypeAction as deleteVillaType,
  setVillaTypeCoverAction as setVillaTypeCover,
  setVillaTypeHomepageAction as setVillaTypeHomepage,
  setVillaTypeSortOrdersAction as setVillaTypeSortOrders,
} from "./types.action";
import {
  Plus,
  Save,
  Trash2,
  Layers,
  ImagePlus,
  GripVertical,
  Languages,
} from "lucide-react";
import {
  SortableList,
  type DragHandleProps,
} from "@/app/components/admin/shared/SortableList";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import {
  revalidateTaxonomy,
  revalidateMenu,
} from "@/app/services/revalidate.actions";
import { storageProvider } from "@/lib/storage";
import {
  getCategoryCoverPublicUrl,
  buildCategoryCoverPath,
  SITE_ASSETS_BUCKET_NAME,
} from "@/lib/storage.helpers";
import { useSiteAssetVersions } from "@/lib/storage/use-site-asset-versions";
import { convertImageToWebP } from "@/lib/image.helpers";
/* 🛡️ PHASE 10D — Batch 3 — multilingual_enabled kontrolü. Batch 2'de
   Features için kanıtlanan TopBar.tsx deseni (getPublicSettingsAction,
   public-safe, "use client" bileşenlerden çağrılabilir) BİREBİR aynı
   şekilde buraya taşındı — yeni bir settings-fetch sistemi İCAT
   EDİLMEDİ. */
import { getPublicSettingsAction } from "@/app/services/settings.action";
import TypeTranslationsPanel from "./TypeTranslationsPanel";

export default function TypesPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [types, setTypes] = useState<any[]>([]);
  /* 🛡️ Kapak önizlemesi `?v=<R2 ETag>` — `category-covers/<slug>.webp`
     overwrite edildiğinde liste yeni görseli göstersin. */
  const assetVersions = useSiteAssetVersions(types.map((t) => t?.cover_image));
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  /* 🛡️ Upload-in-progress map — aynı anda birden fazla kategori
     upload edilirse her birinin spinner state'i izole. */
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* 🔀 SORT MODE (migration 066) — inline sıralama. Snapshot YALNIZ moda
     girerken alınır; İptal snapshot'a döner; Kaydet başarılı olursa commit
     + snapshot temizlenir; RPC fail → snapshot'a geri dönülür. */
  const [sortMode, setSortMode] = useState(false);
  const [orderSnapshot, setOrderSnapshot] = useState<any[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  /* 🛡️ PHASE 10D — Batch 3 — çeviri paneli state'i. `openTypeId`
     yalnız TEK panelin açık olmasını sağlar (Batch 2 Features ile
     birebir aynı mekanik). */
  const [multilingualEnabled, setMultilingualEnabled] = useState(false);
  const [openTypeId, setOpenTypeId] = useState<string | null>(null);

  async function load() {
    const data = await getVillaTypes();
    setTypes(data);
  }

  useEffect(() => {
    load();
  }, []);

  /* 🛡️ PHASE 10D — Batch 3 — TopBar.tsx / FeaturesPage (Batch 2) ile
     BİREBİR AYNI fetch mekaniği (useEffect + cancelled guard). Settings
     null/hata → fail-safe KAPALI. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const settings = await getPublicSettingsAction();
      if (cancelled) return;
      setMultilingualEnabled(!!settings?.multilingual_enabled);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleTranslations(id: string) {
    setOpenTypeId((prev) => (prev === id ? null : id));
  }

  /* 🛡️ Migration 061 — "Anasayfada Göster" toggle. Optimistic state +
     servis persist + taxonomy cache invalidate (homepage CategoryCollection
     `getCachedVillaTypes` tag "taxonomy" → değişiklik anında yansır). */
  async function handleToggleHomepage(id: string, next: boolean) {
    setTypes((prev) =>
      prev.map((x) => (x.id === id ? { ...x, show_on_homepage: next } : x))
    );
    const ok = await setVillaTypeHomepage(id, next);
    if (!ok) {
      // geri al
      setTypes((prev) =>
        prev.map((x) =>
          x.id === id ? { ...x, show_on_homepage: !next } : x
        )
      );
      toast.error("Güncellenemedi", { id: `type-home-${id}` });
      return;
    }
    await revalidateTaxonomy();
    toast.success(
      next ? "Anasayfada gösterilecek" : "Anasayfadan gizlendi",
      { id: `type-home-${id}` }
    );
  }

  async function handleAdd() {
    if (!name) return;
    setLoading(true);
    const success = await addVillaType(name);
    if (!success) {
      toast.error("Kaydedilemedi", { id: "type-create" });
      setLoading(false);
      return;
    }
    setName("");
    await load();
    setLoading(false);
    toast.success("Mülk tipi eklendi", { id: "type-create" });
    /* 🛡️ CACHE INVALIDATION (Faz 5):
       Taxonomy mutation → public taxonomy cache + menu lookup
       (villa_types.name menu source + CategoryCollection covers)
       anında stale olur. Non-blocking fire-and-forget. */
    revalidateTaxonomy().catch(() => {});
    revalidateMenu().catch(() => {});
  }

  async function handleUpdate(id: string, newName: string) {
    /* 🛡️ SEO URL KORUMASI — ad değişince mevcut slug KORUNUR (explicit
       geçilir); `/villa-turleri/<slug>` landing URL'i ve menü/footer
       linkleri kırılmaz. Slug'ı henüz olmayan (legacy NULL) kayıtta
       `undefined` → servis ESKİSİ GİBİ addan üretir. */
    const existingSlug = String(
      types.find((t) => t.id === id)?.slug ?? ""
    ).trim();
    const ok = await updateVillaType(id, newName, existingSlug || undefined);
    if (!ok) {
      toast.error("Güncellenemedi", { id: `type-update-${id}` });
      return;
    }
    load();
    toast.success("Mülk tipi güncellendi", { id: `type-update-${id}` });
    /* 🛡️ CACHE INVALIDATION — name değişimi menu auto-include
       lookup'unda görünür stale yaratır + Hero/sidebar/category
       chip label'ları güncellenmeli. */
    revalidateTaxonomy().catch(() => {});
    revalidateMenu().catch(() => {});
  }

  /* ===============================================================
     🛡️ COVER UPLOAD — kategori kapak görseli (migration 010)
     ===============================================================
     Path deterministik: `category-covers/{slug}.{ext}`. Aynı slug
     için tekrar upload → upsert: true ile eski overwrite (duplicate
     dosya birikmez). DB'ye bucket-relative path yazılır; bucket /
     domain değişimine immune.

     PRECONDITION: kategorinin slug'ı olmalı (migration 008 backfill
     sonrası tüm kayıtlar slug'lı; eski NULL slug'lı kayıt nadir).
     Slug yoksa toast hatası — admin önce ismi "Kaydet" ile slug
     üretir, sonra upload.

     Başarı sonrası revalidateTaxonomy(); menu invalidate gereksiz
     (cover_image menu auto-include lookup'unda kullanılmıyor). */
  async function handleCoverUpload(t: any, file: File) {
    const slug: string = String(t?.slug || "").trim();
    if (!slug) {
      toast.error("Slug yok", {
        id: `type-cover-${t.id}`,
        description:
          "Önce kategori adını kaydet — slug otomatik üretilince görsel yüklenebilir.",
      });
      return;
    }
    /* 🛡️ WEBP CONVERSION (production-grade):
       Storage'a HER ZAMAN .webp yazılır → CDN/cache/LCP avantajı +
       deterministik path. Overwrite semantic intact: aynı slug
       tekrar upload edilirse aynı .webp dosyasının üstüne yazılır. */
    const webpFile = await convertImageToWebP(file);
    const path = buildCategoryCoverPath(slug, "webp");
    if (!path) return;

    setUploadingId(t.id);
    try {
      /* FAZ 38: storageProvider.upload delege. */
      const upRes = await storageProvider.upload(
        SITE_ASSETS_BUCKET_NAME,
        path,
        webpFile,
        {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "3600",
        }
      );
      if (!upRes.ok) {
        toast.error("Yüklenemedi", {
          id: `type-cover-${t.id}`,
          description: upRes.error,
        });
        return;
      }
      const ok = await setVillaTypeCover(t.id, path);
      if (!ok) {
        toast.error("DB güncellenemedi", { id: `type-cover-${t.id}` });
        return;
      }
      await load();
      await assetVersions.refresh(path);
      toast.success("Kapak görseli güncellendi", {
        id: `type-cover-${t.id}`,
      });
      /* Cover değişti → public chip/cover UI'lar fresh fetch alsın. */
      revalidateTaxonomy().catch(() => {});
    } finally {
      setUploadingId(null);
      /* file input reset — aynı dosyayı tekrar seçebilmek için. */
      const inp = fileInputRefs.current[t.id];
      if (inp) inp.value = "";
    }
  }

  async function handleDelete(id: string) {
    const proceed = await confirm({
      title: "Mülk tipi silinsin mi?",
      description: "Seçili kayıt kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await deleteVillaType(id);
    if (!ok) {
      toast.error("Silinemedi", { id: `type-delete-${id}` });
      return;
    }
    if (openTypeId === id) setOpenTypeId(null);
    load();
    toast.success("Mülk tipi silindi", { id: `type-delete-${id}` });
    /* 🛡️ CACHE INVALIDATION — silinen type menu lookup'unda
       orphan kalır, CategoryCollection covers da yeniden hesaplanmalı
       (covers tag'i: villas + taxonomy → taxonomy invalidation
       yeterli; villas tag'i ayrıca invalidate edilmiyor çünkü
       villa kayıtları değişmedi, sadece relation). */
    revalidateTaxonomy().catch(() => {});
    revalidateMenu().catch(() => {});
  }

  /* ── SORT MODE handlers ─────────────────────────────────────── */
  function enterSortMode() {
    setOrderSnapshot(types); // snapshot YALNIZ moda girerken
    setSortMode(true);
  }

  function cancelSort() {
    if (orderSnapshot) setTypes(orderSnapshot); // sırayı + listeyi geri yükle
    setOrderSnapshot(null);
    setSortMode(false);
  }

  async function saveSort() {
    setSavingOrder(true);
    const updates = types.map((t, idx) => ({
      id: String(t.id),
      sort_order: idx,
    }));
    const ok = await setVillaTypeSortOrders(updates);
    setSavingOrder(false);

    if (!ok) {
      // RPC fail → snapshot'a otomatik geri dön + hata
      if (orderSnapshot) setTypes(orderSnapshot);
      toast.error("Sıralama kaydedilemedi", { id: "type-sort" });
      return;
    }

    // başarı → yeni sıra commit + snapshot temizle + modu kapat
    setOrderSnapshot(null);
    setSortMode(false);
    /* Public/SSR cache invalidation — CategoryCollection/arama/kiralik-villalar/
       kisa-sureli-tarihler yeni sırayı görsün (tag "taxonomy"). */
    await revalidateTaxonomy();
    toast.success("Sıralama güncellendi", { id: "type-sort" });
  }

  /* Kart render — HER İKİ modda ORTAK. sortMode=false iken mevcut davranış
     byte-identical (drag handle YOK, input editable, cover/checkbox aktif,
     Kaydet/Sil görünür). sortMode=true iken: handle görünür, input readonly,
     cover/checkbox disabled, Kaydet/Sil gizli.

     🛡️ PHASE 10D — Batch 3: dönüş değeri, panelin altına eklenebilmesi için
     bir Fragment'e sarıldı (key={t.id} — hem SortableList içinde hem düz
     `types.map` içinde kullanılabilsin diye). Kart JSX'inin kendisi
     BYTE-IDENTICAL kaldı; yalnız "Çeviriler" butonu (Kaydet/Sil ile aynı
     `!sortMode` bloğunda) ve altına koşullu panel eklendi. */
  const renderTypeRow = (t: any, dragHandleProps?: DragHandleProps) => {
    const coverUrl = assetVersions.versioned(
      getCategoryCoverPublicUrl(t?.cover_image),
      t?.cover_image
    );
    const isUploading = uploadingId === t.id;
    const hasSlug = !!String(t?.slug || "").trim();
    return (
      <div key={t.id}>
        <div className="card-premium p-3 flex items-center gap-2">
          {/* 🔀 DRAG HANDLE — yalnız Sort Mode. SADECE bu handle sürükler. */}
          {sortMode && dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              aria-label={`Sürükle: ${t.name} sırasını değiştir`}
              title="Sürükle: sırala"
              className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] cursor-grab active:cursor-grabbing transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
            >
              <GripVertical size={15} />
            </button>
          )}

          {/* 🛡️ COVER THUMBNAIL — sade küçük kare. coverUrl varsa
             image, yoksa boş placeholder. Tıklayınca file picker. */}
          <button
            type="button"
            onClick={() => fileInputRefs.current[t.id]?.click()}
            disabled={isUploading || !hasSlug || sortMode}
            title={
              !hasSlug
                ? "Önce 'Kaydet' ile slug üret"
                : coverUrl
                ? "Görseli değiştir"
                : "Görsel yükle"
            }
            className="relative w-12 h-12 rounded-lg overflow-hidden bg-[var(--color-sand-50)] border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={coverUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-[var(--color-stone-400)]">
                <ImagePlus size={16} />
              </span>
            )}
            {isUploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-medium text-[var(--color-stone-700)]">
                …
              </span>
            )}
          </button>
          <input
            ref={(el) => {
              fileInputRefs.current[t.id] = el;
            }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCoverUpload(t, f);
            }}
          />

          {/* 🛡️ INPUT + SLUG SUBTEXT — Sort Mode'da readonly. */}
          <div className="flex-1 min-w-0">
            <input
              value={t.name}
              onChange={(e) => {
                const updated = types.map((x) =>
                  x.id === t.id ? { ...x, name: e.target.value } : x
                );
                setTypes(updated);
              }}
              readOnly={sortMode}
              className="input w-full"
            />
            {t.slug && (
              <p className="text-[11px] text-[var(--color-stone-400)] tracking-[0.06em] font-mono truncate mt-1.5 pl-3">
                /{t.slug}
              </p>
            )}
          </div>

          {/* 🛡️ Migration 061 — "Anasayfada Göster" toggle. Sort Mode'da disabled. */}
          <label
            className="inline-flex items-center gap-2 text-[12.5px] text-[var(--color-stone-600)] cursor-pointer select-none px-2 shrink-0"
            title="Anasayfa Kategoriler slider'ında göster"
          >
            <input
              type="checkbox"
              checked={t.show_on_homepage !== false}
              onChange={(e) => handleToggleHomepage(t.id, e.target.checked)}
              disabled={sortMode}
            />
            <span className="hidden sm:inline">Anasayfada Göster</span>
          </label>

          {/* Kaydet + Sil — Sort Mode'da gizli */}
          {!sortMode && (
            <>
              <button
                onClick={() => handleUpdate(t.id, t.name)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
              >
                <Save size={13} />
                Kaydet
              </button>

              {/* 🛡️ PHASE 10D — Batch 3 — yalnız multilingual_enabled=true
                  iken render edilir; mevcut Kaydet/Sil aksiyonlarını
                  BOZMAZ, ayrı bir buton. */}
              {multilingualEnabled && (
                <button
                  onClick={() => toggleTranslations(t.id)}
                  aria-label={`${t.name} çevirileri`}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                >
                  <Languages size={13} />
                  Çeviriler
                </button>
              )}

              <button
                onClick={() => handleDelete(t.id)}
                className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition"
              >
                <Trash2 size={13} />
                Sil
              </button>
            </>
          )}
        </div>

        {!sortMode && multilingualEnabled && openTypeId === t.id && (
          <TypeTranslationsPanel typeId={t.id} typeName={t.name} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8 w-full">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Yönetim</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            Mülk tipleri
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Anasayfa filtrelerinde ve mülk kayıtlarında kullanılır.
          </p>
        </div>

        {/* 🔀 SORT MODE toggle — sağ üst. Kapalıyken tek buton; açıkken
           Kaydet Sıralama + İptal. */}
        <div className="shrink-0 flex items-center gap-2">
          {!sortMode ? (
            <button
              type="button"
              onClick={enterSortMode}
              disabled={types.length < 2 || loading || uploadingId !== null}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GripVertical size={14} />
              Sıralamayı Düzenle
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={saveSort}
                disabled={savingOrder}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={14} />
                {savingOrder ? "Kaydediliyor…" : "Kaydet Sıralama"}
              </button>
              <button
                type="button"
                onClick={cancelSort}
                disabled={savingOrder}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İptal
              </button>
            </>
          )}
        </div>
      </div>

      {/* ADD — Sort Mode'da gizli */}
      {!sortMode && (
        <div className="card-premium p-5 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tip adı (Örn: Lüks Villa)"
            className="input flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <button
            onClick={handleAdd}
            disabled={loading || !name}
            className="btn-primary"
          >
            <Plus size={15} />
            {loading ? "Ekleniyor…" : "Ekle"}
          </button>
        </div>
      )}

      {/* LIST */}
      {types.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Layers size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz tip eklenmemiş
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Yukarıdan ilk mülk tipini eklemeyi dene.
          </p>
        </div>
      ) : sortMode ? (
        /* 🔀 SORT MODE — dnd-kit (SortableList). Yalnız handle sürükler;
           onReorder optimistic setTypes; kart tasarımı AYNEN (renderTypeRow). */
        <SortableList
          items={types}
          getId={(t) => String(t.id)}
          onReorder={setTypes}
          className="space-y-2.5"
        >
          {(t, { dragHandleProps }) => renderTypeRow(t, dragHandleProps)}
        </SortableList>
      ) : (
        /* Normal mod — mevcut liste BYTE-IDENTICAL (dnd-kit tamamen kapalı). */
        <div className="space-y-2.5">{types.map((t) => renderTypeRow(t))}</div>
      )}
    </div>
  );
}
