/* ===============================================================
   🛡️ SEC-01 — ADMIN SERVER PAGE AUTH REGRESYON KİLİDİ
   ===============================================================
   Bulgu: middleware refresh cookie'nin yalnız VARLIĞINA bakıyor
   (sahte `__Host-admin_rt` ile geçiyor) ve 6 admin Server Component
   sayfası kendi auth kontrolü olmadan DB'den veri çekiyordu.

   Bu dosya şunları kilitler:
     1) Oturum doğrulanamazsa (`authorizeAdminSession` ok:false —
        sahte refresh cookie / cookie yok / geçersiz access / pasif
        admin durumlarının hepsi buraya düşer) sayfa HİÇBİR veri
        fonksiyonunu çağırmaz ve yalnız `AdminPageSessionRefresh`
        döndürür.
     2) Oturum geçerliyse veri fonksiyonları çağrılır ve
        `authorizeAdminSession` HER ZAMAN ilk veri çağrısından ÖNCE
        tamamlanır (AUTH → DATA sırası).
     3) Kayıt taraması: veri modülü import eden her server admin
        page.tsx aynı gate'i içerir (yeni korumasız sayfa eklenirse
        test kırılır).
     4) `AdminPageSessionRefresh` yalnız guard admin'i doğruladıktan
        sonra `router.refresh()` ister ve en fazla 2 kez dener.
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";

/* ---------------------------------------------------------------
   Çağrı sırası kaydı — AUTH → DATA sırasını kanıtlamak için.
   (vi.mock factory'leri hoist edildiği için paylaşılan state
   vi.hoisted içinde kurulur.)
--------------------------------------------------------------- */
const h = vi.hoisted(() => {
  const callLog: string[] = [];
  const authResult: { current: unknown } = { current: null };
  function dataSpy<T>(name: string, value: T) {
    return vi.fn(async () => {
      callLog.push(name);
      return value;
    });
  }
  return {
    callLog,
    authResult,
    authorizeAdminSession: vi.fn(async () => {
      callLog.push("auth");
      return authResult.current;
    }),
    reservationRepo: {
      findRecentForDashboard: dataSpy("findRecentForDashboard", { data: [], error: null }),
    },
    analytics: { getDailyReservationCounts: dataSpy("getDailyReservationCounts", []) },
    operations: { getOperationsSnapshot: dataSpy("getOperationsSnapshot", {}) },
    villaService: {
      getVillasForAdminPage: dataSpy("getVillasForAdminPage", {
        items: [],
        total: 0,
        page: 1,
        pageSize: 30,
      }),
      getVillasForSortOrder: dataSpy("getVillasForSortOrder", []),
    },
    villaAdminRepository: {
      findAllIdTitleSlug: dataSpy("findAllIdTitleSlug", { data: [], error: null }),
      findActiveCuratorCards: dataSpy("findActiveCuratorCards", { data: [], error: null }),
    },
    villaLocationRepository: {
      findAllForFilter: dataSpy("findAllForFilter", { data: [], error: null }),
    },
    villaTypeRepository: {
      findAllIdNameBySortOrder: dataSpy("findAllIdNameBySortOrder", { data: [], error: null }),
      findAllRelations: dataSpy("findAllRelations", { data: [], error: null }),
    },
    settingsService: { getPublicSettings: dataSpy("getPublicSettings", null) },
    settingsTranslationService: {
      getSettingsTranslations: dataSpy("getSettingsTranslations", { ok: true, translations: {} }),
    },
    routerRefresh: vi.fn(),
    adminState: { admin: null as unknown },
    /* 🛡️ Sayfa yetki kapısı (AdminSectionGuard > callerHasPermission)
       izinleri mevcut repository'den okur → DB yerine bu durum. */
    perms: { current: [] as string[] },
    redirect: vi.fn(),
  };
});
const { callLog, authResult, routerRefresh, adminState, perms } = h;

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: h.authorizeAdminSession,
}));
vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: {
    findByIdForSession: vi.fn(async (id: string) => {
      h.callLog.push("perm");
      return {
        data: { id, is_active: true, sidebar_permissions: h.perms.current },
        error: null,
      };
    }),
  },
}));

/* ---------------- veri modülleri (sayfaların kullandıkları) ---------------- */
vi.mock("@/lib/db/reservation.repository.server", () => ({
  reservationServerRepository: h.reservationRepo,
}));
vi.mock("@/app/services/analytics.service", () => h.analytics);
vi.mock("@/app/services/operations.service", () => h.operations);
vi.mock("@/app/services/villa.service", () => h.villaService);
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: h.villaAdminRepository,
}));
vi.mock("@/lib/db/villa-location.repository", () => ({
  villaLocationRepository: h.villaLocationRepository,
}));
vi.mock("@/lib/db/villa-type.repository", () => ({
  villaTypeRepository: h.villaTypeRepository,
}));
vi.mock("@/app/services/settings.service", () => h.settingsService);
vi.mock("@/app/services/settings-translation.service", () => h.settingsTranslationService);

/* ---------------- client island'lar → hafif stub ---------------- */
vi.mock("@/app/components/admin/dashboard/ReservationsChart", () => ({ default: () => null }));
vi.mock("@/app/components/admin/dashboard/UpcomingOperations", () => ({ default: () => null }));
vi.mock("@/app/components/admin/dashboard/HideableSection", () => ({ default: () => null }));
vi.mock("@/app/(admin)/maki-admin/villas/_components/VillaOperationsList", () => ({ default: () => null }));
vi.mock("@/app/(admin)/maki-admin/manual-reservations/ekle/ManualReservationForm", () => ({ default: () => null }));
vi.mock("@/app/(admin)/maki-admin/villas/siralama/_components/VillaSortPanel", () => ({ default: () => null }));
vi.mock("@/app/(admin)/maki-admin/villa-listesi/_components/VillaListesiClient", () => ({ default: () => null }));
vi.mock("@/app/(admin)/maki-admin/settings/ceviriler/SettingsTranslationsPage", () => ({ default: () => null }));

/* ---------------- AdminPageSessionRefresh bağımlılıkları ---------------- */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.routerRefresh, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/maki-admin",
  redirect: h.redirect,
}));

vi.mock("@/app/components/admin/AdminSessionGuard", () => ({
  useAdmin: () => ({
    admin: h.adminState.admin,
    loading: false,
    refresh: async () => {},
    signOut: async () => {},
  }),
}));

import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";
import DashboardPage from "@/app/(admin)/maki-admin/page";
import VillasPage from "@/app/(admin)/maki-admin/villas/page";
import ManualReservationAddPage from "@/app/(admin)/maki-admin/manual-reservations/ekle/page";
import VillaSortPage from "@/app/(admin)/maki-admin/villas/siralama/page";
import VillaListesiPage from "@/app/(admin)/maki-admin/villa-listesi/page";
import SettingsCevirilerPage from "@/app/(admin)/maki-admin/settings/ceviriler/page";

type PageCase = {
  name: string;
  run: () => Promise<unknown>;
  dataCalls: string[];
};

const noParams = { searchParams: Promise.resolve({}) };

type PageCaseWithNeed = PageCase & { need: string };

const PAGES: PageCaseWithNeed[] = [
  {
    name: "/maki-admin (dashboard)",
    need: "dashboard",
    run: () => DashboardPage(),
    dataCalls: ["findRecentForDashboard", "getDailyReservationCounts", "getOperationsSnapshot"],
  },
  {
    name: "/maki-admin/villas",
    need: "villas",
    run: () => VillasPage(noParams as never),
    dataCalls: ["getVillasForAdminPage"],
  },
  {
    name: "/maki-admin/manual-reservations/ekle",
    need: "manual_reservations",
    run: () => ManualReservationAddPage(noParams as never),
    dataCalls: ["findAllIdTitleSlug"],
  },
  {
    name: "/maki-admin/villas/siralama",
    need: "villas",
    run: () => VillaSortPage(),
    dataCalls: ["getVillasForSortOrder"],
  },
  {
    name: "/maki-admin/villa-listesi",
    need: "villa_lists",
    run: () => VillaListesiPage(),
    dataCalls: [
      "findActiveCuratorCards",
      "findAllForFilter",
      "findAllIdNameBySortOrder",
      "findAllRelations",
    ],
  },
  {
    name: "/maki-admin/settings/ceviriler",
    need: "settings",
    run: () => SettingsCevirilerPage(),
    dataCalls: ["getPublicSettings", "getSettingsTranslations"],
  },
];

const DENIED = [
  { label: "oturum yok / sahte refresh cookie (access cookie yok)", value: { ok: false, status: 401, error: "Oturum bulunamadı" } },
  { label: "geçersiz / süresi dolmuş access token", value: { ok: false, status: 401, error: "Oturum doğrulanamadı" } },
  { label: "pasif admin", value: { ok: false, status: 403, error: "Hesabınız pasif durumda" } },
];

const OK = {
  ok: true,
  caller: {
    id: "11111111-1111-4111-8111-111111111111",
    authUserId: "11111111-1111-4111-8111-111111111111",
    email: "full@test.local",
    is_active: true,
  },
};

beforeEach(() => {
  callLog.length = 0;
  vi.clearAllMocks();
});

describe("SEC-01 — oturum doğrulanamazsa admin server page veri ÜRETMEZ", () => {
  for (const page of PAGES) {
    for (const denied of DENIED) {
      it(`${page.name} — ${denied.label}`, async () => {
        authResult.current = denied.value;
        const el = (await page.run()) as { type?: unknown };

        expect(callLog).toEqual(["auth"]);
        expect(el?.type).toBe(AdminPageSessionRefresh);
      });
    }
  }
});

describe("SEC-01 — geçerli oturumda sıra AUTH → DATA", () => {
  for (const page of PAGES) {
    it(`${page.name}`, async () => {
      authResult.current = OK;
      perms.current = [page.need];
      const el = (await page.run()) as { type?: unknown };

      expect(callLog[0]).toBe("auth");
      expect(callLog.filter((c) => c === "auth")).toHaveLength(1);
      for (const fn of page.dataCalls) {
        expect(callLog).toContain(fn);
        expect(callLog.indexOf(fn)).toBeGreaterThan(callLog.indexOf("auth"));
      }
      expect(el?.type).not.toBe(AdminPageSessionRefresh);
    });
  }
});

/* ---------------------------------------------------------------
   🛡️ ADMIN YETKİ — oturum geçerli ama bölüm izni YOK → veri ÜRETİLMEZ;
   ilk izinli bölüme yönlendirilir; hiç izin yoksa bilgi kartı.
--------------------------------------------------------------- */
describe("Admin yetki — izin yoksa server page veri ÜRETMEZ (AUTH → PERM → DATA)", () => {
  for (const page of PAGES) {
    it(`${page.name} — başka bölüm izni olan admin`, async () => {
      authResult.current = OK;
      perms.current = page.need === "blog" ? ["pages"] : ["blog"];
      const el = (await page.run()) as { type?: unknown };
      for (const fn of page.dataCalls) expect(callLog).not.toContain(fn);
      expect(callLog.filter((c) => c !== "auth" && c !== "perm")).toEqual([]);
      expect(h.redirect).toHaveBeenCalledWith("/maki-admin/blog");
      expect(el?.type).not.toBe(AdminPageSessionRefresh);
    });

    it(`${page.name} — hiç izni olmayan admin`, async () => {
      authResult.current = OK;
      perms.current = [];
      await page.run();
      for (const fn of page.dataCalls) expect(callLog).not.toContain(fn);
      expect(h.redirect).not.toHaveBeenCalled();
    });

    it(`${page.name} — yetkili admin: izin kontrolü veriden ÖNCE`, async () => {
      authResult.current = OK;
      perms.current = [page.need];
      await page.run();
      const firstData = Math.min(...page.dataCalls.map((fn) => callLog.indexOf(fn)));
      expect(callLog.indexOf("perm")).toBeGreaterThan(callLog.indexOf("auth"));
      expect(callLog.indexOf("perm")).toBeLessThan(firstData);
      expect(h.redirect).not.toHaveBeenCalled();
    });
  }
});

/* ---------------------------------------------------------------
   KAYIT TARAMASI — veri modülü import eden her server admin sayfası
   gate'i içermeli.
--------------------------------------------------------------- */
function listPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listPages(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

describe("SEC-01 — kayıt taraması: veri çeken server admin sayfaları gate'li", () => {
  const root = join(process.cwd(), "app/(admin)/maki-admin");
  const DATA_IMPORT = /^import\s+(?!type\b)[^;]*from\s+["'](@\/lib\/db\/|@\/app\/services\/)[^"']*["']/m;
  const serverPagesWithData = listPages(root).filter((p) => {
    const src = readFileSync(p, "utf8");
    return !/^\s*["']use client["']/m.test(src) && DATA_IMPORT.test(src);
  });

  it("en az bilinen 6 sayfa taranıyor", () => {
    expect(serverPagesWithData.length).toBeGreaterThanOrEqual(6);
  });

  for (const p of serverPagesWithData) {
    it(p.replace(process.cwd() + "/", ""), () => {
      const src = readFileSync(p, "utf8");
      expect(src).toContain("await authorizeAdminSession()");
      expect(src).toMatch(/if \(!auth\.ok\) return <AdminPageSessionRefresh \/>;/);
      /* 🛡️ Admin yetki: oturumdan SONRA, veriden ÖNCE izin kapısı. */
      expect(src).toMatch(/const denied = await adminPermissionGate\(auth\.caller\.id, "[a-z_]+"\);\s*if \(denied\) return denied;/);
    });
  }
});

describe("SEC-01 — AdminPageSessionRefresh", () => {
  it("guard admin'i doğrulamadıysa router.refresh çağrılmaz", () => {
    adminState.admin = null;
    render(<AdminPageSessionRefresh />);
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("guard admin'i doğruladığında refresh ister; admin güncellenince tekrar; en fazla 2 kez", () => {
    adminState.admin = { id: "a" };
    const { rerender } = render(<AdminPageSessionRefresh />);
    expect(routerRefresh).toHaveBeenCalledTimes(1);

    adminState.admin = { id: "a" }; // guard lookup → yeni referans
    rerender(<AdminPageSessionRefresh />);
    expect(routerRefresh).toHaveBeenCalledTimes(2);

    adminState.admin = { id: "a" };
    rerender(<AdminPageSessionRefresh />);
    expect(routerRefresh).toHaveBeenCalledTimes(2);
  });

  it("görsel çıktı üretmez", () => {
    adminState.admin = null;
    const { container } = render(<AdminPageSessionRefresh />);
    expect(container.innerHTML).toBe("");
  });
});
