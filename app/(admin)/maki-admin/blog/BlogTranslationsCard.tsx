"use client";

/* ===============================================================
   🛡️ MIGRATION 089 — ADMIN BLOG (blog_posts) ÇEVİRİ KARTI
   ===============================================================
   `PageTranslationsCard.tsx` (Phase 12C) ile BİREBİR AYNI desen ve
   AYNI tasarım dili (card-premium + EN/DE pill-tab + tek "sürümünü
   kaydet" butonu + Loader2 spinner).

   ⚠️ BU KART ADMIN ARAYÜZÜNÜN DİLİNİ DEĞİŞTİRMEZ. Admin paneli
   Türkçe kalır; burada girilen değerler BLOG YAZISININ EN/DE
   sürümleridir.

   KAPSAM (migration 089 kolonlarıyla BİREBİR):
     title · excerpt · body · seo_title · seo_description
   KAPSAM DIŞI:
     slug (URL — `/blog/<slug>` her locale'de AYNI), cover_image,
     og_image, category, author, published_at, is_active, noindex.

   TR bu karttan DÜZENLENEMEZ — yalnız referans olarak gösterilir.
   Boş bırakılan alanlar public tarafta TR içeriğe fallback eder.
   Kendi state'i / kendi save mekanizması vardır — ana "Kaydet"
   akışına (`handleSubmit`) KARIŞMAZ.
   =============================================================== */

import { useEffect, useState } from "react";
import { Languages, Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadBlogTranslationsAction,
  saveBlogTranslationAction,
} from "./blog-translations.action";

type WritableLocale = "en" | "de";

type LocaleFormState = {
  title: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
};

const EMPTY_FORM: LocaleFormState = {
  title: "",
  excerpt: "",
  body: "",
  seoTitle: "",
  seoDescription: "",
};

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

type Props = {
  postId: string;
  /** TR referans metni — bu karttan DÜZENLENEMEZ, yalnız gösterilir. */
  postTitle?: string | null;
};

export default function BlogTranslationsCard({ postId, postTitle }: Props) {
  const toast = useNotify();

  const [forms, setForms] = useState<Record<WritableLocale, LocaleFormState>>({
    en: EMPTY_FORM,
    de: EMPTY_FORM,
  });
  const [activeLocale, setActiveLocale] = useState<WritableLocale>("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await loadBlogTranslationsAction(postId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: `blog-translations-load-${postId}`,
          description: result.error,
        });
        setLoading(false);
        return;
      }

      setForms((prev) => {
        const next = { ...prev };
        for (const row of result.rows) {
          if (row.locale !== "en" && row.locale !== "de") continue;
          next[row.locale] = {
            title: row.title ?? "",
            excerpt: row.excerpt ?? "",
            body: row.body ?? "",
            seoTitle: row.seo_title ?? "",
            seoDescription: row.seo_description ?? "",
          };
        }
        return next;
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  function setField(field: keyof LocaleFormState, value: string) {
    setForms((prev) => ({
      ...prev,
      [activeLocale]: { ...prev[activeLocale], [field]: value },
    }));
  }

  async function handleSave() {
    const current = forms[activeLocale];

    setSaving(true);
    try {
      const result = await saveBlogTranslationAction({
        postId,
        locale: activeLocale,
        title: current.title,
        excerpt: current.excerpt,
        body: current.body,
        seoTitle: current.seoTitle,
        seoDescription: current.seoDescription,
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: `blog-translations-save-${postId}`,
          description: result.error,
        });
        return;
      }

      /* Sunucunun normalize ettiği (trim + boş → null) değerlerle
         senkronla — VillaTranslationsCard'daki toast davranışına ek
         olarak TypeTranslationsPanel'in `setForms(result.row…)`
         senkronizasyonu uygulanır. */
      setForms((prev) => ({
        ...prev,
        [activeLocale]: {
          title: result.row.title ?? "",
          excerpt: result.row.excerpt ?? "",
          body: result.row.body ?? "",
          seoTitle: result.row.seo_title ?? "",
          seoDescription: result.row.seo_description ?? "",
        },
      }));

      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: `blog-translations-save-${postId}`,
      });
    } finally {
      setSaving(false);
    }
  }

  const form = forms[activeLocale];

  return (
    <section className="card-premium p-6 md:p-7 space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-stone-100)] text-[var(--color-stone-700)]">
          <Languages className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow">Çok Dilli İçerik</p>
          <h2 className="text-lg font-semibold text-[var(--color-stone-900)]">
            Çeviriler (EN / DE)
          </h2>
          <p className="mt-1 text-sm text-[var(--color-stone-500)]">
            Bu alanlar yalnızca İngilizce ve Almanca sürümler içindir. Türkçe
            içerik buradan düzenlenemez; boş bırakılan alanlar public tarafta
            Türkçe içeriğe geri döner. Slug, kapak görseli ve kategori
            çevrilmez.
          </p>
        </div>
      </header>

      {postTitle ? (
        <div>
          <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-400)]">
            Türkçe (referans, salt okunur)
          </p>
          <p className="text-sm text-[var(--color-stone-600)] mt-1">
            {postTitle}
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        {(Object.keys(LOCALE_LABELS) as WritableLocale[]).map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            className={
              activeLocale === locale
                ? "rounded-full bg-[var(--color-stone-900)] px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full bg-[var(--color-stone-100)] px-4 py-1.5 text-sm font-semibold text-[var(--color-stone-600)]"
            }
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-stone-500)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor…
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                Başlık
              </label>
              <input
                aria-label={`${LOCALE_LABELS[activeLocale]} başlık`}
                className="input"
                maxLength={200}
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                SEO Başlık
              </label>
              <input
                aria-label={`${LOCALE_LABELS[activeLocale]} SEO başlık`}
                className="input"
                maxLength={120}
                value={form.seoTitle}
                onChange={(e) => setField("seoTitle", e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-stone-400)]">
                Önerilen: 60 karakter
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                Kısa açıklama (excerpt)
              </label>
              <textarea
                aria-label={`${LOCALE_LABELS[activeLocale]} kısa açıklama`}
                className="input !rounded-2xl !p-4 min-h-[90px] resize-none"
                maxLength={300}
                value={form.excerpt}
                onChange={(e) => setField("excerpt", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                SEO Açıklama
              </label>
              <textarea
                aria-label={`${LOCALE_LABELS[activeLocale]} SEO açıklama`}
                className="input !rounded-2xl !p-4 min-h-[90px] resize-none"
                maxLength={300}
                value={form.seoDescription}
                onChange={(e) => setField("seoDescription", e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-stone-400)]">
                Önerilen: 160 karakter
              </p>
            </div>
          </div>

          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              İçerik
            </label>
            <textarea
              aria-label={`${LOCALE_LABELS[activeLocale]} içerik`}
              className="input !rounded-2xl !p-4 min-h-[160px] resize-none leading-relaxed"
              maxLength={20000}
              value={form.body}
              onChange={(e) => setField("body", e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Kaydediliyor…
              </span>
            ) : (
              `${LOCALE_LABELS[activeLocale]} sürümünü kaydet`
            )}
          </button>
        </div>
      )}
    </section>
  );
}
