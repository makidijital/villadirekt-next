import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { storagePermissionFor } from "@/lib/auth/admin-permission-map";
import { s3StorageProvider } from "@/lib/storage/s3-storage.provider";
import { STORAGE_BUCKETS } from "@/lib/storage/storage.constants";
import { invalidateSiteAssetVersions } from "@/lib/storage/site-asset-version.server";

/* ===============================================================
   🛡️ FAZ C / ADIM 1 — POST /api/admin/storage/upload (ALTYAPI)
   ===============================================================
   AMAÇ:
     Server-side R2 (S3) upload kapısı. Browser, WebP'ye çevirdiği
     blob'u multipart/form-data ile buraya gönderir; route
     `authorizeAdminCaller` (Bearer admin) ile yetkilendirip S3'e
     yazar. Secret server'da kalır.

   ⚠️ ADIM 1 — DORMANT:
     Bu route'a HENÜZ HİÇBİR ekran/akış bağlı DEĞİL. Eklenmesi yalnız
     altyapı; mevcut upload akışları AYNEN R2 storage'a gider.
     Bağlama (seam switch + dual-write) sonraki adımda yapılacak.
     Bu route çağrılmadığı sürece davranış değişmez.

   GÜVENLİK:
     - authorizeAdminCaller: Authorization: Bearer <admin access_token>.
     - bucket allow-list: yalnız villa-images | site-assets.
     - S3 secret server-only (s3StorageProvider).

   REQUEST (multipart/form-data):
     file        : Blob (zorunlu) — zaten WebP'ye çevrilmiş
     bucket      : "villa-images" | "site-assets" (zorunlu)
     path        : bucket-relative hedef path (zorunlu)
     contentType : opsiyonel (örn. "image/webp")
     cacheControl: opsiyonel (örn. "3600")
     upsert      : opsiyonel ("true"/"false") — bkz. s3 provider notu

   RESPONSE:
     200 { ok: true }
     4xx { ok: false, error }
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS: string[] = [
  STORAGE_BUCKETS.VILLA_IMAGES,
  STORAGE_BUCKETS.SITE_ASSETS,
];

export async function POST(req: Request): Promise<Response> {
  /* 1) ADMIN AUTH */
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 2) PARSE multipart/form-data */
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz form-data" },
      { status: 400 }
    );
  }

  const fileEntry = form.get("file");
  const bucket = String(form.get("bucket") || "").trim();
  const path = String(form.get("path") || "").trim();
  const contentType = form.get("contentType")
    ? String(form.get("contentType"))
    : undefined;
  const cacheControl = form.get("cacheControl")
    ? String(form.get("cacheControl"))
    : undefined;
  const upsert = String(form.get("upsert") || "") === "true";

  /* 3) VALIDATION */
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json(
      { ok: false, error: "file alanı zorunlu (Blob)" },
      { status: 400 }
    );
  }
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz bucket" },
      { status: 400 }
    );
  }
  if (!path) {
    return NextResponse.json(
      { ok: false, error: "path alanı zorunlu" },
      { status: 400 }
    );
  }

  /* 🛡️ Admin yetki — bucket + yol öneki → mevcut izin anahtarı
     (lib/auth/admin-permission-map.ts > storagePermissionFor; önekler
     mevcut upload çağrılarından). TÜM yollar için izin gerekir; biri
     bile izinsizse 403 ve R2'ye hiçbir yazma yapılmaz. */
  const needs = new Map(
    [path].map((p) => {
      const need = storagePermissionFor(bucket, p);
      return [JSON.stringify(need), need] as const;
    })
  );
  for (const need of needs.values()) {
    if (!need || !(await callerHasPermission(auth.caller.id, need))) {
      return NextResponse.json(
        { ok: false, error: FORBIDDEN_MESSAGE },
        { status: 403 }
      );
    }
  }

  /* 4) S3 UPLOAD (R2) */
  const blob = fileEntry as Blob;
  const arrayBuffer = await blob.arrayBuffer();
  const result = await s3StorageProvider.upload(
    bucket,
    path,
    new Uint8Array(arrayBuffer),
    {
      contentType: contentType || blob.type || undefined,
      cacheControl,
      upsert,
    }
  );

  if (!result.ok) {
    console.error("[api.admin.storage.upload] FAILED", {
      bucket,
      path,
      error: result.error,
    });
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 502 }
    );
  }

  /* 🛡️ Görsel URL versiyonu (`?v=`): aynı path'e overwrite edildi →
     bu path'in versiyon cache'i geçersiz; sonraki render yeni ETag'i
     okur. Yanıt formatı DEĞİŞMEDİ. */
  invalidateSiteAssetVersions(bucket, [path]);

  return NextResponse.json({ ok: true });
}
