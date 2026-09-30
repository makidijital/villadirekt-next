"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
/* 🛡️ Tüm DB (okuma + yazma) server action üzerinden (villa-image.* /
   villa.repository / @/lib/db client bundle'a girmez). Yazmalar server'da
   session-aware client ile → RLS admin yetkisi aynen korunur. */
import {
  loadGalleryImages,
  loadGallerySlug,
  addGalleryImage,
  deleteGalleryImage,
  deleteAllGalleryImages,
} from "./gallery.action";
import type { VillaImage } from "@/app/services/villa-image/villa-image.types";
import AdminGallery from "@/app/components/villa/AdminGallery";
import { ChevronLeft } from "lucide-react";

/* ===============================================================
   🛡️ ADMIN VILLA GALLERY — orchestrator (Faz 7)
   ===============================================================
   Değişen davranış:
     1) Villa slug fetch edilir (storage human-readable folder için).
        Tek lightweight SELECT (id+slug). Slug bulunamazsa null geçer;
        AdminGallery generic "villa" slug ile yine güvenli path üretir.
     2) handleUploaded artık boolean döner → AdminGallery storage
        rollback yapabilsin. addVillaImage zaten boolean dönüyordu;
        sadece pipe through.

   Davranışsal regression: yok. DB schema/yapı dokunulmadı.
   =============================================================== */

export default function AdminVillaGallery() {
  const params = useParams();
  const id = params.id as string;

  /* 🛡️ Faz 9 hardening: `useState<any[]>` → `VillaImage[]`. */
  const [images, setImages] = useState<VillaImage[]>([]);
  const [villaSlug, setVillaSlug] = useState<string | null>(null);

  async function loadImages() {
    const data = await loadGalleryImages(id);
    setImages(data);
  }

  /* 🛡️ Slug fetch — yalnız human-readable storage folder için.
     Başarısız olursa null kalır → AdminGallery generic prefix kullanır;
     shortId villa.id'den deterministic ve stable kalır. */
  async function loadVillaSlug() {
    setVillaSlug(await loadGallerySlug(id));
  }

  useEffect(() => {
    if (!id) return;
    loadImages();
    loadVillaSlug();
  }, [id]);

  /* 🛡️ Return boolean → AdminGallery storage rollback için.
     addVillaImage zaten boolean dönüyor; transparently bubble. */
  async function handleUploaded(url: string): Promise<boolean> {
    const ok = await addGalleryImage(id, url);
    if (ok) await loadImages();
    return ok;
  }

  async function handleDelete(imageId: string) {
    await deleteGalleryImage(imageId);
    await loadImages();
  }

  /* 🛡️ BULK DELETE — `deleteAllVillaImages` (villa-image.service.ts)
     döner: { ok, removed, orphans }. Caller (AdminGallery) yalnız
     boolean ile ilgilenir; orphan listesi service log'una düşer.
     Başarı/başarısızlık AdminGallery'deki toast.success/error
     ile gösterilir. UI state `loadImages()` ile temizlenir. */
  async function handleDeleteAll(): Promise<boolean> {
    const result = await deleteAllGalleryImages(id);
    if (result.ok) await loadImages();
    return result.ok;
  }

  if (!id)
    return (
      <div className="card-premium p-10 text-center text-[var(--color-stone-500)]">
        Yükleniyor…
      </div>
    );

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Link
            href={`/maki-admin/villas/${id}`}
            className="inline-flex items-center gap-1 text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] transition"
          >
            <ChevronLeft size={14} />
            Mülk düzenle
          </Link>
          <p className="eyebrow mt-3">Mülk</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            Galeri yönetimi
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Görselleri sürükleyerek sıralayabilir, kapak fotoğrafını seçebilirsin.
          </p>
        </div>
      </div>

      <div className="card-premium p-5 md:p-6">
        <AdminGallery
          images={images}
          villaId={id}
          villaSlug={villaSlug}
          onUploaded={handleUploaded}
          onDelete={handleDelete}
          onDeleteAll={handleDeleteAll}
          onReorder={loadImages}
        />
      </div>
    </div>
  );
}
