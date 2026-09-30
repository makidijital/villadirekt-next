import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { villaZipRepository } from "@/lib/db/villa-zip.repository.server";

/* ===============================================================
   🛡️ /api/admin/villa-zip — ZIP link CREATE + LIST (admin-only)
   ===============================================================
   GET  ?villa_id=<uuid>  → villanın ZIP linkleri (download_count dahil)
   POST { villa_id, duration_hours }  → yeni link (token + expires_at)

   AUTH: authorizeAdminCaller (Bearer + active admin). DB service_role
   (server-only repo). Token: crypto.randomBytes(24) base64url (~192-bit,
   tahmin edilemez, URL-safe).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DURATIONS = [1, 3, 6, 24] as const;

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (villas) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  let villaId = "";
  try {
    villaId = (new URL(req.url).searchParams.get("villa_id") || "").trim();
  } catch {
    /* URL parse hata → boş */
  }
  if (!villaId) {
    return NextResponse.json(
      { ok: false, error: "villa_id gerekli" },
      { status: 400 }
    );
  }

  /* 🛡️ OPPORTUNISTIC PER-VILLA CLEANUP (fire-and-forget) — admin bu
     villanın ZIP modal'ını açtığında same-villa stale satırları DB'den
     fiziksel siler. List filter'ı zaten stale'i GİZLİYOR (043); bu çağrı
     DB-boyut temizliği için. Bloklamaz: hata silinme yok sayılır, list
     yine de döner. AKTİF satır WHERE'e girmez (cleanupStale 043'ten
     beri). villa_id indeksli — sub-ms. */
  villaZipRepository.cleanupStale(villaId).catch(() => {});

  const { data, error } = await villaZipRepository.listByVilla(villaId);
  if (error) {
    console.error("[admin.villa-zip.list] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: "Liste alınamadı" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, links: data || [] });
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (villas) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    villa_id?: unknown;
    duration_hours?: unknown;
  };
  const villaId = (body.villa_id ?? "").toString().trim();
  const durationHours = Number(body.duration_hours);

  if (!villaId) {
    return NextResponse.json(
      { ok: false, error: "villa_id gerekli" },
      { status: 400 }
    );
  }
  if (
    !ALLOWED_DURATIONS.includes(
      durationHours as (typeof ALLOWED_DURATIONS)[number]
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Süre 1, 3, 6 veya 24 saat olmalı" },
      { status: 400 }
    );
  }

  /* 🛡️ OPPORTUNISTIC CLEANUP — yeni link oluşturma aynı zamanda cleanup
     trigger'ı: bu villanın expired/revoked linklerini DB'den fiziksel siler
     (cron/worker yok). Best-effort: hata link oluşturmayı BLOKLAMAZ. */
  try {
    const { error: cleanupErr } = await villaZipRepository.cleanupStale(
      villaId
    );
    if (cleanupErr) {
      console.warn(
        "[admin.villa-zip.cleanup] non-fatal:",
        cleanupErr.message
      );
    }
  } catch (err) {
    console.warn(
      "[admin.villa-zip.cleanup] exception (non-fatal):",
      err instanceof Error ? err.message : err
    );
  }

  /* Güvenli random token — ~192-bit, URL-safe. */
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    Date.now() + durationHours * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await villaZipRepository.create({
    villa_id: villaId,
    token,
    expires_at: expiresAt,
    created_by: auth.caller.id,
  });

  if (error || !data) {
    console.error("[admin.villa-zip.create] FAILED", error?.message);
    return NextResponse.json(
      { ok: false, error: "Link oluşturulamadı" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    link: data,
    /* Public indirme yolu — token URL. Absolute URL'i client
       window.location.origin ile kurar veya kopyalar. */
    download_path: `/api/villa-zip/${token}`,
  });
}
