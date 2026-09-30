"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Trash2 } from "lucide-react";

import { storageProvider } from "@/lib/storage";
import { convertImageToWebP } from "@/lib/image.helpers";
import { useSiteAssetVersions } from "@/lib/storage/use-site-asset-versions";
import { versionFor } from "@/lib/storage/site-asset-version";
import {
  SITE_ASSETS_BUCKET_NAME,
  resolveAssetUrlVersioned,
} from "@/lib/storage.helpers";

/* ===============================================================
   🛡️ SETTINGS FIELDS — reusable form primitives
   ===============================================================
   Settings sub-route'larının ortak input primitif'leri. Tek dosyada
   topla: label + hint + input variants. Settings sayfaları ile
   sınırlı (admin/_components klasörü route-internal).

   Pattern: controlled inputs, parent state. saveSettings flow
   route-spesifik; primitive sadece UI.
   =============================================================== */

/* ---------- SettingsSection: card wrapper + title + hint ---------- */
export function SettingsSection({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="card-premium p-6 md:p-8 space-y-6">
      <header>
        <h2 className="font-display text-xl md:text-2xl text-[var(--color-stone-900)] tracking-[-0.015em]">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-[var(--color-stone-500)] mt-2 leading-relaxed max-w-xl">
            {description}
          </p>
        )}
      </header>
      <div className="space-y-5">{children}</div>
      {footer && (
        <div className="pt-3 border-t border-[var(--color-stone-100)]">
          {footer}
        </div>
      )}
    </section>
  );
}

/* ---------- Label + hint wrapper ---------- */
export function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] block">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11.5px] text-[var(--color-stone-400)] leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ---------- TextField (text/tel/email/url) ---------- */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "tel" | "email" | "url";
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="input"
      />
    </FieldShell>
  );
}

/* ---------- NumberField ---------- */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  hint,
  disabled,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? "" : Number(v));
        }}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        className="input"
      />
    </FieldShell>
  );
}

/* ---------- TextAreaField ---------- */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 4,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className="input !rounded-2xl !p-4 leading-relaxed resize-none"
      />
    </FieldShell>
  );
}

/* ---------- ToggleField (on/off switch) ---------- */
export function ToggleField({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "flex items-start justify-between gap-4 py-1 cursor-pointer " +
        (disabled ? "opacity-60 cursor-not-allowed" : "")
      }
    >
      <div className="min-w-0">
        <span className="text-[14px] font-medium text-[var(--color-stone-900)] block">
          {label}
        </span>
        {description && (
          <span className="text-[12.5px] text-[var(--color-stone-500)] block mt-0.5 leading-relaxed">
            {description}
          </span>
        )}
      </div>
      <span className="shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <span
          aria-hidden="true"
          className="relative inline-block w-10 h-6 rounded-full bg-[var(--color-stone-200)] peer-checked:bg-[var(--color-champagne-500)] transition-colors"
        >
          <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
        </span>
      </span>
    </label>
  );
}

/* ---------- SaveButton (form footer) ---------- */
export function SaveButton({
  loading,
  saved,
  disabled,
  label = "Kaydet",
  savedLabel = "Kaydedildi",
}: {
  loading?: boolean;
  saved?: boolean;
  disabled?: boolean;
  label?: string;
  savedLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="btn-primary disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading ? "Kaydediliyor…" : saved ? savedLabel : label}
    </button>
  );
}

/* ---------- UploadField — generic image uploader (WebP + R2 storage)
   ----------
   Settings sayfalarında logo / watermark / hero gibi tek image
   alanlarını yöneten reusable component.

   PATH: Caller `folder` + `slug` verir → `<folder>/<slug>.webp`
   deterministik path. upsert: true ile aynı slug üzerine yazılır.

   DB DEĞERİ: Mevcut Settings.site_logo / watermark_logo /
   hero_background_image alanları **FULL PUBLIC URL** tutuyor
   (legacy pattern; footer/hero resolver bu URL'i direkt
   <img src/> kullanıyor). Bu kontratı bozmamak için
   getPublicUrl ile URL üretip onChange callback'i ile
   parent'a iletiyoruz. Parent updateSettings ile bu URL'i
   DB'ye yazar.
---------- */
export function UploadField({
  label,
  hint,
  currentUrl,
  onChange,
  folder,
  slug,
  disabled,
  version,
}: {
  label: string;
  hint?: string;
  /** Mevcut public URL (DB'den). NULL → görsel yok. */
  currentUrl: string | null;
  /** Yeni public URL (storage'a upload sonrası getPublicUrl çıktısı).
   *  null → "Görseli kaldır" senaryosu. Parent DB'ye yazar. */
  onChange: (newUrl: string | null) => void;
  /** Bucket içinde klasör (site-assets/<folder>/...). */
  folder: string;
  /** Path'in dosya adı kısmı (`<folder>/<slug>.webp`). */
  slug: string;
  disabled?: boolean;
  /** Cache-bust anahtarı (settings.updated_at). Verilirse preview
   *  URL'ine `?v=` eklenir → overwrite sonrası reload'da taze görsel. */
  version?: string | number | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* 🛡️ Admin-only preview cache-bust — singleton dosya adı (örn.
     hero/homepage-hero.webp) upload sonrası AYNI URL ürettiğinden
     tarayıcı eski görseli cache'ten gösteriyordu. Upload başarısında
     bu key güncellenir; preview src'sine ?ts=<key> eklenir. Public
     frontend / upload / storage / DB DEĞİŞMEZ. */
  const [bustTs, setBustTs] = useState<number | null>(null);
  /* 🛡️ Önizleme `?v=` = R2 nesnesinin güncel ETag'i (görsel değişince
     değişir; kayıt beklenmeden). Alınamazsa `version` prop'u (mevcut
     settings.updated_at davranışı) kullanılır. */
  const assetVersions = useSiteAssetVersions([currentUrl]);

  async function handleFile(file: File) {
    if (!slug || !slug.trim()) {
      setError("Slug tanımlı değil");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const webp = await convertImageToWebP(file);
      const path = `${folder}/${slug}.webp`;
      /* FAZ 38: storageProvider delege; upsert + contentType +
         cacheControl aynen. */
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
        setError(upRes.error);
        return;
      }
      /* 🛡️ Aşama B — DB'ye RELATIVE PATH yaz (örn. "logo/logo.webp").
         Aşama A sayesinde read tarafı (Hero/Footer/Header/RootLayout)
         resolveAssetUrl ile path→URL üretiyor. Eski FULL URL kayıtları
         AYNEN çalışmaya devam eder (resolveAssetUrl HTTP(S) pass-through).
         Storage provider değişiminde DB UPDATE gerekmez. */
      onChange(path);
      /* Yeni R2 versiyonu (ETag) → önizleme `?v=` değişir. */
      await assetVersions.refresh(path);
      /* Preview cache-bust — yeni baytları AYNI URL'de görebilmek için. */
      setBustTs(Date.now());
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /* Preview src — resolveAssetUrl çıktısına (varsa) ?ts=<bustTs> ekle.
     bustTs null iken (sayfa ilk açılış) davranış AYNEN eski (ts yok). */
  const resolvedPreview = resolveAssetUrlVersioned(
    currentUrl,
    versionFor(assetVersions.versions, currentUrl) ?? version
  );
  const previewSrc = resolvedPreview
    ? bustTs
      ? `${resolvedPreview}${resolvedPreview.includes("?") ? "&" : "?"}ts=${bustTs}`
      : resolvedPreview
    : "";

  return (
    <FieldShell label={label} hint={hint}>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || disabled}
          className="relative w-24 h-24 rounded-2xl overflow-hidden bg-[var(--color-sand-50)] border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title={currentUrl ? "Görseli değiştir" : "Görsel yükle"}
        >
          {currentUrl ? (
            /* 🛡️ Aşama B — currentUrl artık FULL URL VEYA relative path
               olabilir. resolveAssetUrl normalize eder; legacy URL'ler
               pass-through, yeni path'ler runtime'da URL'e çevrilir. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[var(--color-stone-400)]">
              <ImagePlus size={20} />
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-medium text-[var(--color-stone-700)]">
              Yükleniyor…
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="flex-1 min-w-0">
          {currentUrl && (
            <p className="text-[11.5px] font-mono text-[var(--color-stone-400)] truncate">
              {currentUrl.split("/").slice(-2).join("/")}
            </p>
          )}
          {error && (
            <p className="text-[12px] text-red-600 mt-1.5">{error}</p>
          )}
          {currentUrl && !uploading && !disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-red-600 hover:text-red-700 mt-2"
            >
              <Trash2 size={12} /> Kaldır
            </button>
          )}
        </div>
      </div>
    </FieldShell>
  );
}

/* ---------- ComingSoon — boş section placeholder ---------- */
export function ComingSoon({
  description,
}: {
  description?: string;
}) {
  return (
    <div className="card-premium p-10 text-center">
      <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
        <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
        Yakında
      </p>
      <h2 className="font-display text-2xl text-[var(--color-stone-900)] mt-4 tracking-[-0.015em]">
        Bu bölüm yapım aşamasında
      </h2>
      <p className="text-sm text-[var(--color-stone-500)] mt-3 max-w-md mx-auto leading-relaxed">
        {description ||
          "Bu ayar bölümü için DB schema'sı genişletilecek. İhtiyaç netleştiğinde alanlar buraya eklenecek."}
      </p>
    </div>
  );
}
