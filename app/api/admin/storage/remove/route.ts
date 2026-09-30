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
   🛡️ FAZ C / ADIM 1 — POST /api/admin/storage/remove (ALTYAPI)
   ===============================================================
   AMAÇ:
     Server-side R2 (S3) bulk remove kapısı. `authorizeAdminCaller`
     ile yetkilendirir; s3StorageProvider.remove (retry + idempotent)
     ile siler.

   ⚠️ ADIM 1 — DORMANT:
     HENÜZ HİÇBİR akış bağlı DEĞİL. Mevcut delete akışları (deleteVillaImage,
     hardDeleteVilla, AdminGallery rollback) AYNEN R2 storage'tan
     siler. Bağlama sonraki adımda.

   REQUEST (application/json):
     { bucket: "villa-images" | "site-assets", paths: string[] }

   RESPONSE:
     200 { ok, failed, attempts }   (idempotent; eksik key success)
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

  /* 2) PARSE JSON */
  let body: { bucket?: unknown; paths?: unknown };
  try {
    body = (await req.json()) as { bucket?: unknown; paths?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz JSON" },
      { status: 400 }
    );
  }

  const bucket = String(body.bucket || "").trim();
  const paths = Array.isArray(body.paths)
    ? body.paths.filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0
      )
    : [];

  /* 3) VALIDATION */
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz bucket" },
      { status: 400 }
    );
  }

  /* 🛡️ Admin yetki — bucket + yol öneki → mevcut izin anahtarı
     (lib/auth/admin-permission-map.ts > storagePermissionFor; önekler
     mevcut upload çağrılarından). TÜM yollar için izin gerekir; biri
     bile izinsizse 403 ve R2'ye hiçbir silme yapılmaz. */
  const needs = new Map(
    paths.map((p) => {
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

  if (paths.length === 0) {
    /* İdempotent: silinecek bir şey yok → success. */
    return NextResponse.json({ ok: true, failed: [], attempts: 0 });
  }

  /* 4) S3 REMOVE (R2) */
  const result = await s3StorageProvider.remove(bucket, paths);
  /* 🛡️ Görsel URL versiyonu — silinen path'lerin versiyon cache'i
     geçersiz (aynı path'e yeniden yüklemede eski `?v=` kalmasın). */
  invalidateSiteAssetVersions(bucket, paths);
  if (!result.ok) {
    console.warn("[api.admin.storage.remove] PARTIAL_FAIL", {
      bucket,
      failed: result.failed,
      attempts: result.attempts,
    });
  }
  return NextResponse.json(result);
}
