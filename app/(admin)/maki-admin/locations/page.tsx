"use client";

import { useEffect, useRef, useState } from "react";
/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   villa_locations CRUD artık /api/admin/villa-locations route'u
   üzerinden (GET/POST/PATCH/DELETE; authorizeAdminCaller + dbAdmin). */
import { adminFetch } from "@/lib/admin-fetch";
import { storageProvider } from "@/lib/storage";
import {
  Plus,
  Trash2,
  MapPin,
  ImagePlus,
  Pencil,
  Check,
  X,
} from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import {
  revalidateTaxonomy,
  revalidateMenu,
} from "@/app/services/revalidate.actions";
import { slugifyTr } from "@/lib/slug";
import {
  getLocationCoverPublicUrl,
  buildLocationCoverPath,
  SITE_ASSETS_BUCKET_NAME,
} from "@/lib/storage.helpers";
import { useSiteAssetVersions } from "@/lib/storage/use-site-asset-versions";
import { convertImageToWebP } from "@/lib/image.helpers";
/* 🛡️ PHASE 10I — BÖLGE ADLARI ÇEVRİLMEZ.
   Kalkan / Kaş / Fethiye / Çavdır gibi bölge adları ÖZEL İSİMDİR;
   İngilizce veya Almanca karşılıkları yoktur. Bu yüzden Phase 10D
   Batch 3'te eklenen EN/DE çeviri UI'ı (LocationTranslationsPanel +
   location-translations.action + villa-location-translation.service)
   TAMAMEN KALDIRILDI; `multilingual_enabled` okuması da bu sayfada
   BAŞKA HİÇBİR ŞEY İÇİN kullanılmadığı için birlikte kaldırıldı.
   Public EN/DE tarafında canonical `villa_locations.name` gösterilir.
   Bölge CRUD / slug / aktif-pasif / sıralama / kapak görseli / filtre
   kürasyonu DEĞİŞMEDİ. */

export default function LocationsPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  /* 🛡️ Kapak önizlemesi `?v=<R2 ETag>` — `location-covers/<slug>.webp`
     overwrite edildiğinde liste yeni görseli göstersin. */
  const assetVersions = useSiteAssetVersions(
    locations.map((l) => l?.cover_image)
  );
  const [loading, setLoading] = useState(false);
  /* 🛡️ Upload-in-progress map — kategori sayfasıyla birebir paralel
     (migration 011 cover_image upload). */
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* 🛡️ INLINE EDIT — mevcut bölgenin name + slug düzenlemesi.
     Ekleme/silme/kapak akışları DEĞİŞMEDİ; bu yalnız PATCH
     { name, slug } ile ek bir güncelleme yolu. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editShowInFilter, setEditShowInFilter] = useState(false);
  const [editGroup, setEditGroup] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (loc: {
    id: string;
    name?: string;
    slug?: string;
    show_in_filter?: boolean | null;
    filter_group_name?: string | null;
  }) => {
    setEditingId(loc.id);
    setEditName(String(loc?.name || ""));
    setEditSlug(String(loc?.slug || ""));
    setEditShowInFilter(Boolean(loc?.show_in_filter));
    setEditGroup(String(loc?.filter_group_name || ""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditSlug("");
    setEditShowInFilter(false);
    setEditGroup("");
  };

  const handleSaveEdit = async (id: string) => {
    const nextName = editName.trim();
    const nextSlug = slugifyTr(editSlug.trim());
    if (!nextName) {
      toast.error("Ad boş olamaz", { id: `location-edit-${id}` });
      return;
    }
    if (!nextSlug) {
      toast.error("Slug boş olamaz", { id: `location-edit-${id}` });
      return;
    }

    setEditSaving(true);
    /* 🛡️ Mevcut PATCH endpoint'i genişletildi: { name, slug }.
       Slug unique constraint DB-level AYNEN tetiklenir → hata
       mesajı mevcut error.message konvansiyonuyla gösterilir. */
    let editErr: string | null = null;
    try {
      const res = await adminFetch(
        `/api/admin/villa-locations?id=${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          name: nextName,
          slug: nextSlug,
          show_in_filter: editShowInFilter,
          filter_group_name: editGroup.trim() || null,
        }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        editErr = json.error || `HTTP ${res.status}`;
      }
    } catch (err) {
      editErr = err instanceof Error ? err.message : "İstek başarısız";
    }
    setEditSaving(false);

    if (editErr) {
      toast.error("Güncellenemedi", {
        id: `location-edit-${id}`,
        description: editErr,
      });
      return;
    }

    cancelEdit();
    await fetchLocations();
    toast.success("Bölge güncellendi", { id: `location-edit-${id}` });
    /* name/slug değişimi → public taxonomy + menu (region menu
       source villa_locations.name) anında stale. */
    revalidateTaxonomy().catch(() => {});
    revalidateMenu().catch(() => {});
  };

  const fetchLocations = async () => {
    /* 🛡️ FAZ 2 — adminFetch GET /api/admin/villa-locations.
       Aynı select="*" + order created_at desc route içinde. */
    try {
      const res = await adminFetch("/api/admin/villa-locations");
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        locations?: any[];
      };
      setLocations(res.ok && json.ok ? json.locations || [] : []);
    } catch {
      setLocations([]);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  /* 🛡️ SLUG SOURCE-OF-TRUTH — lib/slug > slugifyTr.
     Önceki inline implementasyon punctuation strip etmiyordu
     ("Lüks/Korunaklı" → "lüks/korunakli" gibi geçersiz slug
     üretebilir). slugifyTr non-`[a-z0-9]` karakterleri `-`'a
     normalize eder + trim eder. */

  const handleAdd = async () => {
    if (!name) return;
    setLoading(true);
    /* 🛡️ FAZ 2 — adminFetch POST /api/admin/villa-locations.
       Aynı insert payload { name, slug: slugifyTr(name) } route içinde.
       Unique slug constraint DB-level AYNEN. */
    let insertErr: string | null = null;
    try {
      const res = await adminFetch("/api/admin/villa-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: slugifyTr(name) }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        insertErr = json.error || `HTTP ${res.status}`;
      }
    } catch (err) {
      insertErr = err instanceof Error ? err.message : "İstek başarısız";
    }
    setLoading(false);
    if (insertErr) {
      toast.error("Eklenemedi", {
        id: "location-create",
        description: insertErr,
      });
      return;
    }
    setName("");
    fetchLocations();
    /* 🛡️ CACHE INVALIDATION (Faz 5):
       Taxonomy mutation → public taxonomy cache + menu lookup
       (villa_locations.name menu source) anında stale olur.
       Non-blocking fire-and-forget; mevcut convention. */
    revalidateTaxonomy().catch(() => {});
    revalidateMenu().catch(() => {});
  };

  /* ===============================================================
     🛡️ COVER UPLOAD — bölge kapak görseli (migration 011)
     ===============================================================
     Kategori paterninin BİREBİR paraleli:
       - path deterministik: `location-covers/{slug}.{ext}`
       - upsert: true → eski overwrite (duplicate dosya birikmez)
       - DB'ye bucket-relative path yazılır
       - başarı sonrası revalidateTaxonomy() (menu invalidate gereksiz)

     Locations için ayrı service yok (mevcut convention: sayfa direkt
     eski sağlayıcıyı kullanıyor) — kategori `setVillaTypeCover` pattern'i
     yerine inline `.from("villa_locations").update(...)`. */
  const handleCoverUpload = async (loc: any, file: File) => {
    const slug: string = String(loc?.slug || "").trim();
    if (!slug) {
      toast.error("Slug yok", {
        id: `location-cover-${loc.id}`,
        description:
          "Bölge slug'ı eksik — önce yeniden ekleyin (slug otomatik üretilir).",
      });
      return;
    }
    /* 🛡️ WEBP CONVERSION (production-grade) — kategori paterninin
       birebir paraleli. Storage'a HER ZAMAN .webp yazılır. */
    const webpFile = await convertImageToWebP(file);
    const path = buildLocationCoverPath(slug, "webp");
    if (!path) return;

    setUploadingId(loc.id);
    try {
      /* FAZ 38: storageProvider.upload delege; upsert + contentType +
         cacheControl aynen. */
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
          id: `location-cover-${loc.id}`,
          description: upRes.error,
        });
        return;
      }
      /* 🛡️ FAZ 2 — adminFetch PATCH /api/admin/villa-locations?id=.
         Aynı .update({ cover_image }).eq("id", id) route içinde. */
      let dbErrMsg: string | null = null;
      try {
        const dbRes = await adminFetch(
          `/api/admin/villa-locations?id=${encodeURIComponent(loc.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cover_image: path }),
          }
        );
        const dbJson = (await dbRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!dbRes.ok || !dbJson.ok) {
          dbErrMsg = dbJson.error || `HTTP ${dbRes.status}`;
        }
      } catch (err) {
        dbErrMsg = err instanceof Error ? err.message : "İstek başarısız";
      }
      if (dbErrMsg) {
        toast.error("DB güncellenemedi", {
          id: `location-cover-${loc.id}`,
          description: dbErrMsg,
        });
        return;
      }
      await fetchLocations();
      await assetVersions.refresh(path);
      toast.success("Kapak görseli güncellendi", {
        id: `location-cover-${loc.id}`,
      });
      /* Cover değişti → public taxonomy consumer'ları fresh fetch. */
      revalidateTaxonomy().catch(() => {});
    } finally {
      setUploadingId(null);
      const inp = fileInputRefs.current[loc.id];
      if (inp) inp.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    const proceed = await confirm({
      title: "Bölge silinsin mi?",
      description: "Seçili bölge kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    /* 🛡️ FAZ 2 — adminFetch DELETE /api/admin/villa-locations?id=.
       Aynı .delete().eq("id", id) route içinde. */
    let delErr: string | null = null;
    try {
      const res = await adminFetch(
        `/api/admin/villa-locations?id=${encodeURIComponent(id)}`,
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
        id: `location-delete-${id}`,
        description: delErr,
      });
      return;
    }
    fetchLocations();
    toast.success("Bölge silindi", { id: `location-delete-${id}` });
    /* 🛡️ CACHE INVALIDATION — taxonomy + menu (silinen region
       menu auto-include lookup'unda olabilir, orphan resolver
       NULL döner → menu re-render gerekir). */
    revalidateTaxonomy().catch(() => {});
    revalidateMenu().catch(() => {});
  };

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Yönetim</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Bölgeler
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Mülklerin bulunduğu bölgeleri buradan yönetebilirsin.
        </p>
      </div>

      <div className="card-premium p-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bölge adı (Kaş, Fethiye…)"
          className="input flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
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

      {locations.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <MapPin size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz bölge yok
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Yukarıdan ilk bölgeni ekle.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {locations.map((loc) => {
            const coverUrl = assetVersions.versioned(
              getLocationCoverPublicUrl(loc?.cover_image),
              loc?.cover_image
            );
            const isUploading = uploadingId === loc.id;
            const hasSlug = !!String(loc?.slug || "").trim();
            return (
              <div key={loc.id}>
                <div className="card-premium p-4 flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  {/* 🛡️ COVER THUMBNAIL — kategori paterniyle birebir.
                     coverUrl varsa görsel, yoksa MapPin placeholder
                     (mevcut bölge ikonografisini koru). Tıklayınca
                     file picker. Slug yoksa disabled. */}
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[loc.id]?.click()}
                    disabled={isUploading || !hasSlug}
                    title={
                      !hasSlug
                        ? "Slug yok — bölge yeniden eklenmeli"
                        : coverUrl
                        ? "Görseli değiştir"
                        : "Görsel yükle"
                    }
                    className="relative w-9 h-9 rounded-full overflow-hidden bg-[var(--color-sand-100)] border border-transparent hover:border-[var(--color-champagne-500)] transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {coverUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={coverUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[var(--color-champagne-700)]">
                        <MapPin size={14} />
                      </span>
                    )}
                    {isUploading && (
                      <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-medium text-[var(--color-stone-700)]">
                        …
                      </span>
                    )}
                    {!isUploading && hasSlug && !coverUrl && (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] shadow-sm"
                      >
                        <ImagePlus size={9} />
                      </span>
                    )}
                  </button>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[loc.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCoverUpload(loc, f);
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    {editingId === loc.id ? (
                      /* 🛡️ INLINE EDIT — Ad + Slug alanları (mevcut
                         input tasarım diliyle). */
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Ad (Kaş / İslamlar)"
                            className="input flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(loc.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <input
                            value={editSlug}
                            onChange={(e) => setEditSlug(e.target.value)}
                            placeholder="slug (kas-islamlar)"
                            className="input flex-1 font-mono text-[13px]"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(loc.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                        </div>
                        {/* 🛡️ Migration 050 — filtre kürasyonu */}
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-stone-700)] px-1 cursor-pointer select-none shrink-0">
                            <input
                              type="checkbox"
                              checked={editShowInFilter}
                              onChange={(e) =>
                                setEditShowInFilter(e.target.checked)
                              }
                              className="!w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
                            />
                            Filtrede Göster
                          </label>
                          <input
                            value={editGroup}
                            onChange={(e) => setEditGroup(e.target.value)}
                            placeholder="Filtre Grubu (Kalkan)"
                            className="input flex-1"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(loc.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium text-[var(--color-stone-900)] truncate">
                          {loc.name}
                        </p>
                        {/* 🛡️ DISPLAY-ONLY lowercase — `uppercase` CSS
                           transform kaldırıldı. DB value (loc.slug) değişmedi;
                           sadece render katmanı. Mülk tipleri sayfasındaki
                           slug alt-yazı pattern'iyle birebir aynı. */}
                        <p className="text-[11px] text-[var(--color-stone-400)] tracking-[0.06em] font-mono truncate">
                          /{loc.slug}
                        </p>
                        {/* 🛡️ Migration 050 — filtre kürasyon durumu */}
                        <p className="text-[11px] mt-0.5 truncate">
                          {loc.show_in_filter ? (
                            <span className="text-[var(--color-champagne-700)]">
                              Filtrede görünür
                              {loc.filter_group_name
                                ? ` · grup: ${loc.filter_group_name}`
                                : ""}
                            </span>
                          ) : (
                            <span className="text-[var(--color-stone-400)]">
                              Filtrede gizli
                              {loc.filter_group_name
                                ? ` · grup: ${loc.filter_group_name}`
                                : ""}
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {editingId === loc.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleSaveEdit(loc.id)}
                      disabled={editSaving || !editName.trim() || !editSlug.trim()}
                      className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-champagne-700)] hover:text-[var(--color-stone-900)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-100)] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check size={13} />
                      {editSaving ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={editSaving}
                      className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-stone-100)] transition disabled:opacity-50"
                    >
                      <X size={13} />
                      İptal
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => startEdit(loc)}
                      className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-stone-100)] transition"
                    >
                      <Pencil size={13} />
                      Düzenle
                    </button>

                    <button
                      onClick={() => handleDelete(loc.id)}
                      className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                    >
                      <Trash2 size={13} />
                      Sil
                    </button>
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
