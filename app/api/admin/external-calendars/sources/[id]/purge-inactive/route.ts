import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { externalCalendarSourceServerRepository } from "@/lib/db/external-calendar-source.repository.server";
import { externalCalendarEventServerRepository } from "@/lib/db/external-calendar-event.repository.server";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ FAZ 56G+ — SOURCE-SCOPED INACTIVE EVENT PURGE (hard delete)
   ===============================================================
   POST /api/admin/external-calendars/sources/[id]/purge-inactive
   AUTH: authorizeAdminCaller (Bearer JWT + admin_users.is_active)

   KURAL — HARD DELETE YALNIZ ŞU İKİ KOŞULDA:
     1) external_calendar_sources.id = :id  AND  is_active = false
     2) external_calendar_events.source_id = :id  AND  is_active = false
   Aktif kaynak ve aktif event'lere ASLA dokunulmaz.

   NEDEN:
     • Aktif source = external provider source-of-truth → sync geri
       getirir; hard delete anlamsız + manuel override flag'i kaybeder.
     • Pasif source = frozen state; sync hattı kapalı; depoda biriken
       inactive event'ler artık audit için bile gerekli değil.

   FLOW:
     1) Admin doğrula
     2) Source'u fetch et — is_active=false verify (guard)
     3) DELETE FROM external_calendar_events
        WHERE source_id = $1 AND is_active = false
        RETURNING id  → deleted_count
     4) Activity log: external_calendar_events.purged
     5) JSON { ok, source_id, deleted_count }

   ⚠️ DOKUNULMAYAN:
     • Sync pipeline (external-calendar.service syncExternalCalendarSource)
     • Reservation flow, overlap trigger (mig 031), EXCLUDE constraints
     • Calendar engine, BookingSidebar, AvailabilityInlineCalendar
     • SSRF helper, manually_deactivated logic (event-level deactivate)
     • RLS policies — service-role bypass, policy gevşetilmedi

   IDEMPOTENT:
     0 inactive event varsa 0 döner, success. Source zaten silinmişse
     veya başka admin tarafından önce purge edilmişse no-op.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const sourceId = (id || "").toString().trim();
  if (!sourceId) {
    return NextResponse.json(
      { ok: false, error: "source id gerekli" },
      { status: 400 }
    );
  }

  /* SOURCE VERIFY — yalnız pasif kaynak için purge. */
  const { data: sourceRow, error: sourceErr } =
    await externalCalendarSourceServerRepository.findPurgeGuardById(sourceId);

  if (sourceErr) {
    console.error(
      "[admin.external_events.purge] SOURCE FETCH FAILED",
      sourceErr.message
    );
    return NextResponse.json(
      { ok: false, error: `Kaynak okunamadı: ${sourceErr.message}` },
      { status: 500 }
    );
  }
  if (!sourceRow) {
    return NextResponse.json(
      { ok: false, error: "Kaynak bulunamadı" },
      { status: 404 }
    );
  }

  type SourceRow = {
    id: string;
    source_name: string;
    is_active: boolean | null;
    villa_id: string;
  };
  const src = (sourceRow as unknown) as SourceRow;

  if (src.is_active !== false) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Aktif kaynakların eventleri temizlenemez. Önce kaynağı pasifleştirin.",
      },
      { status: 409 }
    );
  }

  /* DELETE — yalnız inactive event'ler. Returning id → deleted_count. */
  const { data: deletedRows, error: delErr } =
    await externalCalendarEventServerRepository.deleteInactiveBySource(
      sourceId
    );

  if (delErr) {
    console.error(
      "[admin.external_events.purge] DELETE FAILED",
      delErr.message
    );
    return NextResponse.json(
      { ok: false, error: `Silme başarısız: ${delErr.message}` },
      { status: 500 }
    );
  }

  const deletedCount = Array.isArray(deletedRows) ? deletedRows.length : 0;

  /* Activity log — fail-safe. */
  try {
    const ctx = extractAdminContextFromRequest(req, auth.caller);
    await insertAdminActivityLog(ctx, {
      action: "external_calendar_events.purged",
      entity_type: "external_calendar",
      entity_id: src.id,
      entity_title: `${src.source_name} · ${deletedCount} pasif event temizlendi`,
      after_data: {
        source_id: src.id,
        source_name: src.source_name,
        villa_id: src.villa_id,
        deleted_count: deletedCount,
      },
      diff_summary: [`deleted_count: ${deletedCount}`],
    });
  } catch (logErr) {
    console.warn(
      "[admin.external_events.purge] activity log WARN",
      logErr instanceof Error ? logErr.message : "unknown"
    );
  }

  return NextResponse.json({
    ok: true,
    source_id: src.id,
    source_name: src.source_name,
    deleted_count: deletedCount,
  });
}
