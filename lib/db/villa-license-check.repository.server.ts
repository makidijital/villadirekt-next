import "server-only";

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ VILLA LICENSE CHECK REPOSITORY (Migration 098)
   ===============================================================
   Tablolar: villa_license_check_runs / villa_license_checks /
   villa_license_states. Yalnız "Mülkler → Belge Kontrolü" servisi
   (app/services/villa-license-check.service.ts) kullanır.
   Dönüşler HAM `{ data, error }` (mevcut repository deseni).
=============================================================== */

const RUNS = "villa_license_check_runs";
const CHECKS = "villa_license_checks";
const STATES = "villa_license_states";

export const RUN_COLUMNS =
  "id, status, trigger, started_by_admin_id, created_at, started_at, finished_at, total_documents, processed_documents, valid_count, not_found_count, invalid_count, check_failed_count, abort_reason, lease_owner, lease_until";

const STATE_COLUMNS =
  "villa_id, document_number_normalized, current_status, previous_status, status_changed_at, first_valid_at, last_valid_at, last_checked_at, last_success_at, last_result_status, last_reason_code, consecutive_failures, consecutive_not_found, consecutive_invalid, last_check_id, review_state, review_reason, updated_at";

const INSERT_CHUNK = 500;

export const villaLicenseCheckRepository = {
  /* ---------------- RUNS ---------------- */

  async findActiveFullRun() {
    return await dbAdmin
      .from(RUNS)
      .select(RUN_COLUMNS)
      .eq("trigger", "full")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  async findLatestFinishedFullRun() {
    return await dbAdmin
      .from(RUNS)
      .select(RUN_COLUMNS)
      .eq("trigger", "full")
      .in("status", ["completed", "aborted", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  async findRunById(id: string) {
    return await dbAdmin.from(RUNS).select(RUN_COLUMNS).eq("id", id).maybeSingle();
  },

  /** Unique ihlali (aktif toplu tarama zaten var) → error.code "23505". */
  async insertRun(payload: Record<string, unknown>) {
    return await dbAdmin.from(RUNS).insert(payload).select(RUN_COLUMNS).single();
  },

  async updateRun(id: string, patch: Record<string, unknown>) {
    return await dbAdmin.from(RUNS).update(patch).eq("id", id).select(RUN_COLUMNS);
  },

  /** Atomik kilit: aktif run + (kilit yok VEYA süresi dolmuş). */
  async acquireRunLease(id: string, owner: string, nowIso: string, untilIso: string) {
    return await dbAdmin
      .from(RUNS)
      .update({ lease_owner: owner, lease_until: untilIso })
      .eq("id", id)
      .in("status", ["queued", "running"])
      .or(`lease_until.is.null,lease_until.lt."${nowIso}"`)
      .select(RUN_COLUMNS);
  },

  async releaseRunLease(id: string, owner: string) {
    return await dbAdmin
      .from(RUNS)
      .update({ lease_owner: null, lease_until: null })
      .eq("id", id)
      .eq("lease_owner", owner);
  },

  /* ---------------- CHECKS ---------------- */

  async insertChecks(rows: Array<Record<string, unknown>>) {
    const inserted: Array<Record<string, unknown>> = [];
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { data, error } = await dbAdmin
        .from(CHECKS)
        .insert(rows.slice(i, i + INSERT_CHUNK))
        .select("id, villa_id, document_number_normalized, result_status");
      if (error) return { data: null, error };
      inserted.push(...((data || []) as Array<Record<string, unknown>>));
    }
    return { data: inserted, error: null };
  },

  async findPendingChecks(runId: string, limit: number) {
    return await dbAdmin
      .from(CHECKS)
      .select("id, villa_id, document_number_raw, document_number_normalized")
      .eq("run_id", runId)
      .is("result_status", null)
      .order("document_number_normalized", { ascending: true })
      .limit(limit);
  },

  async updateCheck(id: string, patch: Record<string, unknown>) {
    return await dbAdmin.from(CHECKS).update(patch).eq("id", id);
  },

  async countChecks(runId: string, resultStatus: string | null | "processed") {
    let q = dbAdmin.from(CHECKS).select("id", { count: "exact", head: true }).eq("run_id", runId);
    if (resultStatus === null) q = q.is("result_status", null);
    else if (resultStatus === "processed") q = q.not("result_status", "is", null);
    else q = q.eq("result_status", resultStatus);
    return await q;
  },

  /** Önbellek: aynı belge no için son GÜVENİLİR kontrol (verilen tarihten yeni). */
  async findLatestReliableCheckForDocument(documentNumber: string, sinceIso: string) {
    return await dbAdmin
      .from(CHECKS)
      .select("id, result_status, reason_code, http_status, response_sha256, checked_at")
      .eq("document_number_normalized", documentNumber)
      .in("result_status", ["VALID", "NOT_FOUND", "INVALID"])
      .gte("checked_at", sinceIso)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /* ---------------- STATES ---------------- */

  async findAllStates() {
    return await dbAdmin.from(STATES).select(STATE_COLUMNS);
  },

  async findStatesByVillaIds(villaIds: string[]) {
    return await dbAdmin.from(STATES).select(STATE_COLUMNS).in("villa_id", villaIds);
  },

  async upsertStates(rows: Array<Record<string, unknown>>) {
    return await dbAdmin.from(STATES).upsert(rows, { onConflict: "villa_id" });
  },
};
