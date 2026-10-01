// @vitest-environment node
/* ===============================================================
   🛡️ ADMIN YETKİ (H-01) — API + sayfa kapısı regresyon kilidi
   ===============================================================
   Mevcut altyapı: authorizeAdminCaller/Session (oturum) +
   callerHasPermission (DB `sidebar_permissions`). Burada:
     A) İzin haritası (menüyle birebir, OR kümeleri, storage önekleri)
     B) Davranış: yalnız `villas` izni olan admin kritik endpoint'lerde
        403 alır ve HİÇBİR veri fonksiyonu çağrılmaz; izinli admin aynı
        endpoint'te mevcut akışa geçer.
     C) Kayıt taraması: her admin API handler'ı (bilinçli istisnalar
        hariç) auth'tan SONRA, veriden ÖNCE izin kontrolü içerir; her
        admin bölüm klasörü doğru izinle korunur.
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => {
  const log: string[] = [];
  const state = { perms: [] as string[], auth: null as unknown };
  const dataProxy = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          typeof prop === "string"
            ? async () => {
                log.push(`${name}.${prop}`);
                return { data: [], error: null, count: 0 };
              }
            : undefined,
      }
    );
  const fn = (name: string, value: unknown = { ok: true }) =>
    async () => {
      log.push(name);
      return value;
    };
  return { log, state, dataProxy, fn };
});

const CALLER = { id: "caller-1", authUserId: "caller-1", email: "c@test.local", is_active: true };

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: async () => h.state.auth,
  authorizeAdminCallerFlex: async () => h.state.auth,
  authorizeAdminSession: async () => h.state.auth,
}));
vi.mock("@/lib/db/admin-user.repository.server", () => {
  const perm = {
    findByIdForSession: async (id: string) => {
      h.log.push("perm");
      return { data: { id, is_active: true, sidebar_permissions: h.state.perms }, error: null };
    },
  };
  return {
    adminUserServerRepository: new Proxy(perm, {
      get: (t, p) =>
        p in t
          ? (t as Record<string, unknown>)[p as string]
          : async () => {
              h.log.push(`adminUserRepo.${String(p)}`);
              return { data: { id: "target", email: "t@test.local", auth_user_id: null }, error: null };
            },
    }),
  };
});
vi.mock("@/lib/db/admin-user-panel.repository.server", () => ({
  adminUserPanelServerRepository: h.dataProxy("adminUserPanelRepo"),
}));
vi.mock("@/lib/db/reservation.repository.server", () => ({
  reservationServerRepository: h.dataProxy("reservationRepo"),
}));
vi.mock("@/app/services/reservation.service", () => ({
  createReservation: h.fn("createReservation"),
  updateReservationStatus: h.fn("updateReservationStatus"),
  getReservationById: h.fn("getReservationById", null),
  updateReservationFull: h.fn("updateReservationFull"),
  deleteReservation: h.fn("deleteReservation"),
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: h.dataProxy("villaRepo"),
}));
vi.mock("@/app/services/villa-admin.service", () => ({
  hardDeleteVilla: h.fn("hardDeleteVilla"),
  createVillaFull: h.fn("createVillaFull"),
}));
vi.mock("@/lib/storage/s3-storage.provider", () => ({
  s3StorageProvider: {
    upload: async (bucket: string, path: string) => {
      h.log.push(`s3.upload:${bucket}/${path}`);
      return { ok: true, path };
    },
    remove: async (bucket: string, paths: string[]) => {
      h.log.push(`s3.remove:${bucket}/${paths.join(",")}`);
      return { ok: true, failed: [], attempts: 1 };
    },
  },
}));
vi.mock("@/app/lib/voucher/build", () => ({
  buildVoucherContent: h.fn("buildVoucherContent", null),
}));
vi.mock("@/app/services/admin-activity-log.service", () => ({
  extractAdminContextFromRequest: () => ({}),
  insertAdminActivityLog: h.fn("auditInsert"),
}));
vi.mock("@/lib/auth", () => ({
  adminAuthProvider: h.dataProxy("adminAuthProvider"),
}));
vi.mock("@/lib/auth/server", () => ({
  adminAuthProvider: h.dataProxy("adminAuthProvider"),
}));

import {
  ADMIN_SECTIONS,
  adminSectionForPath,
  firstAllowedAdminHref,
  storagePermissionFor,
} from "@/lib/auth/admin-permission-map";

import { GET as listAdmins } from "@/app/api/admin-users/route";
import { DELETE as deleteAdmin } from "@/app/api/admin-users/[id]/route";
import * as reservationsRoute from "@/app/api/admin/reservations/route";
import * as reservationRoute from "@/app/api/admin/reservations/[id]/route";
import { GET as villaDetail } from "@/app/api/admin/villas/[id]/route";
import { POST as hardDelete } from "@/app/api/admin/villas/[id]/hard-delete/route";
import { POST as upload } from "@/app/api/admin/storage/upload/route";
import { POST as remove } from "@/app/api/admin/storage/remove/route";
import { GET as voucher } from "@/app/api/voucher/[id]/route";

const VILLA_BUCKET = "villadirekt-villa-images";
const ASSET_BUCKET = "villadirekt-site-assets";
const idCtx = (id = "x1") => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
function uploadReq(bucket: string, path: string) {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }), "a.webp");
  fd.append("bucket", bucket);
  fd.append("path", path);
  return new Request("http://x/api/admin/storage/upload", { method: "POST", body: fd });
}
const dataCalls = () => h.log.filter((l) => l !== "perm");

beforeEach(() => {
  h.log.length = 0;
  h.state.auth = { ok: true, caller: CALLER };
  h.state.perms = [];
});

/* ================================================================
   A) İZİN HARİTASI
   ================================================================ */
describe("A) izin haritası", () => {
  it("menü (maki-admin/layout.tsx) ile birebir aynı href/izin ve sıra", () => {
    const src = readFileSync(join(process.cwd(), "app/(admin)/maki-admin/layout.tsx"), "utf8");
    const menu = src.slice(src.indexOf("const menuGroups"), src.indexOf("];", src.indexOf("const menuGroups")));
    const items = [...menu.matchAll(/href:\s*"([^"]+)"[\s\S]*?permissionKey:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
    const seen = new Set<string>();
    const topLevel = items.filter(([href]) => {
      const sec = adminSectionForPath(href)!;
      if (seen.has(sec.href)) return false;
      seen.add(sec.href);
      return true;
    });
    expect(topLevel.map(([href]) => href)).toEqual(ADMIN_SECTIONS.map((s) => s.href));
    for (const [href, key] of items) {
      const need = adminSectionForPath(href)!.need;
      expect(Array.isArray(need) ? need : [need], href).toContain(key);
    }
  });

  it("alt ve dinamik yollar üst bölümün iznini alır; login korunmaz", () => {
    expect(adminSectionForPath("/maki-admin/settings/popup")?.need).toBe("settings");
    expect(adminSectionForPath("/maki-admin/villas/abc/galeri")?.need).toBe("villas");
    expect(adminSectionForPath("/maki-admin/reservations/123")?.need).toBe("reservations");
    expect(adminSectionForPath("/maki-admin/blog/new")?.need).toBe("blog");
    expect(adminSectionForPath("/maki-admin")?.need).toBe("dashboard");
    expect(adminSectionForPath("/maki-admin/login")).toBeNull();
  });

  it("ilk izinli bölüm menü sırasıyla seçilir", () => {
    expect(firstAllowedAdminHref(["users", "villas"])).toBe("/maki-admin/villas");
    expect(firstAllowedAdminHref(["dashboard", "users"])).toBe("/maki-admin");
    expect(firstAllowedAdminHref(["payment_accounts"])).toBe("/maki-admin/payment-accounts");
    expect(firstAllowedAdminHref([])).toBeNull();
  });

  it("storage: bucket + yol öneki → izin", () => {
    expect(storagePermissionFor(VILLA_BUCKET, "villas/x__1/gallery-0001.webp")).toBe("villas");
    expect(storagePermissionFor(VILLA_BUCKET, "descriptions/u.webp")).toEqual(["villas", "blog"]);
    expect(storagePermissionFor(ASSET_BUCKET, "branding/admin-logo.webp")).toBe("webmaster");
    expect(storagePermissionFor(ASSET_BUCKET, "popup/popup.webp")).toBe("settings");
    expect(storagePermissionFor(ASSET_BUCKET, "category-covers/a.webp")).toBe("villa_types");
    expect(storagePermissionFor(ASSET_BUCKET, "location-covers/a.webp")).toBe("locations");
    expect(storagePermissionFor(ASSET_BUCKET, "page-covers/a-section-1.webp")).toBe("pages");
    expect(storagePermissionFor(ASSET_BUCKET, "blog/a.webp")).toBe("blog");
    expect(storagePermissionFor(ASSET_BUCKET, "other/a.webp")).toBe("settings");
    expect(storagePermissionFor("evil-bucket", "x")).toBeNull();
  });
});

/* ================================================================
   B) DAVRANIŞ — yalnız `villas` izni olan admin vs izinli admin
   ================================================================ */
describe("B) yetkisiz admin → 403, veri fonksiyonu ÇAĞRILMAZ", () => {
  beforeEach(() => {
    h.state.perms = ["villas"];
  });

  const cases: Array<[string, () => Promise<Response>]> = [
    ["GET /api/admin-users", () => listAdmins(new Request("http://x/api/admin-users"))],
    ["DELETE /api/admin-users/[id]", () => deleteAdmin(new Request("http://x", { method: "DELETE" }), idCtx("victim"))],
    ["GET /api/admin/reservations", () => reservationsRoute.GET(new Request("http://x/api/admin/reservations"))],
    ["POST /api/admin/reservations", () => reservationsRoute.POST(json("http://x/api/admin/reservations", "POST", {}))],
    ["PATCH /api/admin/reservations", () => reservationsRoute.PATCH(json("http://x/api/admin/reservations", "PATCH", { id: "r1", status: "confirmed" }))],
    ["DELETE /api/admin/reservations", () => reservationsRoute.DELETE(new Request("http://x/api/admin/reservations?id=r1", { method: "DELETE" }))],
    ["GET /api/admin/reservations/[id]", () => reservationRoute.GET(new Request("http://x"), idCtx())],
    ["PATCH /api/admin/reservations/[id]", () => reservationRoute.PATCH(json("http://x", "PATCH", {}), idCtx())],
    ["DELETE /api/admin/reservations/[id]", () => reservationRoute.DELETE(new Request("http://x", { method: "DELETE" }), idCtx())],
    ["POST storage/upload (site-assets/branding)", () => upload(uploadReq(ASSET_BUCKET, "branding/admin-logo.webp"))],
    ["POST storage/upload (site-assets/popup)", () => upload(uploadReq(ASSET_BUCKET, "popup/popup.webp"))],
    ["POST storage/remove (site-assets/logo)", () => remove(json("http://x", "POST", { bucket: ASSET_BUCKET, paths: ["logo/logo.webp"] }))],
  ];

  for (const [name, run] of cases) {
    it(name, async () => {
      const res = await run();
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ ok: false, error: "Yetkisiz: bu işlem için izniniz yok" });
      expect(dataCalls()).toEqual([]);
    });
  }

  it("storage/remove: izinli + izinsiz yol karışık → 403, HİÇBİR yol silinmez", async () => {
    h.state.perms = ["settings"];
    const res = await remove(
      json("http://x", "POST", { bucket: ASSET_BUCKET, paths: ["hero/a.webp", "blog/b.webp"] })
    );
    expect(res.status).toBe(403);
    expect(dataCalls()).toEqual([]);
  });

  it("GET /api/voucher/[id] → 403 text/plain (mevcut hata biçimi), voucher üretilmez", async () => {
    const res = await voucher(new Request("http://x/api/voucher/r1"), idCtx("r1"));
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(dataCalls()).toEqual([]);
  });

  it("POST /api/admin/villas/[id]/hard-delete — reservations-only admin → 403", async () => {
    h.state.perms = ["reservations"];
    const res = await hardDelete(new Request("http://x", { method: "POST" }), idCtx());
    expect(res.status).toBe(403);
    expect(dataCalls()).toEqual([]);
  });

  it("GET /api/admin/villas/[id] — blog-only admin → 403", async () => {
    h.state.perms = ["blog"];
    const res = await villaDetail(new Request("http://x"), idCtx());
    expect(res.status).toBe(403);
    expect(dataCalls()).toEqual([]);
  });

  it("oturum yoksa mevcut 401 davranışı aynen (izin sorgusu bile yapılmaz)", async () => {
    h.state.auth = { ok: false, status: 401, error: "Oturum bulunamadı" };
    const res = await listAdmins(new Request("http://x/api/admin-users"));
    expect(res.status).toBe(401);
    expect(h.log).toEqual([]);
  });
});

describe("B) izinli admin → mevcut akışa geçer", () => {
  it("users izni → admin listesi okunur / silme akışına girilir", async () => {
    h.state.perms = ["users"];
    const res = await listAdmins(new Request("http://x/api/admin-users"));
    expect(res.status).toBe(200);
    expect(dataCalls()).toContain("adminUserPanelRepo.findAllForList");
    h.log.length = 0;
    await deleteAdmin(new Request("http://x", { method: "DELETE" }), idCtx("victim"));
    expect(dataCalls().some((c) => c.startsWith("adminUserRepo."))).toBe(true);
  });

  it("reservations izni → rezervasyon listesi okunur", async () => {
    h.state.perms = ["reservations"];
    const res = await reservationsRoute.GET(new Request("http://x/api/admin/reservations"));
    expect(res.status).toBe(200);
    expect(dataCalls()).toContain("reservationRepo.findAllForAdminList");
  });

  it("OR: reservations-only admin villa detayını okuyabilir (rezervasyon formu)", async () => {
    h.state.perms = ["reservations"];
    await villaDetail(new Request("http://x"), idCtx());
    expect(dataCalls().some((c) => c.startsWith("villaRepo."))).toBe(true);
  });

  it("villas izni → hard-delete servisine geçer", async () => {
    h.state.perms = ["villas"];
    await hardDelete(new Request("http://x", { method: "POST" }), idCtx());
    expect(dataCalls()).toContain("hardDeleteVilla");
  });

  it("storage: villas → villa görseli; blog → açıklama görseli; settings → popup; webmaster → branding", async () => {
    for (const [perms, bucket, path] of [
      [["villas"], VILLA_BUCKET, "villas/x__1/gallery-0001.webp"],
      [["blog"], VILLA_BUCKET, "descriptions/u.webp"],
      [["settings"], ASSET_BUCKET, "popup/popup.webp"],
      [["webmaster"], ASSET_BUCKET, "branding/admin-logo.webp"],
    ] as const) {
      h.state.perms = [...perms];
      h.log.length = 0;
      const res = await upload(uploadReq(bucket, path));
      expect(res.status, path).toBe(200);
      expect(dataCalls()).toEqual([`s3.upload:${bucket}/${path}`]);
    }
    h.state.perms = ["villas"];
    h.log.length = 0;
    const res = await remove(json("http://x", "POST", { bucket: VILLA_BUCKET, paths: ["villas/a/1.webp", "villas/a/2.webp"] }));
    expect(res.status).toBe(200);
    expect(dataCalls()).toEqual([`s3.remove:${VILLA_BUCKET}/villas/a/1.webp,villas/a/2.webp`]);
  });
});

/* ================================================================
   C) KAYIT TARAMASI
   ================================================================ */
function walk(dir: string, file: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) out.push(...walk(f, file));
    else if (e === file) out.push(f);
  }
  return out;
}

describe("C) her admin API handler'ı izin kontrolü içerir", () => {
  const root = join(process.cwd(), "app/api");
  const files = walk(root, "route.ts").filter((f) => {
    const rel = f.slice(root.length);
    return (
      rel.startsWith("/admin/") ||
      rel.startsWith("/admin-users") ||
      (rel.startsWith("/mail/") && !rel.startsWith("/mail/reservation-request")) ||
      rel.startsWith("/voucher/")
    );
  });
  /* Bilinçli istisnalar: yalnız ÇAĞIRANIN KENDİ hesabı (2FA) ve kendi
     işlem kaydı (activity-logs/log — her admin kendi eylemini loglar). */
  const EXCEPTIONS = new Set([
    "/admin/2fa/enroll/start/route.ts",
    "/admin/2fa/enroll/confirm/route.ts",
    "/admin/2fa/disable/route.ts",
    "/admin/2fa/recovery-codes/regenerate/route.ts",
    "/admin/activity-logs/log/route.ts",
  ]);

  /* +3: villa-license-checks (özet/tarama, tick, tek villa kontrolü). */
  it("taranan dosya sayısı (58 admin API dosyası)", () => {
    expect(files.length).toBe(58);
  });

  for (const f of files) {
    const rel = f.slice(root.length);
    const src = readFileSync(f, "utf8");
    const handlers = [...src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
    for (let i = 0; i < handlers.length; i++) {
      const body = src.slice(handlers[i].index!, handlers[i + 1]?.index ?? src.length);
      it(`${handlers[i][1]} ${rel.replace("/route.ts", "")}`, () => {
        if (EXCEPTIONS.has(rel)) {
          expect(body).not.toMatch(/callerHasPermission|requirePermission/);
          return;
        }
        const authIdx = body.search(/authorizeAdmin(Caller|CallerFlex|Session)\(/);
        const permIdx = body.indexOf("callerHasPermission(");
        expect(authIdx).toBeGreaterThanOrEqual(0);
        expect(permIdx).toBeGreaterThan(authIdx);
        /* Veri erişimi (repository / servis / S3) izinden SONRA. Storage
           route'ları bucket/yol için gövdeyi izinden önce ayrıştırır
           (veri erişimi değil). */
        const dataIdx = body.search(/Repository\.|s3StorageProvider\.|buildVoucherContent\(|hardDeleteVilla\(/);
        if (dataIdx >= 0) expect(dataIdx).toBeGreaterThan(permIdx);
        if (!rel.startsWith("/admin/storage/")) {
          const bodyIdx = body.search(/req\.(json|formData)\(/);
          if (bodyIdx >= 0) expect(bodyIdx).toBeGreaterThan(permIdx);
        }
      });
    }
  }
});

describe("C) her admin bölüm klasörü sunucu yetki kapısıyla korunur", () => {
  const base = join(process.cwd(), "app/(admin)/maki-admin");
  const folders = readdirSync(base).filter(
    (e) => statSync(join(base, e)).isDirectory() && walk(join(base, e), "page.tsx").length > 0 && e !== "login"
  );

  it("bölüm listesi haritayla aynı", () => {
    expect(folders.map((f) => `/maki-admin/${f}`).sort()).toEqual(
      ADMIN_SECTIONS.filter((s) => s.href !== "/maki-admin").map((s) => s.href).sort()
    );
  });

  for (const f of folders) {
    it(`/maki-admin/${f}/layout.tsx`, () => {
      const p = join(base, f, "layout.tsx");
      expect(existsSync(p)).toBe(true);
      const src = readFileSync(p, "utf8");
      expect(src).not.toMatch(/^\s*["']use client["']/m);
      const need = adminSectionForPath(`/maki-admin/${f}`)!.need;
      const lit = Array.isArray(need) ? `need={[${need.map((n) => `"${n}"`).join(", ")}]}` : `need="${need}"`;
      expect(src).toContain(`<AdminSectionGuard ${lit}>`);
    });
  }

  it("dashboard sayfası veriden önce 'dashboard' izni ister", () => {
    const src = readFileSync(join(base, "page.tsx"), "utf8");
    const gate = src.indexOf('adminPermissionGate(auth.caller.id, "dashboard")');
    expect(gate).toBeGreaterThan(src.indexOf("await authorizeAdminSession()"));
    expect(gate).toBeLessThan(src.indexOf("findRecentForDashboard("));
  });
});
