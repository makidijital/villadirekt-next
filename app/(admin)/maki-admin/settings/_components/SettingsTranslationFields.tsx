"use client";

import type { ChangeEvent, ReactNode } from "react";
import { Info, Lock } from "lucide-react";

import { SettingsSection, FieldShell } from "./SettingsField";

/* ===============================================================
   🛡️ SETTINGS TRANSLATION FIELDS — reusable primitives
   ===============================================================
   `/maki-admin/settings/ceviriler` ekranının yapı taşları.
   `SettingsField.tsx` ile AYNI tasarım dili: `card-premium` section,
   `FieldShell` label/hint ritmi, `.input` sınıfı, aynı tipografi ve
   spacing. YENİ bir tasarım dili İCAT EDİLMEDİ.

   🛡️ PHASE 10L — KAYIT AKTİF (yalnız 4 alan için).
   `settings_translations` (migration 083) bağlandı. `TranslationField`
   artık `value` + `onChange` alırsa EN/DE için DÜZENLENEBİLİR olur;
   bu props'lar verilmezse ESKİ davranış (salt okunur, `disabled`)
   aynen korunur — kapsam dışı gruplar (Hero, çalışma saatleri, adres)
   bu sayede hiç değişmeden kalır.

   TR HER DURUMDA SALT OKUNURDUR: canonical kaynak `settings` satırıdır
   ve ilgili ayar alt sayfasından düzenlenir. `locale === "tr"` dalı
   `onChange` verilse bile düzenlemeye İZİN VERMEZ.

   ⚠️ Mevcut settings save akışı (tek form + tek SaveButton + atomik PUT
   /api/admin/settings) bu ekrandan HİÇ ETKİLENMEZ — çeviriler AYRI bir
   tabloya, AYRI bir server action ile yazılır.
   =============================================================== */

/* ---------- Locale modeli ---------- */

/** Bu ekranın dil kümesi. TR canonical kaynaktır (salt okunur). */
export type TranslationLocale = "tr" | "en" | "de";

/** TR canonical olduğu için yazılabilir locale'ler yalnız EN/DE —
 *  projedeki diğer çeviri panelleriyle (types/features/rules/
 *  price-includes/villas) AYNI kural. */
export type WritableTranslationLocale = Exclude<TranslationLocale, "tr">;

export const TRANSLATION_LOCALES: ReadonlyArray<{
  code: TranslationLocale;
  label: string;
}> = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
];

/* ---------- TranslationLanguageTabs ---------- */

/**
 * Dil sekmeleri. Mobilde yatay kaydırılır (SettingsNav'ın mobil pill
 * scroller deseniyle aynı), masaüstünde tek satır.
 */
export function TranslationLanguageTabs({
  active,
  onChange,
}: {
  active: TranslationLocale;
  onChange: (locale: TranslationLocale) => void;
}) {
  return (
    <nav
      aria-label="Çeviri dili"
      className="-mx-5 md:mx-0 px-5 md:px-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        role="tablist"
        aria-label="Çeviri dili"
        className="inline-flex gap-1.5 rounded-2xl border border-[var(--color-stone-100)] bg-white p-1.5 shadow-sm w-max"
      >
        {TRANSLATION_LOCALES.map((loc) => {
          const isActive = loc.code === active;
          return (
            <button
              key={loc.code}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(loc.code)}
              className={
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-300)] " +
                (isActive
                  ? "bg-[var(--color-stone-900)] text-white"
                  : "text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)]")
              }
            >
              {loc.code === "tr" && (
                <Lock
                  size={11}
                  aria-hidden="true"
                  className={
                    isActive ? "text-white/80" : "text-[var(--color-stone-400)]"
                  }
                />
              )}
              {loc.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------- TranslationInfo ---------- */

export type TranslationInfoTone = "info" | "muted";

/**
 * Bilgi kartı — ekranın durumu / uyarı metinleri.
 * `SettingsField.tsx > ComingSoon` ile aynı görsel aile.
 */
export function TranslationInfo({
  title,
  body,
  tone = "info",
}: {
  title: string;
  body: string;
  tone?: TranslationInfoTone;
}) {
  const isInfo = tone === "info";
  return (
    <div
      className={
        "rounded-2xl border p-5 md:p-6 flex items-start gap-3.5 " +
        (isInfo
          ? "border-[var(--color-champagne-300)]/50 bg-[var(--color-sand-50)]"
          : "border-[var(--color-stone-100)] bg-white")
      }
    >
      <span
        aria-hidden="true"
        className={
          "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full " +
          (isInfo
            ? "bg-white text-[var(--color-champagne-700)]"
            : "bg-[var(--color-sand-50)] text-[var(--color-stone-500)]")
        }
      >
        <Info size={15} />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[15px] md:text-base text-[var(--color-stone-900)] tracking-[-0.01em]">
          {title}
        </p>
        <p className="text-[13px] text-[var(--color-stone-600)] mt-1.5 leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  );
}

/* ---------- TranslationSection ---------- */

/**
 * Bir çeviri grubunun durumu:
 *   active  — public'te bugün (multilingual açıkken) EN/DE'de görünüyor
 *   review  — çevrilip çevrilmeyeceği henüz kararlaşmadı
 *   planned — ilgili EN/DE public sayfası açıldığında kullanılacak
 */
export type TranslationSectionStatus = "active" | "review" | "planned";

const STATUS_LABELS: Record<TranslationSectionStatus, string> = {
  active: "EN/DE'de görünüyor",
  review: "İnceleme · opsiyonel",
  planned: "Yakında",
};

const STATUS_CLASSNAMES: Record<TranslationSectionStatus, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-800",
  review:
    "border-[var(--color-champagne-300)] bg-[var(--color-sand-50)] text-[var(--color-champagne-700)]",
  planned:
    "border-[var(--color-stone-200)] bg-[var(--color-sand-50)] text-[var(--color-stone-500)]",
};

export function TranslationStatusBadge({
  status,
}: {
  status: TranslationSectionStatus;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap " +
        STATUS_CLASSNAMES[status]
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Çeviri grubu kabuğu. `SettingsSection`'ı sarar (aynı card-premium
 * kartı, aynı spacing); ek olarak sağ üstte durum rozeti ve isteğe
 * bağlı bir not satırı gösterir.
 */
export function TranslationSection({
  title,
  description,
  status,
  note,
  children,
  footer,
}: {
  title: string;
  description?: string;
  status: TranslationSectionStatus;
  note?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative">
      <SettingsSection title={title} description={description} footer={footer}>
        {note && (
          <p className="text-[12px] text-[var(--color-stone-500)] leading-relaxed rounded-xl bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] px-4 py-3">
            {note}
          </p>
        )}
        {children}
      </SettingsSection>

      {/* Durum rozeti — kartın başlık hizasında, sağ üstte. Mobilde
          başlığın üzerine binmemesi için akışta değil, absolute. */}
      <div className="absolute right-6 top-6 md:right-8 md:top-8">
        <TranslationStatusBadge status={status} />
      </div>
    </div>
  );
}

/* ---------- TranslationField ---------- */

/**
 * Tek bir çevrilebilir settings alanının, SEÇİLİ DİL için gösterimi.
 *
 * - `locale === "tr"` → canonical değer HER ZAMAN salt okunur.
 *   (TR'nin düzenlendiği yer ilgili settings alt sayfasıdır.)
 * - `locale === "en" | "de"`:
 *     • `onChange` VERİLDİYSE → düzenlenebilir (Phase 10L kapsamındaki
 *       4 alan). Boş bırakılırsa public tarafta TR canonical gösterilir.
 *     • `onChange` VERİLMEDİYSE → eski davranış: `disabled`, açıklayıcı
 *       placeholder (kapsam dışı gruplar).
 */
export function TranslationField({
  label,
  locale,
  canonicalValue,
  hint,
  placeholderHint,
  multiline = false,
  rows = 4,
  value,
  onChange,
  saving = false,
}: {
  label: string;
  locale: TranslationLocale;
  /** Mevcut settings'teki TR canonical değer (server-side okunur). */
  canonicalValue: string;
  hint?: string;
  /** Örn. `{year}` / `{site_name}` gibi yer tutucu uyarısı. */
  placeholderHint?: string;
  multiline?: boolean;
  rows?: number;
  /** Seçili EN/DE değeri. TR'de YOK SAYILIR. */
  value?: string;
  /** Verilirse alan EN/DE'de düzenlenebilir olur. */
  onChange?: (next: string) => void;
  /** Kayıt sürerken input'lar kilitlenir. */
  saving?: boolean;
}) {
  const isTr = locale === "tr";
  /* 🛡️ TR asla düzenlenemez — `onChange` geçilse bile. */
  const editable = !isTr && typeof onChange === "function";
  const hasCanonical = canonicalValue.trim().length > 0;

  const shownValue = isTr ? canonicalValue : value ?? "";

  const placeholder = isTr
    ? "Bu alan henüz doldurulmamış"
    : editable
      ? "Boş bırakılırsa Türkçe metin gösterilir"
      : "Çeviri sistemi henüz bağlanmadı";

  const composedHint = [
    hint,
    placeholderHint,
    isTr
      ? "Türkçe canonical içeriktir; ilgili ayar sayfasından düzenlenir."
      : editable
        ? "Boş bırakılırsa bu dilde Türkçe canonical metin gösterilir."
        : "Bu alan çeviri veritabanı bağlantısı tamamlandığında aktif olacak.",
  ]
    .filter((part): part is string => !!part)
    .join(" ");

  const sharedClassName =
    "input disabled:cursor-not-allowed " +
    (isTr && hasCanonical
      ? "disabled:opacity-100 disabled:text-[var(--color-stone-700)]"
      : "disabled:opacity-70");

  const commonProps = {
    value: shownValue,
    placeholder,
    "aria-label": `${label} — ${localeLabel(locale)}`,
  } as const;

  const lockedProps = { readOnly: true, disabled: true } as const;
  const editableProps = {
    disabled: saving,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange?.(e.target.value),
  };

  return (
    <FieldShell label={label} hint={composedHint}>
      {multiline ? (
        <textarea
          {...commonProps}
          {...(editable ? editableProps : lockedProps)}
          rows={rows}
          className={sharedClassName + " !rounded-2xl !p-4 leading-relaxed resize-none"}
        />
      ) : (
        <input
          type="text"
          {...commonProps}
          {...(editable ? editableProps : lockedProps)}
          className={sharedClassName}
        />
      )}
    </FieldShell>
  );
}

function localeLabel(locale: TranslationLocale): string {
  const found = TRANSLATION_LOCALES.find((l) => l.code === locale);
  return found ? found.label : locale;
}
