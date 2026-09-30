import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { mailLogServerRepository } from "@/lib/db/mail-log.repository.server";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ FAZ 54 — MAIL LOGS CLEANUP (admin only, POST)
   ===============================================================
   Destructive endpoint — admin'in iki modu:
     • "30d" → 30 günden eski satırları siler
     • "all" → tüm satırları siler
   Mevcut insertMailLog davranışı ve mail send pipeline'ı dokunulmaz;
   bu endpoint yalnız mail_logs tablosunda DELETE çalıştırır.

   AUTH:
     Bearer <access_token> + admin_users is_active=true.

   TRANSACTION-SAFETY:
     PostgREST tek DELETE statement'ı zaten implicit transaction'da
     koşar; partial failure olursa DB rollback eder. count: "exact"
     ile silinen satır sayısı döner.

   "all" MODE NOTE — neden TRUNCATE değil:
     User isteğinde "TRUNCATE" yazıyor ama eski sağlayıcı-js SDK direkt
     TRUNCATE expose etmiyor (ya RPC ya DDL gerekir). Production-
     safe karşılığı `DELETE FROM mail_logs` (no WHERE). SDK güvenlik
     guard'ı için kapsayıcı filter (`.not("id", "is", null)` — PK
     NOT NULL olduğundan tüm satırları match eder) kullanılır. Net
     etki TRUNCATE ile aynı veri sonucu; transaction-safe + audit
     log'a yansır. AUTO_INCREMENT reset gerekmez (id = uuid).

   RESPONSE:
     { ok: true, mode, deleted: number }
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MODES = ["30d", "all"] as const;
type Mode = (typeof ALLOWED_MODES)[number];

function isMode(v: unknown): v is Mode {
  return typeof v === "string" && (ALLOWED_MODES as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (system_logs) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "system_logs"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  /* Parse body (defansif) */
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz JSON gövdesi" },
      { status: 400 }
    );
  }
  const mode = (body as { mode?: unknown } | null)?.mode;
  if (!isMode(mode)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz mode (beklenen: '30d' veya 'all')" },
      { status: 400 }
    );
  }

  /* Execute mode-specific DELETE */
  let result;
  if (mode === "30d") {
    const cutoff = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    result = await mailLogServerRepository.deleteOlderThan(cutoff);
  } else {
    /* "all" — kapsayıcı filter (PK NOT NULL → tüm satırlar match);
       repo `deleteAll` içindeki resmi eski sağlayıcı-js workaround. */
    result = await mailLogServerRepository.deleteAll();
  }

  if (result.error) {
    console.error("[admin.mail-logs.cleanup] FAILED", {
      mode,
      message: result.error.message,
      details: (result.error as { details?: string }).details,
    });
    return NextResponse.json(
      { ok: false, error: result.error.message },
      { status: 500 }
    );
  }

  /* 🛡️ FAZ 55B — AUDIT LOG (additive, fail-safe)
     Cleanup başarılı olduktan sonra activity log insert. Before
     snapshot yapmıyoruz çünkü bulk delete; tek satır snapshot
     anlamsız (binlerce satır JSONB'ye sığmaz). Bunun yerine
     diff_summary manuel override ile mode + deleted count'u
     human-readable verir. */
  const deleted = result.count ?? 0;
  const ctx = extractAdminContextFromRequest(req, auth.caller);
  await insertAdminActivityLog(ctx, {
    action: "mail_logs.cleaned",
    entity_type: "mail_logs",
    entity_title: "Mail Logs",
    after_data: { mode, deleted },
    diff_summary: [
      `mode: ${mode === "all" ? "tümü" : "30 günden eski"}`,
      `silinen kayıt: ${deleted}`,
    ],
  });

  return NextResponse.json({
    ok: true,
    mode,
    deleted,
  });
}
