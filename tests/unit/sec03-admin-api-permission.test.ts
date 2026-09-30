/* ===============================================================
   🛡️ SEC-03 (Faz 1) — ADMIN API PERMISSION REGRESYON KİLİDİ
   ===============================================================
   Faz 1 kapsamındaki 6 handler:
     PATCH /api/admin-users/[id]            → "users"
     POST  /api/admin/create-user           → "users"
     POST  /api/admin/2fa/reset             → "users"
     GET   /api/admin/activity-logs/list    → "activity_logs"
     POST  /api/admin/activity-logs/cleanup → "activity_logs"
     PUT   /api/admin/settings              → "settings"

   Gerçek `callerHasPermission` (lib/auth/action-authz) kullanılır;
   yalnız auth helper'ı ve DB repository'leri mock'lanır. Böylece:
     • oturumsuz → 401, pasif → 403 (mevcut davranış korunur)
     • aktif ama izinsiz → 403 + hiçbir veri/mutation fonksiyonu
       çağrılmaz (AUTH → İZİN → DATA sırası)
     • izinli → mevcut başarılı yanıt BİREBİR
     • GET /api/admin/settings ve kendi 2FA route'ları DEĞİŞMEDİ
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => {
  const log: string[] = [];
  const state: {
    auth: unknown;
    perms: Record<string, { is_active: boolean; sidebar_permissions: unknown } | null>;
  } = { auth: null, perms: {} };
  const spy = <T>(name: string, value: T) =>
    vi.fn(async (...args: unknown[]) => {
      void args;
      log.push(name);
      return value;
    });
  return {
    log,
    state,
    authorizeAdminCaller: vi.fn(async () => {
      log.push("auth");
      return state.auth;
    }),
    authorizeAdminSession: vi.fn(async () => {
      log.push("auth");
      return state.auth;
    }),
    adminUserServerRepository: {
      /* callerHasPermission bunu çağırır (izin okuma) — 2FA reset
         route'u da hedef admin için çağırır; id'ye göre ayrılır. */
      findByIdForSession: vi.fn(async (id: string) => {
        if (id in state.perms) {
          log.push("perm-lookup");
          const row = state.perms[id];
          return { data: row ? { id, ...row } : null, error: null };
        }
        log.push("target-lookup");
        return {
          data: { id, email: "target@test.local", is_active: true },
          error: null,
        };
      }),
      findIdByEmail: spy("findIdByEmail", { data: null, error: null }),
      findByIdForDelete: spy("findByIdForDelete", { data: null, error: null }),
      deleteById: spy("deleteById", { error: null }),
    },
    adminUserPanelServerRepository: {
      updateById: spy("updateById", { error: null }),
    },
    adminTotpServerRepository: {
      deleteAllRecoveryCodes: spy("deleteAllRecoveryCodes", { error: null }),
      disable: spy("totpDisable", { error: null }),
    },
    adminActivityLogRepository: {
      list: spy("logList", { data: [{ id: 1 }], error: null, count: 1 }),
      deleteOlderThan: spy("logDeleteOlderThan", { error: null, count: 3 }),
      deleteAll: spy("logDeleteAll", { error: null, count: 9 }),
    },
    settingsServerRepository: {
      findSingleton: spy("settingsFindSingleton", { data: { id: "s1" }, error: null }),
      findSingletonStrict: spy("settingsFindStrict", {
        data: { id: "s1", site_name: "X" },
        error: null,
      }),
      updateById: spy("settingsUpdate", { error: null }),
    },
    adminAuthProvider: {
      createUser: spy("createUser", { ok: true, value: { id: "new-admin-id", email: "n@test.local" } }),
    },
    insertAdminActivityLog: spy("auditInsert", undefined),
  };
});

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: h.authorizeAdminCaller,
  authorizeAdminSession: h.authorizeAdminSession,
}));
vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: h.adminUserServerRepository,
}));
vi.mock("@/lib/db/admin-user-panel.repository.server", () => ({
  adminUserPanelServerRepository: h.adminUserPanelServerRepository,
}));
vi.mock("@/lib/db/admin-totp.repository.server", () => ({
  adminTotpServerRepository: h.adminTotpServerRepository,
}));
vi.mock("@/lib/db/admin-activity-log.repository.server", () => ({
  adminActivityLogRepository: h.adminActivityLogRepository,
}));
vi.mock("@/lib/db/settings.repository.server", () => ({
  settingsServerRepository: h.settingsServerRepository,
}));
vi.mock("@/lib/auth/server", () => ({
  adminAuthProvider: h.adminAuthProvider,
}));
vi.mock("@/app/services/admin-activity-log.service", () => ({
  extractAdminContextFromRequest: () => ({}),
  insertAdminActivityLog: h.insertAdminActivityLog,
}));

import { PATCH as patchAdminUser } from "@/app/api/admin-users/[id]/route";
import { POST as createUser } from "@/app/api/admin/create-user/route";
import { POST as reset2fa } from "@/app/api/admin/2fa/reset/route";
import { GET as listLogs } from "@/app/api/admin/activity-logs/list/route";
import { POST as cleanupLogs } from "@/app/api/admin/activity-logs/cleanup/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/admin/settings/route";
import { FORBIDDEN_MESSAGE } from "@/lib/auth/action-authz";

const CALLER = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const ALL_PERMS = ["users", "settings", "activity_logs", "villas", "reservations"];

function okAuth() {
  return {
    ok: true,
    caller: { id: CALLER, authUserId: CALLER, email: "caller@test.local", is_active: true },
  };
}
function setCaller(perms: unknown, isActive = true) {
  h.state.auth = okAuth();
  h.state.perms = { [CALLER]: { is_active: isActive, sidebar_permissions: perms } };
}
function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type Case = {
  name: string;
  perm: string;
  call: () => Promise<Response>;
  sideEffects: string[];
  expectOk: (json: unknown) => void;
};

const CASES: Case[] = [
  {
    name: "PATCH /api/admin-users/[id]",
    perm: "users",
    call: () =>
      patchAdminUser(
        jsonReq(`http://x/api/admin-users/${TARGET}`, "PATCH", {
          sidebar_permissions: ["users", "settings"],
          is_active: true,
        }),
        { params: Promise.resolve({ id: TARGET }) }
      ),
    sideEffects: ["updateById"],
    expectOk: (j) => expect(j).toEqual({ ok: true }),
  },
  {
    name: "POST /api/admin/create-user",
    perm: "users",
    call: () =>
      createUser(
        jsonReq("http://x/api/admin/create-user", "POST", {
          email: "new@test.local",
          password: "secret123",
          full_name: "New Admin",
          permissions: ["blog"],
        })
      ),
    sideEffects: ["findIdByEmail", "createUser", "auditInsert"],
    expectOk: (j) => expect(j).toEqual({ ok: true, id: "new-admin-id" }),
  },
  {
    name: "POST /api/admin/2fa/reset",
    perm: "users",
    call: () => reset2fa(jsonReq("http://x/api/admin/2fa/reset", "POST", { adminId: TARGET })),
    sideEffects: ["target-lookup", "deleteAllRecoveryCodes", "totpDisable"],
    expectOk: (j) => expect(j).toEqual({ ok: true, id: TARGET }),
  },
  {
    name: "GET /api/admin/activity-logs/list",
    perm: "activity_logs",
    call: () => listLogs(new Request("http://x/api/admin/activity-logs/list?limit=10")),
    sideEffects: ["logList"],
    expectOk: (j) =>
      expect(j).toEqual({ ok: true, items: [{ id: 1 }], total: 1, returned: 1, offset: 0, limit: 10 }),
  },
  {
    name: "POST /api/admin/activity-logs/cleanup (mode:all)",
    perm: "activity_logs",
    call: () => cleanupLogs(jsonReq("http://x/api/admin/activity-logs/cleanup", "POST", { mode: "all" })),
    sideEffects: ["logDeleteAll"],
    expectOk: (j) => expect(j).toEqual({ ok: true, mode: "all", deleted: 9 }),
  },
  {
    name: "PUT /api/admin/settings",
    perm: "settings",
    call: () => putSettings(jsonReq("http://x/api/admin/settings", "PUT", { site_name: "Y" })),
    sideEffects: ["settingsFindSingleton", "settingsUpdate"],
    expectOk: (j) => expect(j).toEqual({ ok: true }),
  },
];

const SIDE_EFFECT_NAMES = [
  "updateById",
  "findIdByEmail",
  "createUser",
  "auditInsert",
  "target-lookup",
  "deleteAllRecoveryCodes",
  "totpDisable",
  "logList",
  "logDeleteOlderThan",
  "logDeleteAll",
  "settingsFindSingleton",
  "settingsFindStrict",
  "settingsUpdate",
];

beforeEach(() => {
  h.log.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("SEC-03 Faz 1 — A) oturum yok → 401, hiçbir veri çağrısı yok", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      h.state.auth = { ok: false, status: 401, error: "Oturum bulunamadı" };
      h.state.perms = {};
      const res = await c.call();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false, error: "Oturum bulunamadı" });
      expect(h.log).toEqual(["auth"]);
    });
  }
});

describe("SEC-03 Faz 1 — B) pasif admin → 403 (auth katmanı), hiçbir veri çağrısı yok", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      h.state.auth = { ok: false, status: 403, error: "Hesabınız pasif durumda" };
      const res = await c.call();
      expect(res.status).toBe(403);
      expect(h.log).toEqual(["auth"]);
    });
  }
});

describe("SEC-03 Faz 1 — C/E/F) aktif ama izinsiz → 403, veri/mutation YOK", () => {
  for (const c of CASES) {
    const others = ALL_PERMS.filter((p) => p !== c.perm);
    it(`${c.name} — yalnız başka izinler (${others.join(",")})`, async () => {
      setCaller(others);
      const res = await c.call();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: FORBIDDEN_MESSAGE });
      expect(h.log).toEqual(["auth", "perm-lookup"]);
      for (const s of SIDE_EFFECT_NAMES) expect(h.log).not.toContain(s);
    });
    it(`${c.name} — boş izin kümesi`, async () => {
      setCaller([]);
      const res = await c.call();
      expect(res.status).toBe(403);
      expect(h.log).toEqual(["auth", "perm-lookup"]);
    });
    it(`${c.name} — izin satırı okunamıyor (fail-closed)`, async () => {
      h.state.auth = okAuth();
      h.state.perms = { [CALLER]: null };
      const res = await c.call();
      expect(res.status).toBe(403);
      expect(h.log).toEqual(["auth", "perm-lookup"]);
    });
    it(`${c.name} — izin kaydında var ama admin pasifleştirilmiş`, async () => {
      setCaller([c.perm], false);
      const res = await c.call();
      expect(res.status).toBe(403);
      expect(h.log).toEqual(["auth", "perm-lookup"]);
    });
  }
});

describe("SEC-03 Faz 1 — D/G) doğru izinli admin → mevcut başarılı yanıt, sıra AUTH → İZİN → DATA", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      setCaller([c.perm]);
      const res = await c.call();
      expect(res.status).toBe(200);
      c.expectOk(await res.json());
      expect(h.log.slice(0, 2)).toEqual(["auth", "perm-lookup"]);
      for (const s of c.sideEffects) {
        expect(h.log).toContain(s);
        expect(h.log.indexOf(s)).toBeGreaterThan(1);
      }
    });
  }

  it("PATCH — yetkili admin başka adminin izinlerini değiştirir: payload aynen iletilir", async () => {
    setCaller(["users"]);
    await patchAdminUser(
      jsonReq(`http://x/api/admin-users/${TARGET}`, "PATCH", {
        sidebar_permissions: ["villas"],
        is_active: false,
      }),
      { params: Promise.resolve({ id: TARGET }) }
    );
    expect(h.adminUserPanelServerRepository.updateById).toHaveBeenCalledWith(TARGET, {
      sidebar_permissions: ["villas"],
      is_active: false,
    });
  });

  it("I) create-user — audit log davranışı korunur (admin.created)", async () => {
    setCaller(["users"]);
    await createUser(
      jsonReq("http://x/api/admin/create-user", "POST", {
        email: "new@test.local",
        password: "secret123",
        full_name: "New Admin",
        permissions: ["blog"],
      })
    );
    expect(h.insertAdminActivityLog).toHaveBeenCalledTimes(1);
    expect(h.insertAdminActivityLog.mock.calls[0][1]).toMatchObject({
      action: "admin.created",
      entity_id: "new-admin-id",
    });
  });

  it("2FA reset — `users` izinli admin kendi 2FA'sını bu route ile yine KAPATAMAZ (mevcut self-guard)", async () => {
    setCaller(["users"]);
    const res = await reset2fa(jsonReq("http://x/api/admin/2fa/reset", "POST", { adminId: CALLER }));
    expect(res.status).toBe(403);
    expect(h.adminTotpServerRepository.disable).not.toHaveBeenCalled();
  });
});

describe("SEC-03 Faz 1 — kapsam dışı davranışlar DEĞİŞMEDİ", () => {
  /* 🛡️ Admin yetki (SEC-04) — önceki "izinsiz admin de okuyabilir"
     davranışı BİLİNÇLİ OLARAK kapatıldı: tam satır yalnız `settings`
     iznine; rezervasyon ekranlarının tek ihtiyacı `prepayment_rate`
     `reservations` iznine dar projeksiyonla; diğerleri 403. */
  it("GET /api/admin/settings — `settings` izni → tam satır (mevcut yanıt birebir)", async () => {
    setCaller(["settings"]);
    const res = await getSettings(new Request("http://x/api/admin/settings"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settings: { id: "s1", site_name: "X" } });
  });

  it("GET /api/admin/settings — yalnız `reservations` → yalnız prepayment_rate (secret/diğer alan YOK)", async () => {
    setCaller(["reservations"]);
    const res = await getSettings(new Request("http://x/api/admin/settings"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settings: { prepayment_rate: null } });
  });

  it("GET /api/admin/settings — ne `settings` ne `reservations` → 403, satır OKUNMAZ", async () => {
    setCaller(["villas"]);
    const res = await getSettings(new Request("http://x/api/admin/settings"));
    expect(res.status).toBe(403);
    expect(h.log).not.toContain("settingsFindStrict");
  });

  it("H) kendi 2FA route'ları (enroll/start, enroll/confirm, disable, recovery-codes) izin kontrolü İÇERMEZ", () => {
    for (const rel of [
      "app/api/admin/2fa/enroll/start/route.ts",
      "app/api/admin/2fa/enroll/confirm/route.ts",
      "app/api/admin/2fa/disable/route.ts",
      "app/api/admin/2fa/recovery-codes/regenerate/route.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/callerHasPermission|requirePermission/);
      expect(src).toContain("authorizeAdminSession()");
    }
  });

  it("Faz 1 handler'larında izin kontrolü auth'tan hemen sonra, veri erişiminden önce yer alıyor", () => {
    const files: Array<[string, string, string]> = [
      ["app/api/admin-users/[id]/route.ts", "export async function PATCH", '"users"'],
      ["app/api/admin/create-user/route.ts", "export async function POST", '"users"'],
      ["app/api/admin/2fa/reset/route.ts", "export async function POST", '"users"'],
      ["app/api/admin/activity-logs/list/route.ts", "export async function GET", '"activity_logs"'],
      ["app/api/admin/activity-logs/cleanup/route.ts", "export async function POST", '"activity_logs"'],
      ["app/api/admin/settings/route.ts", "export async function PUT", '"settings"'],
    ];
    for (const [rel, fn, key] of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      const start = src.indexOf(fn);
      const body = src.slice(start);
      const authIdx = body.search(/authorizeAdmin(Caller|Session)\(/);
      const permIdx = body.indexOf(`callerHasPermission(auth.caller.id, ${key})`);
      const dataIdx = body.search(/Repository\.|adminAuthProvider\.|req\.json\(/);
      expect(authIdx, rel).toBeGreaterThanOrEqual(0);
      expect(permIdx, rel).toBeGreaterThan(authIdx);
      expect(dataIdx, rel).toBeGreaterThan(permIdx);
    }
  });
});
