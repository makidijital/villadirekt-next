"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Image as ImageIcon,
  UploadCloud,
  Loader2,
  Square,
  Palette,
} from "lucide-react";

import {
  type AdminBrandingFileKey,
  getAdminBrandingUrl,
} from "@/lib/admin-branding";
import { uploadAdminBranding } from "@/lib/admin-branding.client";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🔥 WEBMASTER — Admin Panel Branding Yönetimi
   ===============================================================
   Yalnız ADMIN PANEL branding'i:
     - Admin Logo  → admin sidebar / topbar / login mark
     - Admin Icon  → browser tab favicon (admin section)

   Frontend site logosu / site watermark'ı / front header bu
   sayfa üzerinden YÖNETİLMEZ — onlar settings sayfasında kalır
   ve aynen çalışmaya devam eder.

   Storage:
     bucket: site-assets
     folder: branding/
     dosya isimleri sabit: admin-{logo|icon}.webp
     upsert: true → her upload mevcut dosyayı overwrite eder
     cache-bust query state'te tutulan timestamp ile uygulanır

   DB migration / yeni tablo YOK; bu yalnız storage UI.
   =============================================================== */

type CardKey = AdminBrandingFileKey;

type CardState = {
  /** Cache-bust timestamp.
   *  - HYDRATION SAFETY: ilk render (SSR + client) `null` → stable
   *    URL üretir, React hydration mismatch yok.
   *  - useEffect post-mount: Date.now() set edilir → image src
   *    değişir, fresh blob fetch edilir.
   *  - Upload sonrası: yeni Date.now() set edilir → preview anında
   *    yenilenir. */
  cacheBust: number | null;
  uploading: boolean;
  error: string | null;
};

const INITIAL_CARD_STATE = (): CardState => ({
  cacheBust: null,
  uploading: false,
  error: null,
});

export default function WebmasterPage() {
  /* 🛡️ Upload sonrası server admin layout'u yeni R2 versiyonuyla yeniden
     render olsun → sidebar logosu / favicon sayfa yenilemeden güncellenir
     (client state korunur). */
  const router = useRouter();
  const toast = useNotify();
  const [cards, setCards] = useState<Record<CardKey, CardState>>({
    "admin-logo": INITIAL_CARD_STATE(),
    "admin-icon": INITIAL_CARD_STATE(),
  });

  /* ---------------------------------------------
     🔥 POST-MOUNT CACHE-BUST
     SSR + ilk client render: cacheBust=null (stable URL).
     Hydration tamamlandıktan sonra Date.now() ile yenilenir →
     <img> src değişir, browser/CDN cache atlanır, kullanıcıya
     güncel branding gösterilir. Hydration warning yok.
  ---------------------------------------------- */
  useEffect(() => {
    const ts = Date.now();
    setCards((prev) => ({
      "admin-logo": { ...prev["admin-logo"], cacheBust: ts },
      "admin-icon": { ...prev["admin-icon"], cacheBust: ts },
    }));
  }, []);

  /* File input ref'leri — programatik click için */
  const logoInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const inputRefs: Record<
    CardKey,
    React.RefObject<HTMLInputElement | null>
  > = {
    "admin-logo": logoInputRef,
    "admin-icon": iconInputRef,
  };

  /* ---------------------------------------------
     🔥 UPLOAD — fileKey'e göre uploadAdminBranding çağırır;
     başarıda cacheBust yenilenir, hata state'e yazılır.
     Logic helper'da; bu fonksiyon yalnız UI orchestration.
  ---------------------------------------------- */
  async function handleSelect(
    fileKey: CardKey,
    file: File | null,
    options?: { maxWidth?: number }
  ): Promise<void> {
    if (!file) return;

    setCards((prev) => ({
      ...prev,
      [fileKey]: { ...prev[fileKey], uploading: true, error: null },
    }));

    try {
      const result = await uploadAdminBranding(fileKey, file, options);
      setCards((prev) => ({
        ...prev,
        [fileKey]: {
          cacheBust: result.cacheBust,
          uploading: false,
          error: null,
        },
      }));
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Yükleme başarısız";
      setCards((prev) => ({
        ...prev,
        [fileKey]: {
          ...prev[fileKey],
          uploading: false,
          error: msg,
        },
      }));
      toast.error("Yükleme başarısız", {
        id: `branding-upload-${fileKey}`,
        description: msg,
      });
    } finally {
      const inputEl = inputRefs[fileKey].current;
      if (inputEl) inputEl.value = "";
    }
  }

  return (
    <div className="space-y-8 w-full">
      {/* HEADER */}
      <div>
        <p className="eyebrow flex items-center gap-1.5">
          <Palette
            size={11}
            className="text-[var(--color-champagne-600)]"
          />
          Webmaster
        </p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Admin Panel Branding
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Sadece <strong>admin panel</strong> görsel kimliğini yönetir.
          Frontend site logosu ve watermark&apos;ı{" "}
          <strong>
            <em>Sistem → Ayarlar</em>
          </strong>{" "}
          sayfasından yönetilir; bu sayfa onlara dokunmaz.
        </p>
      </div>

      <BrandingCard
        title="Admin Logo"
        subtitle="Admin sidebar / topbar / login ekranı mark'ı"
        icon={ImageIcon}
        previewKind="rect"
        fileKey="admin-logo"
        cards={cards}
        inputRef={logoInputRef}
        onSelect={(file) =>
          handleSelect("admin-logo", file, { maxWidth: 1024 })
        }
      />

      <BrandingCard
        title="Admin Icon (Favicon)"
        subtitle="Browser tab favicon — admin sayfaları için"
        icon={Square}
        previewKind="square"
        fileKey="admin-icon"
        cards={cards}
        inputRef={iconInputRef}
        onSelect={(file) =>
          handleSelect("admin-icon", file, { maxWidth: 512 })
        }
      />

      <p className="text-[11px] text-[var(--color-stone-400)]">
        Yüklemeler <code>site-assets/branding/</code> klasörüne sabit
        dosya isimleriyle (admin-logo / admin-icon .webp) overwrite
        edilir. Cache-bust query ile görsel anında yenilenir; admin
        sidebar, login ekranı ve tarayıcı sekmesi yenilemeden sonra
        otomatik güncellenir.
      </p>
    </div>
  );
}

/* ===============================================================
   🔥 BrandingCard — pure presentational kart.
   - Upload state parent'ta (cards map).
   - Image-broken durumu (storage'da dosya yoksa <img> 404) yalnız
     kartın kendi local state'inde tutulur; her upload sonrası
     cacheBust değişir → <img key=cacheBust> remount → fallback
     flag temizlenir (yeni dosyayı bir kez daha denenir).
   =============================================================== */
type PreviewKind = "rect" | "square";

function BrandingCard({
  title,
  subtitle,
  icon: Icon,
  previewKind,
  fileKey,
  cards,
  inputRef,
  onSelect,
}: {
  title: string;
  subtitle: string;
  icon: typeof ImageIcon;
  previewKind: PreviewKind;
  fileKey: CardKey;
  cards: Record<CardKey, CardState>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (file: File | null) => void;
}) {
  const state = cards[fileKey];
  const url = getAdminBrandingUrl(fileKey, state.cacheBust);

  /* Storage'da dosya yoksa <img> error verir → placeholder göster.
     Comparison key string olarak tutulur — cacheBust null iken
     ("stable") ve number iken çakışmaması için. Initial render'da
     brokenKey null → isBroken=false → img attempt. */
  const currentKey =
    state.cacheBust === null ? "stable" : String(state.cacheBust);
  const [brokenKey, setBrokenKey] = useState<string | null>(null);
  const isBroken = brokenKey === currentKey;

  const previewSizeClass =
    previewKind === "square" ? "w-28 h-28" : "w-40 h-28";

  return (
    <section className="card-premium p-6 md:p-7 space-y-5">
      {/* HEAD */}
      <div>
        <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] flex items-center gap-1.5">
          <Icon
            size={12}
            className="text-[var(--color-champagne-600)]"
          />
          {title}
        </p>
        <p className="text-xs text-[var(--color-stone-400)] mt-1">
          {subtitle} — PNG, JPG, JPEG, WebP veya SVG. Maksimum 5MB.
          Otomatik olarak WebP&apos;ye dönüştürülür.
        </p>
      </div>

      {/* PREVIEW + ACTIONS */}
      <div className="flex flex-row items-start gap-5">
        <div
          className={`rounded-2xl bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] flex items-center justify-center overflow-hidden shrink-0 ${previewSizeClass}`}
        >
          {isBroken ? (
            <Icon
              size={28}
              className="text-[var(--color-stone-300)]"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={currentKey}
              src={url}
              alt={title}
              className="max-w-full max-h-full object-contain"
              onError={() => setBrokenKey(currentKey)}
            />
          )}
        </div>

        {/* ACTIONS */}
        <div className="flex-1 space-y-2 min-w-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={state.uploading}
            className="btn-primary"
          >
            {state.uploading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Yükleniyor…
              </>
            ) : (
              <>
                <UploadCloud size={15} />
                {isBroken ? "Yükle" : "Değiştir"}
              </>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            className="hidden"
            onChange={(e) => onSelect(e.target.files?.[0] || null)}
          />

          {state.error && (
            <p className="text-[12px] text-red-600">{state.error}</p>
          )}

          <p className="text-[11px] text-[var(--color-stone-400)] truncate">
            site-assets/branding/{fileKey}.webp
          </p>
        </div>
      </div>
    </section>
  );
}
