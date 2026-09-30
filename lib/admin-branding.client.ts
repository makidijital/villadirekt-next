import "client-only";

import { storageProvider } from "@/lib/storage";
import {
  ADMIN_BRANDING_BUCKET,
  ADMIN_BRANDING_PATHS,
  getAdminBrandingUrl,
  validateAdminBrandingFile,
  type AdminBrandingFileKey,
} from "@/lib/admin-branding";

/* ===============================================================
   🔥 ADMIN BRANDING — BROWSER-ONLY UPLOAD PIPELINE
   ===============================================================
   AMAÇ (client/server ayrıştırma sprinti):
     `lib/admin-branding.ts` artık YALNIZ isomorphic/client-safe
     read + path + validation (server SSR layout güvenle import
     eder). Canvas / `document` / `createImageBitmap` kullanan
     browser-only WebP dönüşümü + upload akışı buraya taşındı.

   ⚠️ `import "client-only"`: bu modül SERVER bundle'a sızarsa
     BUILD HATA. Böylece server kodu browser kodunu import edemez
     (sprint hedefi: "Server kodu hiçbir zaman browser kodu import
     etmesin").

   ⚠️ DAVRANIŞ DEĞİŞMEDİ (byte-identical): fonksiyon gövdeleri
     admin-branding.ts'teki ORİJİNAL kodla birebir aynı; yalnız
     DOSYA KONUMU değişti. WebP kalite/maxWidth default'ları,
     upsert + cacheControl, cache-bust timestamp, throw/catch
     akışı aynen korunur.
   =============================================================== */

/* ---------------- WEBP CONVERSION (browser canvas) ----------------
   Settings page logo/watermark akışıyla aynı pattern: input
   PNG/JPG/JPEG/SVG/WebP → tarayıcı canvas üzerinden WebP blob.
   Şeffaflık (alpha channel) korunur. Logo için makul üst sınır
   1024px genişlik (admin sidebar / login bg gibi farklı boyut
   gerekirse maxWidth override edilebilir).
---------------------------------------------------------------- */
async function fileToBitmap(file: File): Promise<{
  bitmap: ImageBitmap | null;
  img: HTMLImageElement | null;
  width: number;
  height: number;
}> {
  // SVG → createImageBitmap her tarayıcıda desteklenmez; <img> yolu
  if (
    file.type === "image/svg+xml" ||
    file.name.toLowerCase().endsWith(".svg")
  ) {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("SVG yüklenemedi"));
      el.src = url;
    });
    return {
      bitmap: null,
      img,
      width: img.naturalWidth || 1024,
      height: img.naturalHeight || 1024,
    };
  }

  const bitmap = await createImageBitmap(file);
  return {
    bitmap,
    img: null,
    width: bitmap.width,
    height: bitmap.height,
  };
}

export async function convertToAdminBrandingWebP(
  file: File,
  options?: { maxWidth?: number; quality?: number }
): Promise<Blob> {
  const maxWidth = options?.maxWidth ?? 1024;
  const quality = options?.quality ?? 0.92;

  const { bitmap, img, width, height } = await fileToBitmap(file);
  const scale = Math.min(1, maxWidth / Math.max(1, width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context alınamadı");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } else if (img) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("WebP dönüşümü başarısız"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

/* ---------------- UPLOAD (overwrite + cache-bust) ----------------
   Sabit yola upsert:true ile yazar; başarı durumunda yeni cache-bust
   timestamp'i döner (UI bunu state'te tutup img src'sine yansıtır).
   Hata akışı: upload error → throw; UI catch eder.
---------------------------------------------------------------- */
export type AdminBrandingUploadResult = {
  publicUrl: string;
  cacheBust: number;
};

export async function uploadAdminBranding(
  fileKey: AdminBrandingFileKey,
  file: File,
  options?: { maxWidth?: number; quality?: number }
): Promise<AdminBrandingUploadResult> {
  const validation = validateAdminBrandingFile(file);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const blob = await convertToAdminBrandingWebP(file, options);
  const path = ADMIN_BRANDING_PATHS[fileKey];

  /* FAZ 38: storageProvider.upload delege; contentType + upsert +
     cacheControl aynen. Console tag + throw mesajı route-edge'de. */
  const result = await storageProvider.upload(
    ADMIN_BRANDING_BUCKET,
    path,
    blob,
    {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "3600",
    }
  );

  if (!result.ok) {
    console.error("[admin-branding.upload] FAILED", {
      fileKey,
      path,
      error: result.error,
    });
    throw new Error(result.error || "Yükleme başarısız");
  }

  const cacheBust = Date.now();
  return {
    publicUrl: getAdminBrandingUrl(fileKey, cacheBust),
    cacheBust,
  };
}
