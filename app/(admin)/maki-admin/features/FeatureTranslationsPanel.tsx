"use client";

/* ===============================================================
   🛡️ PHASE 10D — Batch 2 — Feature (villa_features) Çeviri Paneli
   ===============================================================
   `VillaTranslationsCard.tsx` (Phase 10A) ile AYNI prensip:
   self-contained panel, kendi state/save mekanizması — Features
   sayfasının mevcut CRUD akışına (handleAdd/handleUpdate/handleDelete)
   KARIŞMAZ.

   TR bu panelden DÜZENLENEMEZ — yalnız referans olarak gösterilir
   (parent'tan `featureName` prop'u, salt okunur metin). EN/DE
   pill-tab; aynı anda yalnız TEK input gösterilir (TR+EN+DE üç
   input birden GÖSTERİLMEZ — kullanıcı talebi).

   Parent (`page.tsx`) panelin açık/kapalı durumunu yönetir (tek
   satırlık açık panel state'i) — bu component yalnız `featureId`
   açıkken mount edilir, kendi iç state'i unmount ile temizlenir.
   =============================================================== */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadFeatureTranslationsAction,
  saveFeatureTranslationAction,
} from "./feature-translations.action";

type WritableLocale = "en" | "de";

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

type Props = {
  featureId: string;
  /** TR referans metni — bu panelden DÜZENLENEMEZ, yalnız gösterilir. */
  featureName: string;
};

export default function FeatureTranslationsPanel({
  featureId,
  featureName,
}: Props) {
  const toast = useNotify();

  const [forms, setForms] = useState<Record<WritableLocale, string>>({
    en: "",
    de: "",
  });
  const [activeLocale, setActiveLocale] = useState<WritableLocale>("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await loadFeatureTranslationsAction(featureId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: `feature-translations-load-${featureId}`,
          description: result.error,
        });
        setLoading(false);
        return;
      }

      setForms((prev) => {
        const next = { ...prev };
        for (const row of result.rows) {
          if (row.locale !== "en" && row.locale !== "de") continue;
          next[row.locale] = row.name ?? "";
        }
        return next;
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId]);

  async function handleSave() {
    const current = forms[activeLocale];
    if (!current.trim()) {
      toast.error("İsim gerekli", {
        id: `feature-translations-save-${featureId}`,
      });
      return;
    }

    setSaving(true);
    try {
      const result = await saveFeatureTranslationAction({
        featureId,
        locale: activeLocale,
        name: current,
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: `feature-translations-save-${featureId}`,
          description: result.error,
        });
        return;
      }

      setForms((prev) => ({
        ...prev,
        [activeLocale]: result.row.name ?? current,
      }));

      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: `feature-translations-save-${featureId}`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-premium p-4 mt-2 space-y-4">
      <div>
        <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-400)]">
          Türkçe (referans, salt okunur)
        </p>
        <p className="text-sm text-[var(--color-stone-600)] mt-1">
          {featureName}
        </p>
      </div>

      <div className="flex gap-2">
        {(Object.keys(LOCALE_LABELS) as WritableLocale[]).map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            className={
              activeLocale === locale
                ? "rounded-full bg-[var(--color-stone-900)] px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full bg-[var(--color-stone-100)] px-3 py-1 text-xs font-semibold text-[var(--color-stone-600)]"
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
        <div className="space-y-3">
          <input
            aria-label={LOCALE_LABELS[activeLocale]}
            className="input"
            maxLength={200}
            value={forms[activeLocale]}
            onChange={(e) =>
              setForms((prev) => ({
                ...prev,
                [activeLocale]: e.target.value,
              }))
            }
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition disabled:opacity-60"
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
    </div>
  );
}
