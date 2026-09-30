import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  syncExternalCalendarSource,
  type SyncSourceResult,
} from "@/app/services/external-calendar.service";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";

/* ===============================================================
   🛡️ FAZ 56B — ADMIN ICAL SYNC ENDPOINT
   ===============================================================
   POST /api/admin/external-calendars/sync
   BODY: { source_id: string }
   AUTH: authorizeAdminCaller (Bearer JWT + admin_users.is_active)

   FLOW:
     1. Admin doğrula
     2. body.source_id parse
     3. syncExternalCalendarSource(source_id) — service-role pipeline
     4. Activity log (success veya fail)
     5. JSON response

   RESPONSE shapes:
     200 { ok:true, imported, deactivated, skipped, totalSeen,
           source_name, villa_id }
     200/4xx/5xx (içeride graceful):
       { ok:false, error, stage }

   ⚠️ Bu endpoint reservation tablosuna ASLA insert etmez. Mail/payment/
   status pipeline hiç tetiklenmez. Yalnız external_calendar_events
   tablosuna upsert + meta update yapar. FAZ 56C'ye kadar availability
   sonucu hiç değişmez (helper hâlâ external tabloyu okumuyor).
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (external_calendars) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "external_calendars"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz JSON gövdesi" },
      { status: 400 }
    );
  }
  const sourceId = (body as { source_id?: unknown } | null)?.source_id;
  if (typeof sourceId !== "string" || sourceId.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "source_id gerekli (string)" },
      { status: 400 }
    );
  }

  const result: SyncSourceResult = await syncExternalCalendarSource(
    sourceId.trim()
  );

  /* Activity log — başarılı veya başarısız, fail-safe */
  const ctx = extractAdminContextFromRequest(req, auth.caller);
  if (result.ok) {
    /* Villa title için lookup (audit için "Airbnb · Villa Adı" entity_title). */
    let villaTitle: string | null = null;
    try {
      const { data } = await villaAdminRepository.findTitleById(
        result.villaId
      );
      villaTitle =
        data && typeof (data as { title?: string | null }).title === "string"
          ? (data as { title: string }).title
          : null;
    } catch {
      /* lookup hatası logger'a etki etmez. */
    }
    await insertAdminActivityLog(ctx, {
      action: "external_calendar.synced",
      entity_type: "external_calendar",
      entity_id: result.sourceId,
      entity_title:
        result.sourceName + (villaTitle ? " · " + villaTitle : ""),
      after_data: {
        source_name: result.sourceName,
        villa_id: result.villaId,
        imported: result.imported,
        deactivated: result.deactivated,
        skipped: result.skipped,
        total_seen: result.totalSeen,
      },
      diff_summary: [
        `imported: ${result.imported}`,
        `deactivated: ${result.deactivated}`,
        `skipped: ${result.skipped}`,
        `total seen: ${result.totalSeen}`,
      ],
    });
    return NextResponse.json({
      ok: true,
      source_id: result.sourceId,
      source_name: result.sourceName,
      villa_id: result.villaId,
      imported: result.imported,
      deactivated: result.deactivated,
      skipped: result.skipped,
      total_seen: result.totalSeen,
    });
  }

  /* Failure path — activity log + 502 (upstream fetch/parse failures)
     veya 500 (genel). */
  await insertAdminActivityLog(ctx, {
    action: "external_calendar.sync_failed",
    entity_type: "external_calendar",
    entity_id: result.sourceId,
    entity_title: result.sourceName || result.sourceId,
    after_data: {
      villa_id: result.villaId,
      source_name: result.sourceName,
      stage: result.stage,
      error: result.error,
    },
    diff_summary: [`stage: ${result.stage}`, `error: ${result.error}`],
  });

  const status =
    result.stage === "fetch" || result.stage === "parse" ? 502 : 500;
  return NextResponse.json(
    {
      ok: false,
      source_id: result.sourceId,
      source_name: result.sourceName,
      villa_id: result.villaId,
      error: result.error,
      stage: result.stage,
    },
    { status }
  );
}
