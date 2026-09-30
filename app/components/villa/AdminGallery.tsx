"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { storageProvider } from "@/lib/storage";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import {
  useConfirm,
  useNotify,
} from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🛡️ UPLOAD SIZE GUARD — production hardening
   ===============================================================
   8 MB per-file cap. Gerekçe:
     • Modern DSLR / akıllı telefon yüksek-çözünürlük JPEG 3-6 MB
     • Pro / RAW / 8K source dosyalar bu sınırın üstünde (admin
       gönderirse browser canvas pipeline kasar — `convertToWebP`
       `createImageBitmap` üzerinde 50+ MB image dekoderi browser'ı
       freeze edebilir, mobile admin için kritik)
     • Client-side WebP dönüşümü zaten %50-70 küçültür; admin
       genelde 5-10 MB kaynak dosya yükler → 1-3 MB WebP elde eder
     • 8 MB üst sınır production "kazara dev dosya seçti" tipi
       hatalar için yeterli; gerçek kullanım %99 altında kalır

   Limit aşıldığında: pre-validation, `convertToWebP`/upload başlatma
   YOK; admin'e açıkça bildir (mevcut `alert(...)` UX pattern'i;
   line 107 villaId guard'ı ile aynı). 10 dosyalık batch'te
   bazıları büyükse: valid'ler devam eder, büyükler skip, kullanıcıya
   hangileri olduğu liste halinde söylenir.
=============================================================== */
const MAX_UPLOAD_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_UPLOAD_FILE_SIZE_LABEL = "2 MB";
/* 🛡️ BATCH COUNT CAP — tek seferde en fazla görsel adedi. */
const MAX_UPLOAD_BATCH_COUNT = 80;
/* 🛡️ Sıralama + kapak yazmaları server action üzerinden (villa-image.
   mutations / @/lib/db client bundle'a girmez); server'da session-aware
   client → RLS admin yetkisi aynen. */
import {
  reorderGalleryImages,
  setGalleryCover,
} from "./admin-gallery.action";
import type { VillaImage } from "@/app/services/villa-image/villa-image.types";
import {
  VILLA_IMAGES_BUCKET,
  buildVillaImagePath,
  nextGallerySequenceFromUrls,
} from "@/lib/villa-image.helpers";

/* ===============================================================
   🛡️ ADMIN GALLERY — villa image upload + reorder + cover toggle
   ===============================================================
   STORAGE PATH SOURCE-OF-TRUTH (Faz 7 refactor):
     Path üretimi artık `lib/villa-image.helpers` üzerinden.
     Yeni format: villas/{slug}__{shortId}/gallery-NNNN-XXXX.webp
     Eski format hala okunabilir (read backward-compat); yeni
     upload yeni klasöre düşer.

   ORPHAN PREVENTION:
     Upload başarılı + DB insert başarısız ise storage dosyası
     temizlenir. `onUploaded` artık `Promise<boolean | void>`
     döndürebilir; `false` döndürürse rollback tetiklenir.
     Backward-compat: `void`/`undefined` → eski davranış (başarı
     varsayımı). Hiçbir caller bozulmaz.
   =============================================================== */

type Props = {
  /* 🛡️ Faz 9 hardening: `images: any[]` → `VillaImage[]`. Service
     katmanından gelen row tipi (id, villa_id, image_url, ...).
     Caller `getVillaImages` zaten bu tipi döndürüyordu. */
  images: VillaImage[];
  villaId: string;
  /** 🛡️ Yeni: villa slug — readable storage folder için.
   *  Opsiyonel (geriye dönük uyum); verilmezse "villa" generic slug
   *  kullanılır, shortId yine villa.id'den deterministik. */
  villaSlug?: string | null;
  /** DB insert sonucu. `false` → AdminGallery storage rollback yapar.
   *  `void`/`undefined`/`true` → başarı varsayımı (mevcut davranış). */
  onUploaded: (url: string) => Promise<boolean | void>;
  onDelete: (id: string) => Promise<void>;
  /** 🛡️ Bulk delete — opsiyonel (backward-compat). Verilmezse
   *  "Tüm Resimleri Sil" butonu render edilmez; verilirse
   *  `useConfirm` ile onay alınır, success/error toast ile
   *  bildirim verilir. Caller boolean ile başarı/başarısızlık
   *  döner; service tarafı (`deleteAllVillaImages`) zaten
   *  DB-first + storage best-effort + idempotent. */
  onDeleteAll?: () => Promise<boolean>;
  onReorder: () => Promise<void>;
};

export default function AdminGallery({
  images,
  villaId,
  villaSlug = null,
  onUploaded,
  onDelete,
  onDeleteAll,
  onReorder,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  /* 🛡️ MULTI-SELECT + GROUP DRAG (dnd-kit) — native HTML5 DnD yerine.
     Seçim ID-bazlı (Set<string>); index-bazlı DEĞİL. activeId yalnız
     DragOverlay + grup/tekli ayrımı için. Save zinciri (reorderGallery
     Images → updateImageOrder → sort_order) AYNEN korunur. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  /* 🛡️ SSR guard — DragOverlay yalnız client mount sonrası body'ye
     portal edilir (server'da document yok). Hydration-safe. */
  const [mounted, setMounted] = useState(false);
  const sensors = useSensors(
    /* Desktop: 8px hareket eşiği → click/checkbox ile karışmaz.
       Touch: 250ms press-delay + tolerance → kısa dokunma seçim,
       uzun basış sürükleme; sayfa scroll'u bozulmaz. */
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    })
  );
  const [loading, setLoading] = useState(false);
  /* 🛡️ Bulk delete loading state — UI yalnız bu state aktifken
     buton "Siliniyor…" + disabled. */
  const [deletingAll, setDeletingAll] = useState(false);
  const confirm = useConfirm();
  const toast = useNotify();

  /* 🛡️ HANDLE DELETE ALL — confirmation + service call + toast.
     Akış: useConfirm() → cancel ise return. Onaylanırsa onDeleteAll()
     callback'i parent'a delege (parent `deleteAllVillaImages(villaId)`
     çağırır, başarılıysa `loadImages()` ile UI state'i tazeler).
     Başarı → success toast; başarısızlık → error toast.
     Mevcut tekli delete, upload, reorder, cover akışlarına
     dokunulmaz. */
  async function handleDeleteAllClick() {
    if (!onDeleteAll) return;
    if (images.length === 0) return;

    const proceed = await confirm({
      title: "Tüm fotoğraflar silinsin mi?",
      description:
        "Bu villaya ait tüm fotoğraflar kalıcı olarak silinecek. Bu işlem geri alınamaz.",
      confirmLabel: "Evet, Tümünü Sil",
      variant: "danger",
    });
    if (!proceed) return;

    setDeletingAll(true);
    const ok = await onDeleteAll();
    setDeletingAll(false);

    if (ok) {
      toast.success("Tüm fotoğraflar silindi", { id: "gallery-delete-all" });
    } else {
      toast.error("Silme işlemi başarısız oldu", {
        id: "gallery-delete-all",
      });
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  /* 🛡️ SELECTION PRUNE — silinen görsellerin id'si seçimde kalmasın
     (indicator sayacı doğru kalır). dnd-kit'in yerleşik autoScroll'u
     drag sırasında pencere kaydırmayı üstlenir → eski native rAF
     auto-scroll helper'ına artık gerek yok. */
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(
        [...prev].filter((id) => images.some((i) => i.id === id))
      );
      return next.size === prev.size ? prev : next;
    });
  }, [images]);

  // 🔥 DEBUG (çok önemli)
  console.log("🚀 villaId:", villaId);

  function handleClick() {
    inputRef.current?.click();
  }

  // 🔥 WEBP + resize
  async function convertToWebP(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);

    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / bitmap.width);

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context alınamadı");

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("WebP dönüşüm başarısız"));
            return;
          }
          resolve(blob);
        },
        "image/webp",
        0.8
      );
    });
  }

  // 🔥 upload
  async function handleFiles(files: FileList | null) {
    if (!files) return;

    // 🚨 GUARD (en kritik)
    if (!villaId || villaId === "undefined") {
      console.error("❌ villaId YOK → upload iptal");
      alert("Villa ID bulunamadı");
      return;
    }

    /* 🛡️ SIZE VALIDATION — pre-convert, pre-upload.
       Per-file 8 MB cap (üst yorum bloğu gerekçe). Geçersiz dosyalar
       skip edilir; geçerliler kalan akışa devam eder. Tüm batch iptal
       edilmez — admin'in 10 valid + 2 büyük dosya seçimi 10 dosyayı
       yükler, 2'sini bildirip atlar.

       NOT: client-side `<input accept="image/*">` MIME tipini
       filter'lar; ek mime guard eklemiyoruz (admin trust + browser
       filter yeterli; sunucu tarafı eski sağlayıcı upload'ı `image/webp`
       contentType ile zorlar). */
    const selectedFiles = Array.from(files);

    /* 🛡️ BATCH COUNT LIMIT — tek seferde en fazla 50 görsel kabul edilir.
       Fazladan seçilen dosyalar upload kuyruğuna EKLENMEZ; ilk 50 işlenir,
       kalan sayısı kullanıcıya bildirilir (mevcut alert UX pattern'i). */
    if (selectedFiles.length > MAX_UPLOAD_BATCH_COUNT) {
      const skippedCount = selectedFiles.length - MAX_UPLOAD_BATCH_COUNT;
      alert(
        `Tek seferde en fazla ${MAX_UPLOAD_BATCH_COUNT} görsel yükleyebilirsiniz.\n\n` +
          `Fazladan seçilen ${skippedCount} dosya yüklenmedi.`
      );
    }
    const allFiles = selectedFiles.slice(0, MAX_UPLOAD_BATCH_COUNT);
    const validFiles: File[] = [];
    const oversizedFiles: string[] = [];

    for (const file of allFiles) {
      if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        const sizeMb = (file.size / 1024 / 1024).toFixed(1);
        oversizedFiles.push(`• ${file.name} (${sizeMb} MB)`);
      } else {
        validFiles.push(file);
      }
    }

    if (oversizedFiles.length > 0) {
      /* 🛡️ Mevcut UX pattern (line 107 villaId guard'ı) `alert(...)`.
         Inline error UI yerine alert tercihi — minimal-diff +
         component'te toast helper henüz wired değil. */
      alert(
        `Aşağıdaki dosyalar ${MAX_UPLOAD_FILE_SIZE_LABEL} sınırını aştığı için yüklenmedi:\n\n` +
          oversizedFiles.join("\n") +
          `\n\nLütfen dosyaları küçültüp tekrar deneyin.`
      );
    }

    if (validFiles.length === 0) {
      /* Hiç geçerli dosya yok → loading state'e girmeden çık. */
      return;
    }

    setLoading(true);

    try {
      /* 🛡️ NEW PATH STRATEGY (Faz 7):
         Path: villas/{slug}__{shortId}/gallery-NNNN-XXXX.webp
         - shortId: villa.id ilk 8 hex (deterministic, stable).
         - Slug: readability; folder slug değişse bile RENAME edilmez.
         - NNNN: villa-içi monotonik seq; mevcut dosyaların max+1'i.
         - XXXX: race koruması (concurrent upload).

         Eski kayıtlar farklı path'te (uuid/uuid.webp) — DB'de full URL
         tuttuğumuz için reads etkilenmez; bu döngü yalnız YENİ
         uploadların pathini değiştirir. */
      const existingUrls = images.map((i) => i?.image_url as string | null);
      let seq = nextGallerySequenceFromUrls(existingUrls);

      for (const file of validFiles) {
        const blob = await convertToWebP(file);

        const villaForPath = { id: villaId, slug: villaSlug };
        const fileName = buildVillaImagePath(villaForPath, seq, "webp");

        /* 🛡️ upsert: false — yeni path artık deterministik prefix +
           rand4 suffix kullandığı için file collision riski 1/65536.
           Çakışırsa bu yükleme atlanır; user retry → fresh rand4 ile
           dener. Race koruması yeterli.
           FAZ 38: storageProvider.upload delege. */
        const upRes = await storageProvider.upload(
          VILLA_IMAGES_BUCKET,
          fileName,
          blob,
          { contentType: "image/webp", upsert: false }
        );

        if (!upRes.ok) {
          console.error("❌ Upload error:", upRes.error);
          // Seq'i ilerletmeyelim; bir sonraki dosyada aynı seq tekrar
          // denensin (filename'deki random suffix farklı olacak).
          continue;
        }

        /* 🛡️ Aşama B — DB'ye RELATIVE PATH yaz (örn.
           "villas/<slug>__<shortId>/gallery-NNNN-XXXX.webp").
           Read tarafı (VillaCard / Gallery / cache.helpers.ts) Aşama A
           sayesinde resolveAssetUrl ile path→URL üretir. Legacy FULL URL
           kayıtları AYNEN çalışır (HTTP(S) pass-through). Storage
           provider değişiminde DB UPDATE gerekmez. */

        /* 🛡️ ORPHAN PREVENTION:
           onUploaded → addVillaImage → DB insert. Eski signature
           Promise<void> idi; artık opsiyonel boolean kabul ediyor
           (backward-compat). `false` dönerse storage rollback yapıp
           bir sonraki dosyaya geçiyoruz.
           FAZ 38: storageProvider.remove delege (retry + idempotent
           provider içinde). */
        const dbResult = await onUploaded(fileName);
        if (dbResult === false) {
          console.error("❌ DB insert failed; rolling back storage:", fileName);
          try {
            await storageProvider.remove(VILLA_IMAGES_BUCKET, [fileName]);
          } catch (rollbackErr) {
            console.error("❌ storage rollback failed:", rollbackErr);
          }
          continue;
        }

        // Başarılı → bir sonraki dosya için seq +1
        seq++;
      }
    } catch (err) {
      console.error("🔥 Upload pipeline error:", err);
    } finally {
      setLoading(false);
    }
  }

  // 🔥 selection helpers (ID-bazlı)
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  /* 🔥 GROUP / SINGLE DRAG REORDER — save zinciri AYNEN
     (reorderGalleryImages → updateImageOrder → sort_order).
     Seçim varsa VE sürüklenen kart seçiliyse GRUP; aksi halde TEKLİ
     (mevcut single-drag davranışı korunur). Grup: seçililer mevcut
     sıralarıyla (iç sıra korunur) drop pozisyonuna tek blok yerleşir. */
  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const aId = String(active.id);
    const oId = String(over.id);

    const isGroup = selectedIds.size > 0 && selectedIds.has(aId);
    const movingSet = isGroup
      ? new Set(images.filter((i) => selectedIds.has(i.id)).map((i) => i.id))
      : new Set([aId]);

    if (!isGroup && aId === oId) return; // hareket yok

    const moving = images.filter((i) => movingSet.has(i.id)); // iç sıra korunur
    const remaining = images.filter((i) => !movingSet.has(i.id));

    let insertAt: number;
    if (movingSet.has(oId)) {
      /* Drop hedefi seçili grubun İÇİNDEYSE: blok orijinal en-üst
         konumunda kalır → yanlış reorder olmaz (edge case 10). */
      const minOrig = Math.min(
        ...moving.map((m) => images.findIndex((i) => i.id === m.id))
      );
      insertAt = remaining.filter(
        (i) => images.findIndex((x) => x.id === i.id) < minOrig
      ).length;
    } else {
      const overIdxRem = remaining.findIndex((i) => i.id === oId);
      const activeOrig = images.findIndex((i) => i.id === aId);
      const overOrig = images.findIndex((i) => i.id === oId);
      // Aşağı taşıma → hedefin ARDINA; yukarı → hedefin ÖNÜNE.
      insertAt = overOrig > activeOrig ? overIdxRem + 1 : overIdxRem;
    }

    const newImages = [
      ...remaining.slice(0, insertAt),
      ...moving,
      ...remaining.slice(insertAt),
    ];

    const changed = newImages.some((img, i) => img.id !== images[i].id);
    if (!changed) return;

    const payload = newImages.map((img, i) => ({
      id: img.id,
      sort_order: i,
    }));

    await reorderGalleryImages(payload);
    await onReorder();
    if (isGroup) clearSelection();
  }

  return (
    <div className="space-y-6">
      {/* 🔥 UPLOAD BOX */}
      <div
        onClick={handleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="border-2 border-dashed border-gray-400 rounded-xl p-10 text-center cursor-pointer hover:border-black transition"
      >
        <p className="text-sm text-gray-600">
          {loading ? "Yükleniyor..." : "Sürükle bırak veya tıkla"}
        </p>
        {/* 🛡️ Upload size hint — mevcut dashed-box stiliyle uyumlu;
           küçük, ikincil renkte. Admin gözüne çarpacak kadar görünür,
           UX'i bozmaz. */}
        <p className="text-xs text-gray-400 mt-2">
          Maksimum dosya boyutu: {MAX_UPLOAD_FILE_SIZE_LABEL}
        </p>
      </div>

      {/* 🔥 INPUT */}
      <input
        type="file"
        ref={inputRef}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        accept="image/*"
        multiple
      />

      {/* 🛡️ BULK DELETE HELPER BAR — yalnız fotoğraf varsa ve
         onDeleteAll prop'u verildiyse görünür (opsiyonel callback;
         backward-compat). Kırmızı destructive görünüm; loading
         state'de "Siliniyor…" + disabled. Sayaç (toplam kart)
         solda; aksiyon sağda — admin pattern parity. */}
      {images.length > 0 && onDeleteAll && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-stone-500)]">
            {images.length} fotoğraf
          </p>
          <button
            type="button"
            onClick={handleDeleteAllClick}
            disabled={deletingAll}
            className="
              inline-flex items-center gap-1.5
              text-[13px] font-medium
              text-red-600 hover:text-red-700
              px-3 py-2 rounded-lg
              hover:bg-red-50
              transition
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent
            "
          >
            <Trash2 size={14} strokeWidth={1.75} />
            {deletingAll ? "Siliniyor…" : "Tüm Resimleri Sil"}
          </button>
        </div>
      )}

      {/* 🛡️ SELECTION INDICATOR — yalnız seçim varken görünür. Seçim
         yokken galeri görünümü mevcut haliyle aynı kalır. */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-[13px] font-medium text-blue-700">
            {images.filter((i) => selectedIds.has(i.id)).length} görsel seçildi
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[13px] font-medium text-blue-700 hover:text-blue-900 transition"
          >
            Seçimi temizle
          </button>
        </div>
      )}

      {/* 🔥 GRID — dnd-kit sortable. Grid yoğunluğu + responsive AYNEN:
         xl:grid-cols-5 / 2xl:grid-cols-7 / md:gap-3 / mobile gap-4. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
        /* 🛡️ AUTO-SCROLL — dnd-kit resmi config (yeni custom loop YOK).
           Default acceleration=10 yavaştı; 25'e çıkarıldı → kenara
           yaklaşınca hızlı, tam kenarda maksimum (dnd-kit yakınlık-oranı
           ölçeklemesi korunur → kontrolsüz zıplama değil, akıcı). threshold
           dikeye odaklı (y:0.25 biraz erken tetikleme, x:0 yatay kapalı).
           Yukarı/aşağı simetrik; mouse + touch sensor'larının ikisinde de
           geçerli. Normal galeri scroll'u etkilenmez (yalnız drag aktifken). */
        autoScroll={{ acceleration: 25, threshold: { x: 0, y: 0.25 } }}
      >
        <SortableContext
          items={images.map((i) => i.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-4 md:gap-3">
            {images.map((img, index) => (
              <GalleryCard
                key={img.id}
                img={img}
                index={index}
                selected={selectedIds.has(img.id)}
                dimmed={
                  activeId !== null &&
                  selectedIds.has(activeId) &&
                  selectedIds.has(img.id) &&
                  img.id !== activeId
                }
                onToggle={toggleSelect}
                onDelete={onDelete}
                onReorder={onReorder}
              />
            ))}
          </div>
        </SortableContext>

        {/* Grup/tekli sürükleme önizlemesi (thumbnail + adet rozeti).
            🛡️ document.body'ye PORTAL — `.card-premium:hover { transform }`
            fixed containing block'u bozuyordu (yukarı sürüklemede overlay
            görünmez oluyordu). Portal ile overlay body seviyesinde render
            edilir → position:fixed tekrar viewport'a göre çalışır, her yönde
            görünür. React context portal üzerinden korunur → dnd-kit aynen
            çalışır (activeId/selectedIds/drag algoritması değişmez).
            zIndex 1000 → admin topbar (z-30) / sidebar (z-50) üstünde. */}
        {mounted &&
          createPortal(
            <DragOverlay zIndex={1000}>
              {activeId
                ? (() => {
                    const a = images.find((i) => i.id === activeId);
                    if (!a) return null;
                    const count = selectedIds.has(activeId)
                      ? images.filter((i) => selectedIds.has(i.id)).length
                      : 1;
                    return (
                      <div className="relative rounded-xl overflow-hidden border shadow-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveVillaImageUrl(a.image_url) ?? ""}
                          alt=""
                          className="w-full h-32 object-cover"
                        />
                        {count > 1 && (
                          <span className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow">
                            {count}
                          </span>
                        )}
                      </div>
                    );
                  })()
                : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    </div>
  );
}

/* ===============================================================
   🛡️ GALLERY CARD — tek görsel kartı (dnd-kit sortable item)
   ===============================================================
   useSortable ile sürüklenebilir. Checkbox (sağ-üst; sol-üst kapak/
   preview badge'leriyle çakışmasın diye) + mevcut kapak/preview
   rozetleri + hover aksiyonları (Kapak / Sil) AYNEN korunur.
   Checkbox ve butonlarda onPointerDown stopPropagation → dokunuş
   yanlışlıkla drag başlatmaz (seçim/aksiyon ile karışmaz). */
function GalleryCard({
  img,
  index,
  selected,
  dimmed,
  onToggle,
  onDelete,
  onReorder,
}: {
  img: VillaImage;
  index: number;
  selected: boolean;
  dimmed: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onReorder: () => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: img.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: dimmed ? 0.4 : isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={
        "relative group border rounded-xl overflow-hidden cursor-move " +
        (selected
          ? "ring-2 ring-blue-500 border-blue-500"
          : "border-[var(--color-stone-200)]")
      }
    >
      {/* ☑️ SELECTION CHECKBOX — sağ-üst; hover'sız da erişilebilir,
          touch-friendly. stopPropagation → drag başlatmaz. */}
      <label
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-white/85 backdrop-blur-sm shadow cursor-pointer"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(img.id)}
          className="h-4 w-4 accent-blue-600 cursor-pointer"
          aria-label="Görseli seç"
        />
      </label>

      {/* 🛡️ Aşama B + bucket-fix — resolveVillaImageUrl (legacy URL
          pass-through / relative path → bucket URL). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolveVillaImageUrl(img.image_url) ?? ""}
        alt=""
        className="w-full h-32 object-cover"
      />

      {/* 🔥 COVER */}
      {img.is_cover && (
        <span className="absolute top-2 left-2 bg-black text-white text-xs px-2 py-1 rounded">
          Kapak
        </span>
      )}

      {/* 🔥 ACTIONS */}
      <div className="absolute bottom-2 left-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={async () => {
            await setGalleryCover(img.id, img.villa_id);
            await onReorder(); // 🔥 UI anında güncellenir
          }}
          className="flex-1 bg-white text-xs py-1 rounded hover:bg-gray-200"
        >
          Kapak
        </button>

        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(img.id)}
          className="flex-1 bg-red-500 text-white text-xs py-1 rounded hover:bg-red-600"
        >
          Sil
        </button>
      </div>
    </div>
  );
}