"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  ImagePlus,
  Plus,
  Trash2,
  GripVertical,
  Type,
  Image as ImageIcon,
  Quote,
} from "lucide-react";

/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   pages.insert artık /api/admin/pages POST route'u üzerinden
   (authorizeAdminCaller + dbAdmin). */
import { adminFetch } from "@/lib/admin-fetch";
import { storageProvider } from "@/lib/storage";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { revalidateMenu } from "@/app/services/revalidate.actions";
import { logActivity } from "@/lib/activity-log.client";
import {
  getPageCoverPublicUrl,
  buildPageCoverPath,
  SITE_ASSETS_BUCKET_NAME,
} from "@/lib/storage.helpers";
import { useSiteAssetVersions } from "@/lib/storage/use-site-asset-versions";
import { convertImageToWebP } from "@/lib/image.helpers";
import { slugifyTr } from "@/lib/slug";
/* 🛡️ PHASE 12 — ADMIN I18N (Seçenek A: admin'de locale KAYNAĞI YOK).
   `getDictionary` / `formatDictionaryString` saf fonksiyonlardır →
   client component içinde güvenle çağrılır. Bu fazda bilinçli olarak
   DEFAULT_LOCALE sabit; render çıktısı BYTE-IDENTICAL kalır. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Dictionary } from "@/lib/i18n/dictionaries/types";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type {
  PageSection,
  PageSectionType,
} from "@/lib/page-sections";

/* ===============================================================
   🛡️ ADMIN > YENİ SAYFA — premium editorial CMS create
   ===============================================================
   Migration 014 sonrası eklenen alanlar:
     - excerpt (hero altı kısa açıklama)
     - cover_image (storage relative path, WebP)
     - sections (typed JSONB array: richtext | image | quote)

   Cover ve image-section upload aynı `convertImageToWebP` helper'ı
   kullanır (kategori/bölge cover paterniyle aynı).

   Sections editor: minimal inline ekle/sil/düzenle. Drag-drop
   ileride; şimdilik index up/down butonları olmadan basit liste.
   =============================================================== */

export default function NewPagePage() {
  const router = useRouter();
  const toast = useNotify();

  /* `common.save` ("Kaydet") admin metniyle BİREBİR aynı → public
     namespace'ten yeniden kullanılır; duplicate key açılmadı. */
  const dictionary = getDictionary(DEFAULT_LOCALE);
  const adminDict = dictionary.admin;
  const pagesDict = adminDict.pages;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [sections, setSections] = useState<PageSection[]>([]);
  /* 🛡️ Önizleme `?v=<R2 ETag>` — kapak + bölüm görselleri aynı path'e
     overwrite edildiğinde önizleme yeni görseli göstersin. */
  const assetVersions = useSiteAssetVersions([
    coverPath,
    ...sections.map((s) => (s.type === "image" ? s.path : null)),
  ]);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [noindex, setNoindex] = useState(false);
  /* 🛡️ Menüde Göster — default FALSE (yeni sayfa menüye otomatik
     EKLENMEZ; migration 045). Admin açarsa header auto-include'a girer. */
  const [showInMenu, setShowInMenu] = useState(false);

  const [loading, setLoading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  /* image section upload — multi-row, ref-by-index map. */
  const sectionImageInputRefs = useRef<Record<number, HTMLInputElement | null>>(
    {}
  );
  const [sectionImageUploadingIdx, setSectionImageUploadingIdx] = useState<
    number | null
  >(null);

  /* Slug otomatik üret (admin manuel düzenleyene kadar). */
  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugifyTr(v));
  }

  /* ----- COVER UPLOAD ----- */
  async function handleCoverUpload(file: File) {
    const s = slug.trim();
    if (!s) {
      toast.error(pagesDict.form.slugRequiredFirst, { id: "page-cover" });
      return;
    }
    setCoverUploading(true);
    try {
      const webp = await convertImageToWebP(file);
      const path = buildPageCoverPath(s, "webp");
      if (!path) return;
      /* FAZ 38: storageProvider.upload delege. */
      const upRes = await storageProvider.upload(
        SITE_ASSETS_BUCKET_NAME,
        path,
        webp,
        {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "3600",
        }
      );
      if (!upRes.ok) {
        toast.error(pagesDict.toast.imageUploadFailed, {
          id: "page-cover",
          description: upRes.error,
        });
        return;
      }
      setCoverPath(path);
      await assetVersions.refresh(path);
      toast.success(pagesDict.toast.coverUploaded, { id: "page-cover" });
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  /* ----- SECTIONS ----- */
  function addSection(type: PageSectionType) {
    setSections((prev) => {
      switch (type) {
        case "richtext":
          return [...prev, { type: "richtext", content: "" }];
        case "image":
          return [...prev, { type: "image", path: "", alt: "" }];
        case "quote":
          return [...prev, { type: "quote", text: "", author: "" }];
      }
    });
  }
  function updateSection(idx: number, patch: Partial<PageSection>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === idx ? ({ ...s, ...patch } as PageSection) : s
      )
    );
  }
  function removeSection(idx: number) {
    setSections((prev) => prev.filter((_, i) => i !== idx));
    delete sectionImageInputRefs.current[idx];
  }
  function moveSection(idx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function handleSectionImageUpload(idx: number, file: File) {
    const s = slug.trim();
    if (!s) {
      toast.error(pagesDict.form.slugRequiredFirst, {
        id: `page-section-img-${idx}`,
      });
      return;
    }
    setSectionImageUploadingIdx(idx);
    try {
      const webp = await convertImageToWebP(file);
      /* path: page-covers/{slug}-section-{idx}.webp — section başına
         deterministik. Slug değişimi sonrası eski path stale kalır
         (kabul edilebilir; admin yeniden upload). */
      const path = `page-covers/${s}-section-${idx}.webp`;
      /* FAZ 38: storageProvider.upload delege. */
      const upRes = await storageProvider.upload(
        SITE_ASSETS_BUCKET_NAME,
        path,
        webp,
        {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "3600",
        }
      );
      if (!upRes.ok) {
        toast.error(pagesDict.toast.imageUploadFailed, {
          id: `page-section-img-${idx}`,
          description: upRes.error,
        });
        return;
      }
      updateSection(idx, { path } as Partial<PageSection>);
      await assetVersions.refresh(path);
      toast.success(pagesDict.toast.imageAdded, {
        id: `page-section-img-${idx}`,
      });
    } finally {
      setSectionImageUploadingIdx(null);
      const inp = sectionImageInputRefs.current[idx];
      if (inp) inp.value = "";
    }
  }

  /* ----- SUBMIT ----- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error(pagesDict.toast.titleSlugRequired, { id: "page-create" });
      return;
    }
    setLoading(true);
    /* 🛡️ PAYLOAD NORMALIZATION (debugging-grade):
       - Tüm alanlar explicit `null` veya değer; HİÇBİR ALAN undefined
         GITMEMELI. DB client v2 undefined alanları bazı durumlarda
         siliyor, bazı durumlarda "missing column" hatası veriyor.
       - body/content mirror: legacy + yeni alanlar aynı içerikle.
       - sections: array literal `[]` fallback (asla null/undefined).
       - cover_image: coverPath null'sa explicit null. */
    const trimmedBody = body.trim();
    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      body: trimmedBody.length > 0 ? trimmedBody : null,
      content: trimmedBody.length > 0 ? trimmedBody : null,
      excerpt: excerpt.trim().length > 0 ? excerpt.trim() : null,
      cover_image: coverPath ?? null,
      sections: Array.isArray(sections) ? sections : [],
      seo_title: seoTitle.trim().length > 0 ? seoTitle.trim() : null,
      seo_description:
        seoDescription.trim().length > 0 ? seoDescription.trim() : null,
      noindex: !!noindex,
      is_active: true,
      /* 🛡️ Menüde Göster (045) — default false; sayfa oluşturmak ≠
         menüye eklemek. */
      show_in_menu: !!showInMenu,
    };

    /* 🛡️ RAW JSON DEBUG — object destructure'ı bırak, doğrudan
       stringify + console.dir. PostgREST error'ları React DevTools
       overlay'inde non-enumerable prop'ları gizleyebiliyor;
       JSON.stringify + console.dir bu katmanı atlar.

       Insert chain değişimi: array `[payload]` → object `payload` +
       `.select().single()` zinciri. PostgREST `Prefer: return=representation`
       header'ı `.select()` ile ekleniyor → DB hata mesajları HTTP
       body'sinde tam gelir. `.single()` insert sonrası tek row
       garantili olduğu için kullanılır; hata olursa DB client
       v2 normalde `error` field'ında PostgrestError döner. */
    /* eslint-disable no-console */
    console.log(
      "[pages.insert] PAYLOAD JSON",
      JSON.stringify(payload, null, 2)
    );
    try {
      /* 🛡️ FAZ 2 — adminFetch POST /api/admin/pages.
         Route içinde dbAdmin.from("pages").insert(...).select().single()
         AYNEN; davranış BYTE-IDENTICAL. Eski response shape (data/error/
         status/statusText) `response` adında yeniden inşa edilir
         (downstream code aynen çalışsın diye). */
      const apiRes = await adminFetch("/api/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const apiJson = (await apiRes.json().catch(() => ({}))) as {
        ok?: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any;
        error?: string;
      };
      const response = {
        data:
          apiRes.ok && apiJson.ok ? apiJson.data ?? null : null,
        error:
          !apiRes.ok || !apiJson.ok
            ? { message: apiJson.error || `HTTP ${apiRes.status}` }
            : null,
        status: apiRes.status,
        statusText: apiRes.statusText,
      };

      /* RAW STRINGIFY — overlay flattening bypass. */
      console.log(
        "[pages.insert] RESPONSE JSON",
        JSON.stringify(response, null, 2)
      );
      console.log("[pages.insert] RESPONSE RAW", response);
      console.dir(response);

      const error = (response as { error?: unknown }).error;
      const data = (response as { data?: unknown }).data;
      const status = (response as { status?: unknown }).status;
      const statusText = (response as { statusText?: unknown }).statusText;

      console.log("[pages.insert] STATUS", { status, statusText });

      /* null-safe check: `if (error)` falsy `{}` durumunda da true
         olur ama enumerable boş object pek tipik değil. Yine de
         exact `!= null` ile koruma. */
      if (error != null) {
        /* Tüm error katmanlarını ayrı ayrı logla; biri görünür. */
        console.log(
          "[pages.insert] ERROR JSON",
          JSON.stringify(
            error,
            Object.getOwnPropertyNames(error as object),
            2
          )
        );
        console.log("[pages.insert] ERROR RAW", error);
        console.dir(error);
        console.error("[pages.insert] FAILED", error);

        const e = error as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
        };
        const desc = [
          e.message,
          e.details ? `Detay: ${e.details}` : null,
          e.hint
            ? formatDictionaryString(adminDict.common.hintPrefix, {
                hint: e.hint,
              })
            : null,
          e.code ? `Kod: ${e.code}` : null,
          status ? `HTTP: ${status}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        toast.error(pagesDict.toast.saveFailed, {
          id: "page-create",
          description:
            desc || adminDict.common.unknownErrorCheckNetwork,
        });
        return;
      }

      console.log(
        "[pages.insert] INSERTED DATA JSON",
        JSON.stringify(data, null, 2)
      );
      toast.success(pagesDict.toast.created, { id: "page-create" });

      /* 🛡️ FAZ 55H — AUDIT LOG (fail-safe).
         after_data: insert response data; before_data yok (CREATE).
         sections array helper tarafında sanitize edilir; payload
         büyürse 64KB cap uygulanır. */
      {
        const created = data as { id?: string } | null;
        const createdId =
          typeof created?.id === "string" ? created.id : null;
        logActivity({
          action: "page.created",
          entity_type: "page",
          entity_id: createdId,
          entity_title: payload.title,
          after_data: {
            id: createdId,
            title: payload.title,
            slug: payload.slug,
            is_active: payload.is_active,
            noindex: payload.noindex,
            seo_title: payload.seo_title,
            seo_description: payload.seo_description,
            cover_image: payload.cover_image,
            /* Body/sections shorthand — full dump değil; helper
               64KB cap zaten kestirir ama uzun body'leri preview'a
               indirgemek için kısa özet veriyoruz. */
            body_length:
              typeof payload.body === "string" ? payload.body.length : 0,
            sections_count: Array.isArray(payload.sections)
              ? payload.sections.length
              : 0,
          },
        }).catch(() => {});
      }
      revalidateMenu().catch(() => {});
      router.push("/maki-admin/pages");
    } catch (thrown) {
      /* Runtime throw — JSON, network, abort, auth-init. */
      console.log(
        "[pages.insert] THROWN JSON",
        JSON.stringify(
          thrown,
          Object.getOwnPropertyNames(thrown as object),
          2
        )
      );
      console.log("[pages.insert] THROWN RAW", thrown);
      console.dir(thrown);
      console.error("[pages.insert] THROWN", thrown);
      toast.error(pagesDict.toast.saveFailedRuntime, {
        id: "page-create",
        description:
          (thrown as Error)?.message ||
          adminDict.common.networkOrRuntimeError,
      });
    } finally {
      setLoading(false);
    }
    /* eslint-enable no-console */
  }

  const coverUrl = assetVersions.versioned(
    getPageCoverPublicUrl(coverPath),
    coverPath
  );

  return (
    <div className="space-y-8 w-full">
      {/* HEADER */}
      <div>
        <p className="eyebrow">{pagesDict.list.eyebrow}</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          {pagesDict.form.newTitle}
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          {pagesDict.form.newSubtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* BASIC */}
        <div className="card-premium p-6 md:p-7 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                {pagesDict.form.fieldTitle}
              </label>
              <input
                placeholder={pagesDict.form.titlePlaceholder}
                className="input"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                {pagesDict.form.fieldSlug}
              </label>
              <input
                placeholder={pagesDict.form.slugPlaceholder}
                className="input font-mono text-sm"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
              />
              <p className="text-xs text-[var(--color-stone-400)]">
                URL: <span className="font-mono">/p/{slug || "slug"}</span>
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              {pagesDict.form.fieldExcerpt}
            </label>
            <textarea
              placeholder={pagesDict.form.excerptPlaceholder}
              className="input !rounded-2xl !p-4 h-24 resize-none leading-relaxed"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
            />
          </div>
        </div>

        {/* COVER */}
        <div className="card-premium p-6 md:p-7">
          <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block mb-3">
            {pagesDict.form.fieldCover}
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading || !slug.trim()}
              className="relative w-32 h-20 rounded-2xl overflow-hidden bg-[var(--color-sand-50)] border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] transition disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                !slug.trim()
                  ? pagesDict.form.slugRequiredFirst
                  : pagesDict.form.uploadOrReplaceImage
              }
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
                  <ImagePlus size={18} />
                </span>
              )}
              {coverUploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-medium text-[var(--color-stone-700)]">
                  {adminDict.common.loadingEllipsis}
                </span>
              )}
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCoverUpload(f);
              }}
            />
            {coverPath && (
              <button
                type="button"
                onClick={() => setCoverPath(null)}
                className="text-[13px] text-red-600 hover:text-red-700"
              >
                {pagesDict.form.removeCover}
              </button>
            )}
            <p className="text-xs text-[var(--color-stone-400)] ml-auto max-w-xs">
              {pagesDict.form.coverHint}
            </p>
          </div>
        </div>

        {/* BODY (sections boşsa kullanılır) */}
        <div className="card-premium p-6 md:p-7 space-y-1.5">
          <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
            {pagesDict.form.fieldBody}
          </label>
          <textarea
            placeholder={pagesDict.form.bodyPlaceholder}
            className="input !rounded-2xl !p-4 h-48 resize-none leading-relaxed"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="text-xs text-[var(--color-stone-400)]">
            {pagesDict.form.bodyHint}
          </p>
        </div>

        {/* SECTIONS */}
        <div className="card-premium p-6 md:p-7 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              {pagesDict.sections.label}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addSection("richtext")}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] hover:bg-[var(--color-sand-50)]"
              >
                <Type size={12} /> {pagesDict.sections.typeRichtext}
              </button>
              <button
                type="button"
                onClick={() => addSection("image")}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] hover:bg-[var(--color-sand-50)]"
              >
                <ImageIcon size={12} /> {pagesDict.sections.typeImage}
              </button>
              <button
                type="button"
                onClick={() => addSection("quote")}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] hover:bg-[var(--color-sand-50)]"
              >
                <Quote size={12} /> {pagesDict.sections.typeQuote}
              </button>
            </div>
          </div>

          {sections.length === 0 ? (
            <p className="text-sm text-[var(--color-stone-400)] italic">
              {pagesDict.sections.empty}
            </p>
          ) : (
            <ul className="space-y-3">
              {sections.map((s, idx) => (
                <li
                  key={idx}
                  className="border border-[var(--color-stone-200)] rounded-2xl p-4 bg-white"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-500)]">
                      #{idx + 1} · {sectionLabel(s.type, pagesDict.sections)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSection(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] disabled:opacity-30"
                        title={adminDict.common.moveUp}
                      >
                        <GripVertical size={14} />
                        <span className="sr-only">{adminDict.common.moveUp}</span>↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(idx, 1)}
                        disabled={idx === sections.length - 1}
                        className="p-1 text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] disabled:opacity-30"
                        title={adminDict.common.moveDown}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSection(idx)}
                        className="p-1 text-red-500 hover:text-red-700"
                        title={adminDict.common.delete}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {s.type === "richtext" && (
                    <textarea
                      placeholder={pagesDict.sections.richtextPlaceholder}
                      className="input !rounded-xl !p-3 h-32 resize-none leading-relaxed text-[14px]"
                      value={s.content}
                      onChange={(e) =>
                        updateSection(idx, {
                          type: "richtext",
                          content: e.target.value,
                        })
                      }
                    />
                  )}

                  {s.type === "image" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            sectionImageInputRefs.current[idx]?.click()
                          }
                          disabled={
                            sectionImageUploadingIdx === idx || !slug.trim()
                          }
                          className="relative w-28 h-20 rounded-xl overflow-hidden bg-[var(--color-sand-50)] border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {s.path ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={
                                assetVersions.versioned(
                                  getPageCoverPublicUrl(s.path),
                                  s.path
                                ) || undefined
                              }
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-[var(--color-stone-400)]">
                              <ImagePlus size={16} />
                            </span>
                          )}
                          {sectionImageUploadingIdx === idx && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px]">
                              …
                            </span>
                          )}
                        </button>
                        <input
                          ref={(el) => {
                            sectionImageInputRefs.current[idx] = el;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleSectionImageUpload(idx, f);
                          }}
                        />
                        <p className="text-xs text-[var(--color-stone-400)]">
                          {pagesDict.sections.imageHint}
                        </p>
                      </div>
                      <input
                        placeholder={pagesDict.sections.altTextPlaceholder}
                        className="input text-sm"
                        value={s.alt || ""}
                        onChange={(e) =>
                          updateSection(idx, {
                            type: "image",
                            path: s.path,
                            alt: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}

                  {s.type === "quote" && (
                    <div className="space-y-2">
                      <textarea
                        placeholder={pagesDict.sections.quoteTextPlaceholder}
                        className="input !rounded-xl !p-3 h-20 resize-none leading-relaxed text-[14px]"
                        value={s.text}
                        onChange={(e) =>
                          updateSection(idx, {
                            type: "quote",
                            text: e.target.value,
                            author: s.author,
                          })
                        }
                      />
                      <input
                        placeholder={pagesDict.sections.quoteAuthorPlaceholder}
                        className="input text-sm"
                        value={s.author || ""}
                        onChange={(e) =>
                          updateSection(idx, {
                            type: "quote",
                            text: s.text,
                            author: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* SEO */}
        <div className="card-premium p-6 md:p-7 space-y-5">
          <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
            {pagesDict.form.seoHeading}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[12px] text-[var(--color-stone-500)] block">
                {pagesDict.form.seoTitleLabel}
              </label>
              <input
                className="input text-sm"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-[var(--color-stone-500)] block">
                {pagesDict.form.seoDescriptionLabel}
              </label>
              <textarea
                className="input !rounded-2xl !p-4 h-20 resize-none leading-relaxed text-sm"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--color-stone-700)]">
            <input
              type="checkbox"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
            />
            <span>{pagesDict.form.noindexLabel}</span>
          </label>
          {/* 🛡️ Menüde Göster — default kapalı. Açılırsa header menüsünde
             görünür; kapalıyken sayfa yine /p/{slug} ile erişilebilir. */}
          <label className="flex items-center gap-2 text-sm text-[var(--color-stone-700)]">
            <input
              type="checkbox"
              checked={showInMenu}
              onChange={(e) => setShowInMenu(e.target.checked)}
            />
            <span>{pagesDict.form.showInMenuLabel}</span>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            <Save size={15} />
            {loading
              ? adminDict.common.saving
              : dictionary.common.save}
          </button>
        </div>
      </form>
    </div>
  );
}

function sectionLabel(
  t: PageSectionType,
  dict: Dictionary["admin"]["pages"]["sections"]
): string {
  switch (t) {
    case "richtext":
      return dict.typeRichtext;
    case "image":
      return dict.typeImage;
    case "quote":
      return dict.typeQuote;
  }
}
