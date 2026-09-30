import { storageProvider, STORAGE_BUCKETS } from "@/lib/storage";

/* ===============================================================
   🔥 ADMIN BRANDING — TEK MERKEZİ HELPER
   ===============================================================
   Sadece ADMIN PANEL branding'i için. Frontend site logosu /
   site watermark'ı / front header — bu dosya tarafından
   YÖNETİLMEZ; onlar settings.site_logo / settings.watermark_logo
   üzerinden çalışır ve aynen korunur.

   Sabit dosya yolları:
     site-assets/branding/admin-logo.webp
     site-assets/branding/admin-icon.webp

   ÖNEMLİ:
     - Random filename YOK; her upload aynı path'in üstüne yazar
       (upsert: true).
     - Public URL'e cache-bust query (?ts=...) eklenir;
       browser/CDN eski görseli göstermesin.
     - DB migration / yeni tablo YOK; URL'ler dosya yolundan
       deterministic üretilir.

   FALLBACK:
     Storage'da dosya yoksa public URL 404 döner; consumer
     <img onError> ile hardcoded mark'a düşer (admin sidebar
     "M" rozeti, login "M" kutusu, default favicon vb).
   =============================================================== */

/* FAZ 38: bucket sabit storage.constants'tan; backward-compat
   const re-export. */
export const ADMIN_BRANDING_BUCKET = STORAGE_BUCKETS.SITE_ASSETS;
export const ADMIN_BRANDING_FOLDER = "branding";

/* ---------------- KEY → FIXED PATH ---------------- */
export type AdminBrandingFileKey = "admin-logo" | "admin-icon";

export const ADMIN_BRANDING_PATHS: Record<
  AdminBrandingFileKey,
  string
> = {
  "admin-logo": `${ADMIN_BRANDING_FOLDER}/admin-logo.webp`,
  "admin-icon": `${ADMIN_BRANDING_FOLDER}/admin-icon.webp`,
};

/* ---------------- PUBLIC URL — HYDRATION-SAFE ----------------
   - cacheBust verilmezse: cache-bust query EKLENMEZ → URL stable.
     SSR ve client ilk render birebir aynı string üretir, React
     hydration mismatch oluşmaz.
   - cacheBust verilirse (upload sonrası ya da useEffect içindeki
     mounted timestamp): "?ts=..." eklenir, browser/CDN eski görseli
     atlatır.

   Önce kullandığımız "module-level Date.now()" pattern'i SSR'da
   T1, client'ta T2 üretiyordu → hydration warning. Bu fonksiyon
   artık module-level timestamp KULLANMAZ; cache-bust kararı
   tüketicilere bırakılır (genelde useEffect post-mount).

   Dosya henüz yüklenmemişse storage 404 döner; hata UI tarafında
   <img onError> ile yakalanmalı (helper sessiz kalır).
---------------------------------------------------------------- */
export function getAdminBrandingUrl(
  fileKey: AdminBrandingFileKey,
  cacheBust?: number | string | null
): string {
  /* FAZ 38: storageProvider.getPublicUrl delege; URL formatı +
     hydration-safe stable string aynen (cache-bust query caller'da). */
  const path = ADMIN_BRANDING_PATHS[fileKey];
  const base = storageProvider.getPublicUrl(ADMIN_BRANDING_BUCKET, path) || "";
  if (!base) return "";
  if (cacheBust === undefined || cacheBust === null) {
    return base;
  }
  return `${base}?ts=${encodeURIComponent(String(cacheBust))}`;
}

/* ---------------- CONVENIENCE WRAPPERS ----------------
   Çağıran taraflarda tip-güvenli, kısa import:
     getAdminLogoUrl()  → admin sidebar / login mark
     getAdminIconUrl()  → admin favicon link injection
---------------------------------------------------------------- */
export function getAdminLogoUrl(
  cacheBust?: number | string | null
): string {
  return getAdminBrandingUrl("admin-logo", cacheBust);
}

export function getAdminIconUrl(
  cacheBust?: number | string | null
): string {
  return getAdminBrandingUrl("admin-icon", cacheBust);
}

/* ---------------- VALIDATION ---------------- */
export const ADMIN_BRANDING_ALLOWED_MIME: ReadonlyArray<string> = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
];

export const ADMIN_BRANDING_ALLOWED_EXT: ReadonlyArray<string> = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
];

export const ADMIN_BRANDING_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type AdminBrandingValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateAdminBrandingFile(
  file: File
): AdminBrandingValidation {
  const lowerName = (file.name || "").toLowerCase();
  const okMime = ADMIN_BRANDING_ALLOWED_MIME.includes(file.type);
  const okExt = ADMIN_BRANDING_ALLOWED_EXT.some((ext) =>
    lowerName.endsWith(ext)
  );
  if (!okMime && !okExt) {
    return {
      ok: false,
      error: "Sadece PNG, JPG, JPEG, WebP veya SVG yükleyebilirsin.",
    };
  }
  if (file.size > ADMIN_BRANDING_MAX_BYTES) {
    const mb = (ADMIN_BRANDING_MAX_BYTES / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      error: `Dosya boyutu ${mb}MB'tan büyük olamaz.`,
    };
  }
  return { ok: true };
}

/* ===============================================================
   ⚠️ BROWSER-ONLY UPLOAD PIPELINE → `lib/admin-branding.client.ts`
   ===============================================================
   Canvas / `document` / `createImageBitmap` kullanan WebP dönüşümü
   (`convertToAdminBrandingWebP`) ve upload akışı
   (`uploadAdminBranding`) client/server ayrıştırma sprintinde
   `lib/admin-branding.client.ts` (`import "client-only"`) modülüne
   TAŞINDI. Böylece bu dosya izomorfik (client-safe) kalır ve server
   component `(admin)/layout.tsx` yalnız read helper'ı (`getAdminIconUrl`)
   import ettiğinde "server browser kodu import ediyor" ihlali oluşmaz.
   DAVRANIŞ DEĞİŞMEDİ — kod gövdeleriyle birebir taşındı.

   Upload/convert kullanan client bileşenleri (webmaster paneli):
     import { uploadAdminBranding } from "@/lib/admin-branding.client";
   =============================================================== */
