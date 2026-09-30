"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Save, ImagePlus, Loader2 } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import RichTextEditor from "@/app/components/admin/villa-form/RichTextEditor";
import { convertImageToWebP } from "@/lib/image.helpers";
import { resolveAssetUrl } from "@/lib/storage.helpers";
import { useSiteAssetVersions } from "@/lib/storage/use-site-asset-versions";
import { STORAGE_BUCKETS } from "@/lib/storage";

/* ===============================================================
   🛡️ BLOG POST FORM — paylaşılan create/edit (admin)
   ===============================================================
   pages form desenini AYNALAR; yalın blog alanları. RichTextEditor,
   R2 upload (site-assets/blog/), adminFetch, admin CSS REUSE. Kayıtta
   server tarafı sanitizeHtml uygular (API). Yeni bileşen/mimari yok.
   =============================================================== */

export type BlogFormInitial = {
  id?: string;
  title?: string;
  slug?: string;
  excerpt?: string | null;
  body?: string | null;
  cover_image?: string | null;
  category?: string | null;
  author?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  is_active?: boolean;
};

/* TR→ASCII slugify (pages/taxonomy slug paterniyle uyumlu, inline). */
function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
  };
  return input
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BlogPostForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: BlogFormInitial;
}) {
  const toast = useNotify();
  const router = useRouter();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [coverPath, setCoverPath] = useState<string | null>(
    initial?.cover_image ?? null
  );
  /* 🛡️ Önizleme `?v=<R2 ETag>` — `blog/<slug>.webp` overwrite sonrası
     yeni kapak sayfa yenilemeden görünsün. */
  const assetVersions = useSiteAssetVersions([coverPath]);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(
    initial?.seo_description ?? ""
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? false);

  const [coverUploading, setCoverUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const uploadCover = async (file: File) => {
    const s = slug.trim() || slugify(title);
    if (!s) {
      toast.error("Önce başlık/slug girin", { id: "blog-cover" });
      return;
    }
    setCoverUploading(true);
    try {
      const webp = await convertImageToWebP(file, {});
      const path = `blog/${s}.webp`;
      const fd = new FormData();
      fd.append("file", webp);
      fd.append("bucket", STORAGE_BUCKETS.SITE_ASSETS);
      fd.append("path", path);
      fd.append("upsert", "true");
      const res = await adminFetch("/api/admin/storage/upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        toast.error("Kapak yüklenemedi", { id: "blog-cover" });
        return;
      }
      setCoverPath(path);
      await assetVersions.refresh(path);
      toast.success("Kapak yüklendi", { id: "blog-cover" });
    } catch {
      toast.error("Kapak yüklenemedi", { id: "blog-cover" });
    } finally {
      setCoverUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error("Başlık ve slug zorunlu", { id: "blog-save" });
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      excerpt,
      body,
      cover_image: coverPath,
      category,
      author,
      seo_title: seoTitle,
      seo_description: seoDescription,
      is_active: isActive,
    };
    try {
      const url =
        mode === "create"
          ? "/api/admin/blog"
          : `/api/admin/blog/${initial?.id}`;
      const res = await adminFetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error("Kaydedilemedi", {
          id: "blog-save",
          description: json.error || `HTTP ${res.status}`,
        });
        setSaving(false);
        return;
      }
      toast.success(mode === "create" ? "Yazı eklendi" : "Yazı güncellendi", {
        id: "blog-save",
      });
      router.push("/maki-admin/blog");
    } catch (err) {
      toast.error("Kaydedilemedi", {
        id: "blog-save",
        description: err instanceof Error ? err.message : "İstek başarısız",
      });
      setSaving(false);
    }
  };

  const coverUrl = coverPath
    ? assetVersions.versioned(resolveAssetUrl(coverPath), coverPath)
    : null;
  const labelCls =
    "text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block";

  return (
    <form onSubmit={handleSubmit} className="card-premium p-6 md:p-8 space-y-7">
      {/* Başlık + slug */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label className={labelCls}>Başlık</label>
          <input
            className="input"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Örn: Kaş'ta 7 günlük rota"
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Slug</label>
          <input
            className="input font-mono text-sm"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="kasta-7-gunluk-rota"
          />
        </div>
      </div>

      {/* Özet */}
      <div className="space-y-1.5">
        <label className={labelCls}>Özet</label>
        <textarea
          className="input !rounded-2xl !p-4 h-24 resize-none leading-relaxed"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="Listeleme ve meta için kısa özet."
        />
      </div>

      {/* Gövde — Tiptap */}
      <div className="space-y-1.5">
        <label className={labelCls}>İçerik</label>
        <RichTextEditor value={body} onChange={setBody} />
      </div>

      {/* Kapak */}
      <div className="space-y-2">
        <label className={labelCls}>Kapak Görseli</label>
        <div className="flex items-center gap-4">
          {coverUrl && (
            <Image
              src={coverUrl}
              alt=""
              width={120}
              height={80}
              className="rounded-xl object-cover w-[120px] h-[80px]"
              unoptimized
            />
          )}
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-stone-200)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:bg-[var(--color-stone-50)] transition-colors disabled:opacity-50"
          >
            {coverUploading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ImagePlus size={15} />
            )}
            {coverPath ? "Kapağı Değiştir" : "Kapak Yükle"}
          </button>
        </div>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadCover(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Kategori + yazar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label className={labelCls}>Kategori (opsiyonel)</label>
          <input
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Örn: rehber"
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Yazar (opsiyonel)</label>
          <input
            className="input"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </div>
      </div>

      {/* SEO */}
      <div className="space-y-5 pt-2 border-t border-[var(--color-stone-100)]">
        <div className="space-y-1.5 pt-3">
          <label className={labelCls}>SEO Başlık (opsiyonel)</label>
          <input
            className="input"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>SEO Açıklama (opsiyonel)</label>
          <textarea
            className="input !rounded-2xl !p-4 h-20 resize-none"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
          />
        </div>
      </div>

      {/* Yayın */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="w-4 h-4 accent-[var(--color-champagne-500)]"
        />
        <span className="text-[14px] text-[var(--color-stone-700)]">
          Yayında (işaretli değilse taslak)
        </span>
      </label>

      <div className="flex justify-end pt-2">
        <button type="submit" disabled={saving} className="btn-primary">
          <Save size={15} />
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </form>
  );
}
