"use client";

/* ===============================================================
   🛡️ PHASE 10A — ADMIN VILLA TRANSLATION UI
   ===============================================================
   EN / DE çeviri alanlarını (description, badge, seo_title,
   seo_description) düzenlemek için self-contained kart.
   🛡️ VİLLA ADI (title) BURADA DÜZENLENMEZ — özel isimdir, her locale'de
   canonical `villa.title` gösterilir. IcalSyncCard.tsx
   deseniyle AYNI prensip: kendi state'i, kendi save mekanizması —
   ana wizard "Güncelle" akışına (handleUpdate/buildVillaUpdatePayload)
   KARIŞMAZ.

   TR bu ekrandan DÜZENLENEMEZ — yalnız EN/DE. Boş alanlar public
   tarafta TR'ye fallback eder (bu ekranda değiştirilmiyor).
   =============================================================== */

import { useEffect, useState } from "react";
import { Languages, Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadVillaTranslationsAction,
  saveVillaTranslationAction,
} from "./villa-translations.action";

type WritableLocale = "en" | "de";

type LocaleFormState = {
  description: string;
  badge: string;
  seoTitle: string;
  seoDescription: string;
};

const EMPTY_FORM: LocaleFormState = {
  description: "",
  badge: "",
  seoTitle: "",
  seoDescription: "",
};

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

type Props = {
  villaId: string;
  villaTitle?: string | null;
};

export default function VillaTranslationsCard({ villaId }: Props) {
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
      const result = await loadVillaTranslationsAction(villaId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: "villa-translations-load",
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
            description: row.description ?? "",
            badge: row.badge ?? "",
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
  }, [villaId]);

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
      const result = await saveVillaTranslationAction({
        villaId,
        locale: activeLocale,
        description: current.description,
        badge: current.badge,
        seoTitle: current.seoTitle,
        seoDescription: current.seoDescription,
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: "villa-translations-save",
          description: result.error,
        });
        return;
      }

      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: "villa-translations-save",
      });
    } finally {
      setSaving(false);
    }
  }

  const form = forms[activeLocale];

  return (
    <section className="card-premium p-6 md:p-8 space-y-6">
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
            içerik buradan düzenlenemez; boş bırakılan alanlar public
            tarafta Türkçe içeriğe geri döner.
          </p>
        </div>
      </header>

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
          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              Açıklama
            </label>
            <textarea
              className="input !rounded-2xl !p-4 min-h-[110px] resize-none"
              maxLength={5000}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              Rozet
            </label>
            <input
              className="input"
              maxLength={60}
              value={form.badge}
              onChange={(e) => setField("badge", e.target.value)}
            />
          </div>

          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              SEO Başlık
            </label>
            <input
              className="input"
              maxLength={120}
              value={form.seoTitle}
              onChange={(e) => setField("seoTitle", e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--color-stone-400)]">
              Önerilen: 60 karakter
            </p>
          </div>

          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              SEO Açıklama
            </label>
            <textarea
              className="input !rounded-2xl !p-4 min-h-[110px] resize-none"
              maxLength={300}
              value={form.seoDescription}
              onChange={(e) => setField("seoDescription", e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--color-stone-400)]">
              Önerilen: 160 karakter
            </p>
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
