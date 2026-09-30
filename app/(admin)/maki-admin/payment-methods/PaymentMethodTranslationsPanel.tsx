"use client";

/* ===============================================================
   🛡️ MIGRATION 088 — Ödeme Yöntemi (payment_methods) Çeviri Paneli
   ===============================================================
   `app/(admin)/maki-admin/types/TypeTranslationsPanel.tsx` ile BİREBİR
   AYNI desen — çevrilebilir alan `name`. TR bu panelden DÜZENLENEMEZ,
   yalnız referans olarak gösterilir. EN/DE pill-tab; aynı anda yalnız
   TEK input gösterilir.

   ⚠️ TEK BİLİNÇLİ FARK — BOŞ DEĞER İZNİ: `TypeTranslationsPanel` boş
   adı REDDEDER. Ödeme yöntemi çevirileri OPSİYONELDİR (bkz.
   `payment-method-translation.service.ts`) — boş kaydetmek çeviriyi
   TEMİZLER ve kayıt TR fallback'ine (`resolveTaxonomyName`) döner.

   ⚠️ CACHE INVALIDATION YOK: `payment_methods` projede HİÇ
   cache'lenmiyor (`lib/cache.helpers.ts` içinde girdisi yok;
   `/api/public/payment-methods` `force-dynamic`). Yeni bir cache/
   revalidate mekanizması İCAT EDİLMEDİ.
   =============================================================== */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadPaymentMethodTranslationsAction,
  savePaymentMethodTranslationAction,
} from "./payment-method-translations.action";

type WritableLocale = "en" | "de";

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

type Props = {
  paymentMethodId: string;
  /** TR referans metni — bu panelden DÜZENLENEMEZ, yalnız gösterilir. */
  paymentMethodName: string;
};

export default function PaymentMethodTranslationsPanel({
  paymentMethodId,
  paymentMethodName,
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
      const result = await loadPaymentMethodTranslationsAction(paymentMethodId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: `payment-method-translations-load-${paymentMethodId}`,
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
  }, [paymentMethodId]);

  async function handleSave() {
    /* 🛡️ Boş değer GEÇERLİDİR — çeviriyi temizler (TR fallback). */
    const current = forms[activeLocale];

    setSaving(true);
    try {
      const result = await savePaymentMethodTranslationAction({
        paymentMethodId,
        locale: activeLocale,
        name: current,
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: `payment-method-translations-save-${paymentMethodId}`,
          description: result.error,
        });
        return;
      }

      setForms((prev) => ({
        ...prev,
        [activeLocale]: result.row.name ?? "",
      }));

      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: `payment-method-translations-save-${paymentMethodId}`,
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
          {paymentMethodName}
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

          <p className="text-[11px] text-[var(--color-stone-400)] leading-relaxed">
            Boş bırakılan dilde Türkçe ad gösterilir.
          </p>

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
