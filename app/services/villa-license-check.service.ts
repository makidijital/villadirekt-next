import "server-only";

import { randomUUID } from "node:crypto";

import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { villaLicenseCheckRepository as repo } from "@/lib/db/villa-license-check.repository.server";
import {
  KTB_PARSER_VERIFIED,
  parseKtbLicensePage,
  type KtbParseResult,
} from "@/lib/ktb/ktb-license.parser";
import {
  fetchKtbLicensePage,
  type KtbFetchOutcome,
} from "@/lib/ktb/ktb-license.client.server";
import {
  ktbLicenseLinkFor,
  normalizeKtbDocumentNumber,
} from "@/lib/ktb/ktb-document-number";
import {
  applyLicenseCheck,
  type LicenseCheckResult,
  type LicenseStateRow,
} from "@/lib/ktb/license-state";

/* ===============================================================
   🛡️ VILLA KTB BELGE KONTROLÜ — SERVİS (Mülkler → Belge Kontrolü)
   ===============================================================
   AKIŞ (cron YOK — admin ekranı açıkken ilerler):
     1) startFullLicenseScan  → run + her aktif villa için bekleyen
        kontrol satırı. Format dışı numara → anında CHECK_FAILED
        (unsupported_format); KTB'ye istek GİTMEZ.
     2) processLicenseScanTick → run kilidini (lease) alır; zaman
        bütçesi içinde bekleyen BENZERSİZ belge numaralarını TEK TEK
        (concurrency 1, aralarda gecikme) sorgular; sonuç aynı numaralı
        tüm villalara yazılır. Kilit alınamazsa (başka sekme/istek
        işliyor) hemen döner.
     3) Tüm satırlar bitince run "completed". 403/429/CAPTCHA veya art
        arda yapı hatasında run "aborted" — kalan satırlar bekler,
        hiçbir villa geçersiz/bulunamadı SAYILMAZ.
     4) recheckVillaLicense → tek villa, önbelleksiz.

   KESİN KURALLAR:
     • CHECK_FAILED son güvenilir durumu değiştirmez (license-state).
     • Parser doğrulanmadan (KTB_PARSER_VERIFIED=false) KTB'ye istek
       gönderilmez; tarama/tek kontrol "parser_unverified" ile reddedilir.
     • Otomatik pasife alma YOK.
=============================================================== */

export type LicenseCheckDeps = {
  fetchPage: (normalized: string) => Promise<KtbFetchOutcome>;
  parse: (html: string, normalized: string) => KtbParseResult;
  parserVerified: boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
  /** Bir tick'in KTB'ye istek başlatabileceği süre (ms). */
  tickBudgetMs: number;
  /** Ardışık KTB istekleri arası temel gecikme (ms, + ≤%25 jitter). */
  requestDelayMs: number;
  /** Ağ/5xx retry bekleme süreleri (ms); uzunluğu = en fazla retry. */
  retryBackoffMs: number[];
  leaseMs: number;
  /** Art arda bu kadar yapısal hata → run durdurulur. */
  structuralAbortThreshold: number;
};

export const defaultLicenseCheckDeps: LicenseCheckDeps = {
  fetchPage: (n) => fetchKtbLicensePage(n),
  parse: parseKtbLicensePage,
  parserVerified: KTB_PARSER_VERIFIED,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  random: Math.random,
  tickBudgetMs: 20_000,
  requestDelayMs: 1_200,
  retryBackoffMs: [2_000, 5_000],
  leaseMs: 60_000,
  structuralAbortThreshold: 3,
};

/** Toplu taramada önbellek (aynı numara bu süreden yeni kontrol edildiyse
 *  tekrar sorgulanmaz). Tek villa kontrolü önbelleği KULLANMAZ. */
export const LICENSE_CACHE_TTL_MS: Record<"VALID" | "NOT_FOUND" | "INVALID", number> = {
  VALID: 7 * 24 * 3600_000,
  NOT_FOUND: 24 * 3600_000,
  INVALID: 24 * 3600_000,
};

const PENDING_BATCH = 300;

export const PARSER_UNVERIFIED_MESSAGE =
  "KTB ayrıştırıcısı henüz gerçek KTB HTML örnekleriyle doğrulanmadı. Doğrulanana kadar KTB'ye sorgu gönderilmez.";

type Deps = Partial<LicenseCheckDeps>;
const withDeps = (d?: Deps): LicenseCheckDeps => ({ ...defaultLicenseCheckDeps, ...(d || {}) });

export type LicenseRun = {
  id: string;
  status: "queued" | "running" | "completed" | "aborted" | "failed";
  trigger: "full" | "single";
  started_by_admin_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  total_documents: number;
  processed_documents: number;
  valid_count: number;
  not_found_count: number;
  invalid_count: number;
  check_failed_count: number;
  abort_reason: string | null;
  lease_owner: string | null;
  lease_until: string | null;
};

type PendingRow = {
  id: string;
  villa_id: string;
  document_number_raw: string;
  document_number_normalized: string | null;
};

type DocumentOutcome = {
  result: LicenseCheckResult;
  reason: string | null;
  httpStatus: number | null;
  attempts: number;
  sha256: string | null;
  stopRun?: boolean;
  structural?: boolean;
};

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function dbError(error: { message?: string } | null | undefined, ctx: string): never {
  throw new Error(`[villa-license] ${ctx}: ${error?.message || "DB hatası"}`);
}

/* ---------------------------------------------------------------
   Tek belge numarası için KTB sorgusu (+ sınırlı retry) + ayrıştırma
   --------------------------------------------------------------- */
/** Retry zaman bütçesine sığmadıysa ve `allowDefer` ise satırlar
 *  BEKLEMEDE bırakılır; belge bir sonraki tick'te tam retry hakkıyla
 *  baştan denenir (yarım retry yüzünden erken CHECK_FAILED yazılmaz). */
type CheckOutcome = DocumentOutcome | { deferred: true };

async function checkDocument(
  normalized: string,
  deps: LicenseCheckDeps,
  deadline: number,
  allowDefer = false
): Promise<CheckOutcome> {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    const fetched = await deps.fetchPage(normalized);
    if (!fetched.ok) {
      const backoff = deps.retryBackoffMs[attempts - 1];
      if (fetched.retryable && backoff !== undefined) {
        if (deps.now() + backoff < deadline) {
          await deps.sleep(backoff);
          continue;
        }
        if (allowDefer) return { deferred: true };
      }
      return {
        result: "CHECK_FAILED",
        reason: fetched.reason,
        httpStatus: fetched.httpStatus,
        attempts,
        sha256: null,
        stopRun: fetched.stopRun,
        structural: fetched.structural,
      };
    }
    const parsed = deps.parse(fetched.body, normalized);
    return {
      result: parsed.status,
      reason: parsed.reason,
      httpStatus: fetched.httpStatus,
      attempts,
      sha256: fetched.sha256,
      stopRun: parsed.stopRun,
      structural: parsed.structural,
    };
  }
}

/* ---------------------------------------------------------------
   Sonucu kontrol satırlarına + villa durumlarına yaz
   --------------------------------------------------------------- */
async function recordOutcome(rows: PendingRow[], outcome: DocumentOutcome, nowIso: string) {
  if (rows.length === 0) return;
  const { data: states, error } = await repo.findStatesByVillaIds(rows.map((r) => r.villa_id));
  if (error) dbError(error, "states read");
  const byVilla = new Map<string, LicenseStateRow>();
  for (const s of (states || []) as unknown as LicenseStateRow[]) byVilla.set(s.villa_id, s);

  const upserts: LicenseStateRow[] = [];
  for (const row of rows) {
    const { next, previousReliable } = applyLicenseCheck(byVilla.get(row.villa_id) ?? null, {
      villaId: row.villa_id,
      documentNumber: row.document_number_normalized,
      result: outcome.result,
      reasonCode: outcome.reason,
      checkId: row.id,
      checkedAt: nowIso,
    });
    const upd = await repo.updateCheck(row.id, {
      result_status: outcome.result,
      reason_code: outcome.reason,
      http_status: outcome.httpStatus,
      attempt_count: outcome.attempts,
      previous_status: previousReliable,
      response_sha256: outcome.sha256,
      claimed_at: nowIso,
      checked_at: nowIso,
    });
    if (upd.error) dbError(upd.error, "check update");
    upserts.push(next);
  }
  const up = await repo.upsertStates(upserts as unknown as Array<Record<string, unknown>>);
  if (up.error) dbError(up.error, "states upsert");
}

async function refreshRunCounters(runId: string): Promise<Partial<LicenseRun>> {
  const [processed, valid, notFound, invalid, failed] = await Promise.all([
    repo.countChecks(runId, "processed"),
    repo.countChecks(runId, "VALID"),
    repo.countChecks(runId, "NOT_FOUND"),
    repo.countChecks(runId, "INVALID"),
    repo.countChecks(runId, "CHECK_FAILED"),
  ]);
  for (const r of [processed, valid, notFound, invalid, failed]) if (r.error) dbError(r.error, "count");
  return {
    processed_documents: processed.count ?? 0,
    valid_count: valid.count ?? 0,
    not_found_count: notFound.count ?? 0,
    invalid_count: invalid.count ?? 0,
    check_failed_count: failed.count ?? 0,
  };
}

async function updateRunOrThrow(id: string, patch: Record<string, unknown>): Promise<LicenseRun> {
  const { data, error } = await repo.updateRun(id, patch);
  if (error) dbError(error, "run update");
  return ((data || [])[0] ?? null) as unknown as LicenseRun;
}

/* ===============================================================
   PUBLIC API
=============================================================== */

export type StartScanResult =
  | { ok: true; run: LicenseRun; alreadyRunning: boolean }
  | { ok: false; code: "parser_unverified" | "error"; error: string };

export async function startFullLicenseScan(
  adminId: string | null,
  d?: Deps
): Promise<StartScanResult> {
  const deps = withDeps(d);
  if (!deps.parserVerified) {
    return { ok: false, code: "parser_unverified", error: PARSER_UNVERIFIED_MESSAGE };
  }

  const active = await repo.findActiveFullRun();
  if (active.error) return { ok: false, code: "error", error: active.error.message };
  if (active.data) return { ok: true, run: active.data as unknown as LicenseRun, alreadyRunning: true };

  const villasRes = await villaAdminRepository.findLicenseCheckCandidates();
  if (villasRes.error) return { ok: false, code: "error", error: villasRes.error.message };
  const villas = (villasRes.data || []) as Array<{ id: string; tourism_document_number: string | null }>;

  const nowIso = iso(deps.now());
  const checkRows = villas
    .map((v) => {
      const raw = String(v.tourism_document_number ?? "").trim();
      if (!raw) return null;
      const n = normalizeKtbDocumentNumber(raw);
      return {
        run_id: "",
        villa_id: v.id,
        document_number_raw: raw.slice(0, 200),
        document_number_normalized: n.ok ? n.value : null,
        result_status: n.ok ? null : "CHECK_FAILED",
        reason_code: n.ok ? null : "unsupported_format",
        claimed_at: n.ok ? null : nowIso,
        checked_at: n.ok ? null : nowIso,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const runRes = await repo.insertRun({
    status: "queued",
    trigger: "full",
    started_by_admin_id: adminId,
    total_documents: checkRows.length,
  });
  if (runRes.error) {
    if ((runRes.error as { code?: string }).code === "23505") {
      /* Aynı anda başka bir admin başlattı → onun taramasını döndür. */
      const again = await repo.findActiveFullRun();
      if (again.data) return { ok: true, run: again.data as unknown as LicenseRun, alreadyRunning: true };
    }
    return { ok: false, code: "error", error: runRes.error.message };
  }
  const run = runRes.data as unknown as LicenseRun;

  try {
    const inserted = await repo.insertChecks(checkRows.map((r) => ({ ...r, run_id: run.id })));
    if (inserted.error) dbError(inserted.error, "checks insert");
    const unsupported = ((inserted.data || []) as unknown as Array<PendingRow & { result_status: string | null }>)
      .filter((r) => r.result_status === "CHECK_FAILED");
    if (unsupported.length > 0) {
      /* Satır zaten CHECK_FAILED yazıldı; yalnız villa durumu güncellenir. */
      const { data: states, error } = await repo.findStatesByVillaIds(unsupported.map((r) => r.villa_id));
      if (error) dbError(error, "states read");
      const byVilla = new Map<string, LicenseStateRow>();
      for (const s of (states || []) as unknown as LicenseStateRow[]) byVilla.set(s.villa_id, s);
      const upserts = unsupported.map(
        (r) =>
          applyLicenseCheck(byVilla.get(r.villa_id) ?? null, {
            villaId: r.villa_id,
            documentNumber: null,
            result: "CHECK_FAILED",
            reasonCode: "unsupported_format",
            checkId: r.id,
            checkedAt: nowIso,
          }).next
      );
      const up = await repo.upsertStates(upserts as unknown as Array<Record<string, unknown>>);
      if (up.error) dbError(up.error, "states upsert");
    }
    const counters = await refreshRunCounters(run.id);
    const pendingLeft = checkRows.length - (counters.processed_documents ?? 0);
    const updated = await updateRunOrThrow(run.id, {
      ...counters,
      ...(pendingLeft <= 0
        ? { status: "completed", started_at: nowIso, finished_at: nowIso }
        : {}),
    });
    return { ok: true, run: updated ?? run, alreadyRunning: false };
  } catch (err) {
    await repo.updateRun(run.id, { status: "failed", finished_at: nowIso, abort_reason: "setup_failed" });
    return { ok: false, code: "error", error: err instanceof Error ? err.message : "Tarama oluşturulamadı" };
  }
}

export type TickResult =
  | { ok: true; run: LicenseRun; busy: boolean; processedDocuments: number }
  | { ok: false; code: "not_found" | "parser_unverified" | "error"; error: string };

export async function processLicenseScanTick(runId: string, d?: Deps): Promise<TickResult> {
  const deps = withDeps(d);
  if (!deps.parserVerified) {
    return { ok: false, code: "parser_unverified", error: PARSER_UNVERIFIED_MESSAGE };
  }
  const existing = await repo.findRunById(runId);
  if (existing.error) return { ok: false, code: "error", error: existing.error.message };
  if (!existing.data) return { ok: false, code: "not_found", error: "Tarama bulunamadı" };
  const current = existing.data as unknown as LicenseRun;
  if (current.status !== "queued" && current.status !== "running") {
    return { ok: true, run: current, busy: false, processedDocuments: 0 };
  }

  const owner = randomUUID();
  const startMs = deps.now();
  const lease = await repo.acquireRunLease(runId, owner, iso(startMs), iso(startMs + deps.leaseMs));
  if (lease.error) return { ok: false, code: "error", error: lease.error.message };
  if (!lease.data || lease.data.length === 0) {
    return { ok: true, run: current, busy: true, processedDocuments: 0 };
  }

  const deadline = startMs + deps.tickBudgetMs;
  let processedDocuments = 0;
  let structuralStreak = 0;
  let abortReason: string | null = null;
  let completed = false;

  try {
    if (current.status === "queued" || !current.started_at) {
      await updateRunOrThrow(runId, { status: "running", started_at: current.started_at ?? iso(startMs) });
    }

    let needsDelay = false;
    outer: while (deps.now() < deadline) {
      const pending = await repo.findPendingChecks(runId, PENDING_BATCH);
      if (pending.error) dbError(pending.error, "pending read");
      const rows = (pending.data || []) as unknown as PendingRow[];
      if (rows.length === 0) {
        completed = true;
        break;
      }
      /* Benzersiz belge numarası grupları (aynı numara → tek sorgu). */
      const groups = new Map<string, PendingRow[]>();
      for (const r of rows) {
        const key = r.document_number_normalized ?? "";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      }

      for (const [doc, groupRows] of groups) {
        if (deps.now() >= deadline) break outer;
        const nowIso = iso(deps.now());

        if (!doc) {
          /* Güvenlik ağı: normalize edilememiş bekleyen satır. */
          await recordOutcome(groupRows, { result: "CHECK_FAILED", reason: "unsupported_format", httpStatus: null, attempts: 0, sha256: null }, nowIso);
          continue;
        }

        /* Önbellek — yakın zamanda güvenilir sonuç alınmış numara. */
        const cached = await repo.findLatestReliableCheckForDocument(doc, iso(deps.now() - LICENSE_CACHE_TTL_MS.VALID));
        if (cached.error) dbError(cached.error, "cache read");
        const c = cached.data as { id: string; result_status: "VALID" | "NOT_FOUND" | "INVALID"; http_status: number | null; response_sha256: string | null; checked_at: string } | null;
        if (c && deps.now() - Date.parse(c.checked_at) < LICENSE_CACHE_TTL_MS[c.result_status]) {
          await recordOutcome(groupRows, {
            result: c.result_status,
            reason: "reused_recent_result",
            httpStatus: c.http_status,
            attempts: 0,
            sha256: c.response_sha256,
          }, nowIso);
          processedDocuments += 1;
          continue;
        }

        if (needsDelay) {
          const delay = deps.requestDelayMs + Math.floor(deps.random() * deps.requestDelayMs * 0.25);
          if (deps.now() + delay >= deadline) break outer;
          await deps.sleep(delay);
        }
        const checked = await checkDocument(doc, deps, deadline, processedDocuments > 0);
        needsDelay = true;
        if ("deferred" in checked) break outer;
        const outcome = checked;
        await recordOutcome(groupRows, outcome, iso(deps.now()));
        processedDocuments += 1;

        if (outcome.stopRun) {
          abortReason = outcome.reason || "blocked";
          break outer;
        }
        structuralStreak = outcome.structural ? structuralStreak + 1 : 0;
        if (structuralStreak >= deps.structuralAbortThreshold) {
          abortReason = "html_changed";
          break outer;
        }
      }
    }

    const counters = await refreshRunCounters(runId);
    const endIso = iso(deps.now());
    const finalPatch: Record<string, unknown> = { ...counters, lease_owner: null, lease_until: null };
    if (abortReason) {
      Object.assign(finalPatch, { status: "aborted", abort_reason: abortReason, finished_at: endIso });
    } else if (completed || (counters.processed_documents ?? 0) >= current.total_documents) {
      Object.assign(finalPatch, { status: "completed", finished_at: endIso });
    }
    const run = await updateRunOrThrow(runId, finalPatch);
    return { ok: true, run: run ?? current, busy: false, processedDocuments };
  } catch (err) {
    await repo.releaseRunLease(runId, owner);
    console.error("[villa-license.tick] FAILED", { runId, error: err instanceof Error ? err.message : err });
    return { ok: false, code: "error", error: err instanceof Error ? err.message : "Tarama adımı başarısız" };
  }
}

export type RecheckResult =
  | { ok: true; result: LicenseCheckResult; reason: string | null }
  | { ok: false; code: "not_found" | "no_document" | "parser_unverified" | "error"; error: string };

export async function recheckVillaLicense(
  villaId: string,
  adminId: string | null,
  d?: Deps
): Promise<RecheckResult> {
  const deps = withDeps(d);
  if (!deps.parserVerified) {
    return { ok: false, code: "parser_unverified", error: PARSER_UNVERIFIED_MESSAGE };
  }
  const villaRes = await villaAdminRepository.findLicenseCheckCandidateById(villaId);
  if (villaRes.error) return { ok: false, code: "error", error: villaRes.error.message };
  const villa = villaRes.data as { id: string; tourism_document_number: string | null } | null;
  if (!villa) return { ok: false, code: "not_found", error: "Villa bulunamadı" };
  const raw = String(villa.tourism_document_number ?? "").trim();
  if (!raw) return { ok: false, code: "no_document", error: "Villada belge numarası yok" };

  const n = normalizeKtbDocumentNumber(raw);
  const startMs = deps.now();
  const nowIso = iso(startMs);
  const runRes = await repo.insertRun({
    status: "running",
    trigger: "single",
    started_by_admin_id: adminId,
    started_at: nowIso,
    total_documents: 1,
  });
  if (runRes.error) return { ok: false, code: "error", error: runRes.error.message };
  const run = runRes.data as unknown as LicenseRun;

  try {
    const inserted = await repo.insertChecks([{
      run_id: run.id,
      villa_id: villa.id,
      document_number_raw: raw.slice(0, 200),
      document_number_normalized: n.ok ? n.value : null,
    }]);
    if (inserted.error) dbError(inserted.error, "check insert");
    const row = ((inserted.data || [])[0] ?? null) as unknown as PendingRow | null;
    if (!row) throw new Error("Kontrol satırı oluşturulamadı");
    const pendingRow: PendingRow = { ...row, document_number_raw: raw };

    const outcome = n.ok
      ? ((await checkDocument(n.value, deps, startMs + deps.tickBudgetMs)) as DocumentOutcome)
      : ({ result: "CHECK_FAILED", reason: "unsupported_format", httpStatus: null, attempts: 0, sha256: null } as DocumentOutcome);
    await recordOutcome([pendingRow], outcome, iso(deps.now()));
    const counters = await refreshRunCounters(run.id);
    await updateRunOrThrow(run.id, {
      ...counters,
      status: outcome.stopRun ? "aborted" : "completed",
      abort_reason: outcome.stopRun ? outcome.reason : null,
      finished_at: iso(deps.now()),
    });
    return { ok: true, result: outcome.result, reason: outcome.reason };
  } catch (err) {
    await repo.updateRun(run.id, { status: "failed", finished_at: iso(deps.now()) });
    return { ok: false, code: "error", error: err instanceof Error ? err.message : "Kontrol başarısız" };
  }
}

/* ===============================================================
   ÖZET + LİSTE (admin ekranı)
=============================================================== */

export type LicenseBucket =
  | "valid"
  | "invalid"
  | "not_found"
  | "check_failed"
  | "no_document"
  | "unchecked";

export type LicenseOverviewRow = {
  villaId: string;
  title: string;
  documentNumber: string | null;
  ktbUrl: string | null;
  bucket: LicenseBucket;
  currentStatus: LicenseStateRow["current_status"];
  previousStatus: LicenseStateRow["previous_status"];
  statusChangedAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: LicenseStateRow["last_result_status"];
  lastReason: string | null;
  needsReview: boolean;
  reviewReason: string | null;
};

export type LicenseOverview = {
  parserVerified: boolean;
  activeRun: LicenseRun | null;
  lastRun: LicenseRun | null;
  summary: Record<LicenseBucket, number> & { needs_review: number; total: number };
  rows: LicenseOverviewRow[];
};

export function bucketFor(
  hasDocument: boolean,
  state: LicenseStateRow | null
): LicenseBucket {
  if (!hasDocument) return "no_document";
  if (!state) return "unchecked";
  if (state.last_result_status === "CHECK_FAILED") return "check_failed";
  if (state.current_status === "VALID") return "valid";
  if (state.current_status === "INVALID") return "invalid";
  if (state.current_status === "NOT_FOUND") return "not_found";
  return "unchecked";
}

export async function getLicenseCheckOverview(d?: Deps): Promise<LicenseOverview> {
  const deps = withDeps(d);
  const [villasRes, statesRes, activeRes, lastRes] = await Promise.all([
    villaAdminRepository.findLicenseCheckCandidates(),
    repo.findAllStates(),
    repo.findActiveFullRun(),
    repo.findLatestFinishedFullRun(),
  ]);
  if (villasRes.error) dbError(villasRes.error, "villas read");
  if (statesRes.error) dbError(statesRes.error, "states read");
  if (activeRes.error) dbError(activeRes.error, "active run read");
  if (lastRes.error) dbError(lastRes.error, "last run read");

  const states = new Map<string, LicenseStateRow>();
  for (const s of (statesRes.data || []) as unknown as LicenseStateRow[]) states.set(s.villa_id, s);

  const summary = {
    valid: 0, invalid: 0, not_found: 0, check_failed: 0, no_document: 0, unchecked: 0,
    needs_review: 0, total: 0,
  };
  const rows: LicenseOverviewRow[] = [];
  for (const v of (villasRes.data || []) as Array<{ id: string; title: string | null; tourism_document_number: string | null }>) {
    const raw = String(v.tourism_document_number ?? "").trim() || null;
    const n = normalizeKtbDocumentNumber(raw);
    const s = states.get(v.id) ?? null;
    /* Belge numarası değiştiyse eski numaranın durumu gösterilmez. */
    const state = s && s.document_number_normalized === (n.ok ? n.value : null) ? s : null;
    const bucket = bucketFor(!!raw, state);
    const needsReview = !!state && state.review_state === "needs_review";
    summary[bucket] += 1;
    if (needsReview) summary.needs_review += 1;
    summary.total += 1;
    rows.push({
      villaId: v.id,
      title: v.title || "Mülk",
      documentNumber: raw,
      ktbUrl: ktbLicenseLinkFor(raw),
      bucket,
      currentStatus: state?.current_status ?? "UNCHECKED",
      previousStatus: state?.previous_status ?? null,
      statusChangedAt: state?.status_changed_at ?? null,
      lastCheckedAt: state?.last_checked_at ?? null,
      lastSuccessAt: state?.last_success_at ?? null,
      lastResult: state?.last_result_status ?? null,
      lastReason: state?.last_reason_code ?? null,
      needsReview,
      reviewReason: needsReview ? state?.review_reason ?? null : null,
    });
  }

  return {
    parserVerified: deps.parserVerified,
    activeRun: (activeRes.data as unknown as LicenseRun) ?? null,
    lastRun: (lastRes.data as unknown as LicenseRun) ?? null,
    summary,
    rows,
  };
}
