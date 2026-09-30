"use client";

/* ===============================================================
   🛡️ PHASE 10D — Batch 3 — Kural (rule_items) Çeviri Paneli
   ===============================================================
   `FeatureTranslationsPanel.tsx` (Batch 2) ile BİREBİR AYNI desen —
   tek fark: çevrilebilir alan `title` (`name` DEĞİL — rule_items DB
   kolonu). TR bu panelden DÜZENLENEMEZ — yalnız referans olarak
   gösterilir. EN/DE pill-tab; aynı anda yalnız TEK input gösterilir.
   =============================================================== */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadRuleTranslationsAction,
  saveRuleTranslationAction,
} from "./rule-translations.action";

type WritableLocale = "en" | "de";

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

type Props = {
  ruleId: string;
  /** TR referans metni — bu panelden DÜZENLENEMEZ, yalnız gösterilir. */
  ruleTitle: string;
};

export default function RuleTranslationsPanel({ ruleId, ruleTitle }: Props) {
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
      const result = await loadRuleTranslationsAction(ruleId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: `rule-translations-load-${ruleId}`,
          description: result.error,
        });
        setLoading(false);
        return;
      }

      setForms((prev) => {
        const next = { ...prev };
        for (const row of result.rows) {
          if (row.locale !== "en" && row.locale !== "de") continue;
          next[row.locale] = row.title ?? "";
        }
        return next;
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId]);

  async function handleSave() {
    const current = forms[activeLocale];
    if (!current.trim()) {
      toast.error("Başlık gerekli", {
        id: `rule-translations-save-${ruleId}`,
      });
      return;
    }

    setSaving(true);
    try {
      const result = await saveRuleTranslationAction({
        ruleId,
        locale: activeLocale,
        title: current,
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: `rule-translations-save-${ruleId}`,
          description: result.error,
        });
        return;
      }

      setForms((prev) => ({
        ...prev,
        [activeLocale]: result.row.title ?? current,
      }));

      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: `rule-translations-save-${ruleId}`,
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
          {ruleTitle}
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
