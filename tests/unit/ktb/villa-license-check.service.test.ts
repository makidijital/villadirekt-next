// @vitest-environment node
/* ===============================================================
   🛡️ villa-license-check.service — senaryo testleri (in-memory DB)
   ===============================================================
   Repository'ler bellek içi sahte ile değiştirilir (migration 098'in
   kısmi unique index + lease davranışı taklit edilir). KTB istemcisi
   ve parser bağımlılık olarak enjekte edilir — gerçek parser
   doğrulanana kadar KTB davranışı TAHMİN EDİLMEZ; burada yalnız
   servis/durum makinesi mantığı test edilir.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const s = {
    villas: [] as Row[],
    runs: [] as Row[],
    checks: [] as Row[],
    states: new Map<string, Row>(),
    seq: 0,
  };
  const id = (p: string) => `${p}-${++s.seq}`;
  const active = (r: Row) => r.status === "queued" || r.status === "running";
  return { s, id, active };
});

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findLicenseCheckCandidates: async () => ({ data: db.s.villas.map((v) => ({ ...v })), error: null }),
    findLicenseCheckCandidateById: async (vid: string) => ({
      data: db.s.villas.find((v) => v.id === vid) ?? null,
      error: null,
    }),
  },
}));

vi.mock("@/lib/db/villa-license-check.repository.server", () => {
  const { s, id, active } = db;
  const run = (r: Record<string, unknown>) => ({ ...r });
  return {
    villaLicenseCheckRepository: {
      findActiveFullRun: async () => ({ data: s.runs.find((r) => r.trigger === "full" && active(r)) ?? null, error: null }),
      findLatestFinishedFullRun: async () => ({
        data: [...s.runs].reverse().find((r) => r.trigger === "full" && !active(r)) ?? null,
        error: null,
      }),
      findRunById: async (rid: string) => ({ data: s.runs.find((r) => r.id === rid) ?? null, error: null }),
      insertRun: async (p: Record<string, unknown>) => {
        await Promise.resolve();
        const row = { id: id("run"), status: "queued", trigger: "full", created_at: new Date().toISOString(), started_at: null, finished_at: null, total_documents: 0, processed_documents: 0, valid_count: 0, not_found_count: 0, invalid_count: 0, check_failed_count: 0, abort_reason: null, lease_owner: null, lease_until: null, ...p };
        if (row.trigger === "full" && active(row) && s.runs.some((r) => r.trigger === "full" && active(r))) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        s.runs.push(row);
        return { data: run(row), error: null };
      },
      updateRun: async (rid: string, patch: Record<string, unknown>) => {
        const r = s.runs.find((x) => x.id === rid)!;
        Object.assign(r, patch);
        return { data: [run(r)], error: null };
      },
      acquireRunLease: async (rid: string, owner: string, nowIso: string, untilIso: string) => {
        const r = s.runs.find((x) => x.id === rid);
        if (!r || !active(r) || (r.lease_until && String(r.lease_until) >= nowIso)) return { data: [], error: null };
        Object.assign(r, { lease_owner: owner, lease_until: untilIso });
        return { data: [run(r)], error: null };
      },
      releaseRunLease: async (rid: string, owner: string) => {
        const r = s.runs.find((x) => x.id === rid);
        if (r && r.lease_owner === owner) Object.assign(r, { lease_owner: null, lease_until: null });
        return { error: null };
      },
      insertChecks: async (rows: Record<string, unknown>[]) => {
        const out = rows.map((r) => ({ id: id("chk"), attempt_count: 0, previous_status: null, http_status: null, response_sha256: null, ...r }));
        s.checks.push(...out);
        return { data: out.map((r) => ({ ...r })), error: null };
      },
      findPendingChecks: async (rid: string, limit: number) => ({
        data: s.checks
          .filter((c) => c.run_id === rid && c.result_status == null)
          .sort((a, b) => String(a.document_number_normalized).localeCompare(String(b.document_number_normalized)))
          .slice(0, limit)
          .map((c) => ({ ...c })),
        error: null,
      }),
      updateCheck: async (cid: string, patch: Record<string, unknown>) => {
        Object.assign(s.checks.find((c) => c.id === cid)!, patch);
        return { error: null };
      },
      countChecks: async (rid: string, st: string | null) => {
        const rows = s.checks.filter((c) => c.run_id === rid);
        const count =
          st === null ? rows.filter((c) => c.result_status == null).length
          : st === "processed" ? rows.filter((c) => c.result_status != null).length
          : rows.filter((c) => c.result_status === st).length;
        return { count, error: null };
      },
      findLatestReliableCheckForDocument: async (doc: string, sinceIso: string) => ({
        data:
          s.checks
            .filter((c) => c.document_number_normalized === doc && ["VALID", "NOT_FOUND", "INVALID"].includes(String(c.result_status)) && String(c.checked_at) >= sinceIso)
            .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))[0] ?? null,
        error: null,
      }),
      findAllStates: async () => ({ data: [...s.states.values()].map((x) => ({ ...x })), error: null }),
      findStatesByVillaIds: async (ids: string[]) => ({
        data: ids.map((v) => s.states.get(v)).filter(Boolean).map((x) => ({ ...x! })),
        error: null,
      }),
      upsertStates: async (rows: Record<string, unknown>[]) => {
        for (const r of rows) s.states.set(String(r.villa_id), { ...r });
        return { error: null };
      },
    },
  };
});

import {
  getLicenseCheckOverview,
  processLicenseScanTick,
  recheckVillaLicense,
  startFullLicenseScan,
  type LicenseCheckDeps,
} from "@/app/services/villa-license-check.service";
import type { KtbFetchOutcome } from "@/lib/ktb/ktb-license.client.server";
import { parseKtbLicensePage } from "@/lib/ktb/ktb-license.parser";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KtbParseResult } from "@/lib/ktb/ktb-license.parser";

/* ---------------- test harness ---------------- */
let clock = 0;
type Behaviour = KtbParseResult | Exclude<KtbFetchOutcome, { ok: true }>;
let behaviour: Record<string, Behaviour | Behaviour[]> = {};
let fetchCalls: string[] = [];
let slowDocs = new Set<string>();

const ok = (status: KtbParseResult["status"], extra: Partial<KtbParseResult> = {}): KtbParseResult => ({ status, reason: null, ...extra });
const fail = (reason: string, flags: Partial<{ retryable: boolean; stopRun: boolean; structural: boolean; httpStatus: number }> = {}) =>
  ({ ok: false, reason, httpStatus: flags.httpStatus ?? null, retryable: !!flags.retryable, stopRun: !!flags.stopRun, structural: !!flags.structural }) as Exclude<KtbFetchOutcome, { ok: true }>;

function next(doc: string): Behaviour {
  const b = behaviour[doc] ?? ok("VALID");
  if (Array.isArray(b)) return b.length > 1 ? b.shift()! : b[0];
  return b;
}

const deps: Partial<LicenseCheckDeps> = {
  parserVerified: true,
  now: () => clock,
  sleep: async (ms) => { clock += ms; },
  random: () => 0,
  fetchPage: async (doc) => {
    fetchCalls.push(doc);
    clock += slowDocs.has(doc) ? 15_000 : 2000;
    const b = next(doc);
    if ("ok" in b) return b;
    return { ok: true, httpStatus: 200, body: JSON.stringify(b), sha256: "a".repeat(64) };
  },
  parse: (html) => JSON.parse(html) as KtbParseResult,
};

function villas(n: number, docOf: (i: number) => string | null = (i) => `07-${1000 + i}`) {
  db.s.villas = Array.from({ length: n }, (_, i) => ({ id: `v${i}`, title: `Villa ${i}`, tourism_document_number: docOf(i), is_active: true }));
}
async function runToEnd(runId: string, maxTicks = 5000) {
  let ticks = 0;
  for (;;) {
    const r = await processLicenseScanTick(runId, deps);
    ticks++;
    if (!r.ok) throw new Error(r.error);
    if (r.run.status !== "queued" && r.run.status !== "running") return { run: r.run, ticks };
    if (ticks > maxTicks) throw new Error("bitmedi");
  }
}
async function fullScan() {
  const started = await startFullLicenseScan("admin-1", deps);
  if (!started.ok) throw new Error(started.error);
  return runToEnd(started.run.id);
}
const state = (v: string) => db.s.states.get(v) as Record<string, unknown>;

beforeEach(() => {
  db.s.villas = [];
  db.s.runs = [];
  db.s.checks = [];
  db.s.states = new Map();
  clock = Date.parse("2026-10-01T00:00:00Z");
  behaviour = {};
  fetchCalls = [];
  slowDocs = new Set();
});

describe("parser doğrulanmadan KTB'ye istek gitmez (güvenlik kapısı)", () => {
  it("parserVerified=false iken tarama ve tek kontrol reddedilir", async () => {
    villas(2);
    const fetchPage = vi.fn();
    const s = await startFullLicenseScan("a", { fetchPage, parserVerified: false });
    expect(s).toMatchObject({ ok: false, code: "parser_unverified" });
    const r = await recheckVillaLicense("v0", "a", { fetchPage, parserVerified: false });
    expect(r).toMatchObject({ ok: false, code: "parser_unverified" });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(db.s.runs).toHaveLength(0);
    expect((await getLicenseCheckOverview({ parserVerified: false })).parserVerified).toBe(false);
  });
  it("gerçek fixture'larla doğrulanmış parser varsayılan olarak açık", async () => {
    expect((await getLicenseCheckOverview()).parserVerified).toBe(true);
  });
});

describe("gerçek KTB fixture'ları + gerçek parser (uçtan uca, ağ YOK)", () => {
  const fx = (f: string) => readFileSync(join(process.cwd(), "tests/fixtures/ktb", f), "utf8");
  const realDeps: Partial<LicenseCheckDeps> = {
    ...deps,
    parse: parseKtbLicensePage,
    fetchPage: async (doc) => {
      fetchCalls.push(doc);
      clock += 2000;
      /* 07-6195 → gerçek "kayıt var" yanıtı. 07-9999999 → gerçek "kayıt
         yok" yanıtı (yalnız form action yankısı bu numaraya uyarlandı;
         gövde yapısı aynen). Diğer numaralar → değiştirilmemiş "yok"
         yanıtı (yankı uyuşmaz). */
      const html =
        doc === "07-6195" ? fx("ktb_07-6195.html")
        : doc === "07-9999999" ? fx("ktb_07-99999999.html").replace("belgeno=07-99999999", "belgeno=07-9999999")
        : fx("ktb_07-99999999.html");
      return { ok: true, httpStatus: 200, body: html, sha256: "c".repeat(64) };
    },
  };
  it("07-6195 → VALID, 07-99999999 → NOT_FOUND; başka numaraya gelen yanıt → CHECK_FAILED", async () => {
    villas(4, (i) => ["07-6195", "07-9999999", "07-5555", "07-99999999"][i]);
    const s = await startFullLicenseScan("a", realDeps);
    if (!s.ok) throw new Error(s.error);
    let run = s.run;
    while (run.status === "queued" || run.status === "running") {
      const t = await processLicenseScanTick(run.id, realDeps);
      if (!t.ok) throw new Error(t.error);
      run = t.run;
    }
    expect(state("v0")).toMatchObject({ current_status: "VALID", last_result_status: "VALID" });
    expect(state("v1")).toMatchObject({ current_status: "NOT_FOUND", review_state: "needs_review", review_reason: "not_found" });
    /* 07-5555 sorgusuna 07-99999999 yanıtı döndü → yankı uyuşmazlığı. */
    expect(state("v2")).toMatchObject({ current_status: "UNCHECKED", last_result_status: "CHECK_FAILED", last_reason_code: "query_mismatch" });
    /* 8 haneli numara KTB formatı dışında → istek atılmadan unsupported_format. */
    expect(state("v3")).toMatchObject({ last_result_status: "CHECK_FAILED", last_reason_code: "unsupported_format" });
    expect(fetchCalls).not.toContain("07-99999999");
    expect(run).toMatchObject({ status: "completed", valid_count: 1, not_found_count: 1, check_failed_count: 2, invalid_count: 0 });
  });
});

describe("temel sonuçlar", () => {
  it("VALID / NOT_FOUND / INVALID / CHECK_FAILED + belge no yok + format dışı", async () => {
    villas(6, (i) => ["07-1", "07-2", "07-3", "07-4", null, "abc"][i]);
    behaviour = { "07-1": ok("VALID"), "07-2": ok("NOT_FOUND"), "07-3": ok("INVALID"), "07-4": fail("timeout", { retryable: true }) };
    const { run } = await fullScan();
    expect(run).toMatchObject({ status: "completed", total_documents: 5, processed_documents: 5, valid_count: 1, not_found_count: 1, invalid_count: 1, check_failed_count: 2 });
    expect(fetchCalls.filter((d) => d === "abc")).toHaveLength(0); // format dışı → istek YOK
    /* Retry tick bütçesine sığmadığında belge sonraki tick'e ertelenir;
       kalıcı sonuç tam retry hakkıyla (1 + 2) yazılır. */
    expect(db.s.checks.find((c) => c.document_number_normalized === "07-4")).toMatchObject({ result_status: "CHECK_FAILED", reason_code: "timeout", attempt_count: 3 });
    const o = await getLicenseCheckOverview(deps);
    expect(o.summary).toMatchObject({ valid: 1, not_found: 1, invalid: 1, check_failed: 2, no_document: 1, needs_review: 2, total: 6 });
    const byId = Object.fromEntries(o.rows.map((r) => [r.villaId, r]));
    expect(byId.v3).toMatchObject({ bucket: "check_failed", lastReason: "timeout", currentStatus: "UNCHECKED" });
    expect(byId.v5).toMatchObject({ bucket: "check_failed", lastReason: "unsupported_format", ktbUrl: null });
    expect(byId.v4).toMatchObject({ bucket: "no_document" });
    expect(byId.v0.ktbUrl).toContain("belgeno=07-1");
  });
});

describe("durum geçişleri (tek kontrol, önbelleksiz)", () => {
  const seq = async (results: KtbParseResult["status"][]) => {
    villas(1, () => "07-6195");
    behaviour = { "07-6195": results.map((r) => ok(r)) };
    for (let i = 0; i < results.length; i++) {
      const r = await recheckVillaLicense("v0", "a", deps);
      expect(r.ok).toBe(true);
    }
    return state("v0");
  };
  it("VALID → NOT_FOUND", async () => {
    expect(await seq(["VALID", "NOT_FOUND"])).toMatchObject({ current_status: "NOT_FOUND", previous_status: "VALID", review_reason: "not_found_after_valid" });
  });
  it("VALID → INVALID", async () => {
    expect(await seq(["VALID", "INVALID"])).toMatchObject({ current_status: "INVALID", previous_status: "VALID", review_state: "needs_review" });
  });
  it("INVALID → VALID", async () => {
    expect(await seq(["INVALID", "VALID"])).toMatchObject({ current_status: "VALID", previous_status: "INVALID", review_state: "ok" });
  });
  it("NOT_FOUND → VALID", async () => {
    expect(await seq(["NOT_FOUND", "VALID"])).toMatchObject({ current_status: "VALID", previous_status: "NOT_FOUND" });
  });
  it("kontrol satırı önceki durumu saklar", async () => {
    await seq(["VALID", "INVALID"]);
    const rows = db.s.checks.filter((c) => c.villa_id === "v0");
    expect(rows.map((r) => [r.result_status, r.previous_status])).toEqual([["VALID", null], ["INVALID", "VALID"]]);
  });
  it("CHECK_FAILED sonrası son güvenilir durum korunur, sonraki başarılı kontrol düzeltir", async () => {
    villas(1, () => "07-6195");
    behaviour = { "07-6195": [ok("VALID"), fail("http_5xx", { retryable: true, httpStatus: 500 }), fail("http_5xx", { retryable: true, httpStatus: 500 }), fail("http_5xx", { retryable: true, httpStatus: 500 }), ok("NOT_FOUND")] };
    await recheckVillaLicense("v0", "a", deps);
    await recheckVillaLicense("v0", "a", deps);
    expect(state("v0")).toMatchObject({ current_status: "VALID", last_result_status: "CHECK_FAILED", consecutive_failures: 1, review_state: "ok" });
    const o = await getLicenseCheckOverview(deps);
    expect(o.rows[0]).toMatchObject({ bucket: "check_failed", currentStatus: "VALID" });
    await recheckVillaLicense("v0", "a", deps);
    expect(state("v0")).toMatchObject({ current_status: "NOT_FOUND", previous_status: "VALID" });
  });
});

describe("toplu tarama davranışı", () => {
  it("aynı belge numarası → tek KTB sorgusu, tüm villalara uygulanır", async () => {
    villas(4, (i) => (i < 3 ? "07-6195" : "07-7000"));
    behaviour = { "07-6195": ok("INVALID") };
    await fullScan();
    expect(fetchCalls).toEqual(["07-6195", "07-7000"]);
    for (const v of ["v0", "v1", "v2"]) expect(state(v)).toMatchObject({ current_status: "INVALID" });
  });

  it("iki admin aynı anda Tümünü Tara → tek aktif tarama", async () => {
    villas(3);
    const [a, b] = await Promise.all([startFullLicenseScan("a1", deps), startFullLicenseScan("a2", deps)]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.run.id).toBe(b.run.id);
      expect([a.alreadyRunning, b.alreadyRunning].sort()).toEqual([false, true]);
    }
    expect(db.s.runs.filter((r) => r.trigger === "full")).toHaveLength(1);
    expect(db.s.checks).toHaveLength(3);
  });

  it("kilit: aynı anda iki tick → biri busy döner", async () => {
    villas(3);
    const s = await startFullLicenseScan("a", deps);
    if (!s.ok) throw new Error();
    const [t1, t2] = await Promise.all([processLicenseScanTick(s.run.id, deps), processLicenseScanTick(s.run.id, deps)]);
    expect([t1.ok && t1.busy, t2.ok && t2.busy].filter(Boolean)).toHaveLength(1);
  });

  it("1500+ villa: küçük batch'lerle ilerler, kaldığı yerden devam eder", async () => {
    villas(1510);
    const s = await startFullLicenseScan("a", deps);
    if (!s.ok) throw new Error();
    let last = 0;
    let ticks = 0;
    for (;;) {
      const t = await processLicenseScanTick(s.run.id, deps);
      if (!t.ok) throw new Error(t.error);
      ticks++;
      expect(t.run.processed_documents).toBeGreaterThanOrEqual(last);
      expect(t.processedDocuments).toBeLessThanOrEqual(10); // bütçe/gecikme sınırı
      last = t.run.processed_documents;
      if (ticks === 50) {
        /* "Sayfa kapandı / restart": yeni tick aynı run'dan devam eder. */
        expect(db.s.runs[0].lease_owner).toBeNull();
      }
      if (t.run.status === "completed") break;
    }
    expect(last).toBe(1510);
    expect(fetchCalls).toHaveLength(1510);
    expect(ticks).toBeGreaterThan(100);
  });

  it("kilidi alınmış ama sahibi ölmüş run, kilit süresi dolunca devralınır", async () => {
    villas(2);
    const s = await startFullLicenseScan("a", deps);
    if (!s.ok) throw new Error();
    Object.assign(db.s.runs[0], { lease_owner: "dead", lease_until: new Date(clock + 30_000).toISOString() });
    expect(await processLicenseScanTick(s.run.id, deps)).toMatchObject({ ok: true, busy: true });
    clock += 31_000;
    const { run } = await runToEnd(s.run.id);
    expect(run.status).toBe("completed");
  });

  for (const [name, b, reason] of [
    ["HTTP 403", fail("http_403", { stopRun: true, httpStatus: 403 }), "http_403"],
    ["HTTP 429", fail("http_429", { stopRun: true, httpStatus: 429 }), "http_429"],
    ["CAPTCHA", ok("CHECK_FAILED", { reason: "captcha", stopRun: true }), "captcha"],
  ] as const) {
    it(`${name} → tarama güvenli durur, hiçbir villa geçersiz sayılmaz`, async () => {
      villas(5);
      behaviour = { "07-1001": b };
      const { run } = await fullScan();
      expect(run).toMatchObject({ status: "aborted", abort_reason: reason, invalid_count: 0, not_found_count: 0 });
      expect(fetchCalls).toEqual(["07-1000", "07-1001"]);
      expect(state("v1")).toMatchObject({ current_status: "UNCHECKED", last_result_status: "CHECK_FAILED" });
      expect(db.s.states.has("v2")).toBe(false); // işlenmeyenler bekler
      const again = await startFullLicenseScan("a", deps); // aktif run kalmadı → yeni tarama açılabilir
      expect(again.ok && !again.alreadyRunning).toBe(true);
    });
  }

  it("HTTP 500 → sınırlı retry, sonra CHECK_FAILED; tarama devam eder", async () => {
    villas(3);
    behaviour = { "07-1001": fail("http_5xx", { retryable: true, httpStatus: 500 }) };
    const { run } = await fullScan();
    expect(run).toMatchObject({ status: "completed", check_failed_count: 1, valid_count: 2 });
    expect(fetchCalls.filter((d) => d === "07-1001")).toHaveLength(3);
    const row = db.s.checks.find((c) => c.document_number_normalized === "07-1001")!;
    expect(row).toMatchObject({ result_status: "CHECK_FAILED", reason_code: "http_5xx", http_status: 500, attempt_count: 3 });
  });

  it("HTML yapısı değişti (art arda 3 yapısal hata) → tarama durur", async () => {
    villas(6);
    const changed = ok("CHECK_FAILED", { reason: "html_changed", structural: true });
    behaviour = { "07-1000": changed, "07-1001": changed, "07-1002": changed };
    const { run } = await fullScan();
    expect(run).toMatchObject({ status: "aborted", abort_reason: "html_changed", invalid_count: 0 });
    expect(fetchCalls).toHaveLength(3);
  });

  it("önbellek: yakın zamanda güvenilir sonucu olan numara tekrar sorgulanmaz", async () => {
    villas(2);
    await fullScan();
    fetchCalls = [];
    clock += 3600_000;
    const { run } = await fullScan();
    expect(fetchCalls).toHaveLength(0);
    expect(run.valid_count).toBe(2);
    expect(db.s.checks.filter((c) => c.reason_code === "reused_recent_result")).toHaveLength(2);
    clock += 8 * 24 * 3600_000; // VALID TTL (7 gün) doldu
    await fullScan();
    expect(fetchCalls).toHaveLength(2);
  });

  it("sürekli timeout veren belge sonsuza kadar ertelenmez", async () => {
    villas(3);
    slowDocs = new Set(["07-1001"]);
    behaviour = { "07-1001": fail("timeout", { retryable: true }) };
    const { run, ticks } = await fullScan();
    expect(run).toMatchObject({ status: "completed", check_failed_count: 1, valid_count: 2 });
    expect(ticks).toBeLessThan(10);
    expect(fetchCalls.filter((d) => d === "07-1001").length).toBeLessThanOrEqual(3);
  });

  it("CHECK_FAILED önbelleğe alınmaz", async () => {
    villas(1);
    behaviour = { "07-1000": [fail("timeout", { retryable: true }), fail("timeout", { retryable: true }), fail("timeout", { retryable: true }), ok("VALID")] };
    await fullScan();
    clock += 60_000;
    await fullScan();
    expect(state("v0")).toMatchObject({ current_status: "VALID" });
  });
});
