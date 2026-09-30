/* ===============================================================
   🛡️ SERVER ACTION AUTHORIZATION — GÜVENLİK SÖZLEŞMESİ
   ===============================================================
   NEDEN: `middleware.ts` yalnız `/maki-admin/:path*` YOL DESENİNİ
   korur. Server Action derlenmiş action ID'si ile HERHANGİ bir
   route'a POST edilerek çağrılabilir → admin klasöründe bulunmak
   koruma DEĞİL. Bu dosya, `lib/auth/action-authz.ts` gate'inin
   gerçekten uygulandığını kilitler.

   KAPSAM (kullanıcı senaryoları 1-6):
     1) Yetkili admin           → action çalışır
     2) Yetkisiz admin          → reddedilir
     3) Oturum yok              → reddedilir
     4) Tüm yetkilere sahip admin → erişimi korunur
        (⚠️ projede super-admin/rol KAVRAMI YOK — model düz:
         is_active + sidebar_permissions[]; "full access" = tüm
         key'lere sahip admin. Yeni rol sistemi ÜRETİLMEDİ.)
     5) Public action           → admin yetkisi İSTEMEZ
     6) Yetki başarısız         → servis/repository HİÇ çağrılmaz
        (DB mutation'a ulaşılmaz)

   + KAYIT TARAMASI: "use server" dosyalarındaki HER export'un ya
     guard'ı olduğu ya da bilinçli public allow-list'te olduğu
     statik olarak doğrulanır → yeni gate'siz action eklenemez.
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* ---------- auth zinciri mock'ları ---------- */
const authorizeAdminSessionMock = vi.fn();
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: (...a: unknown[]) => authorizeAdminSessionMock(...a),
}));

const findByIdForSessionMock = vi.fn();
vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: {
    findByIdForSession: (...a: unknown[]) => findByIdForSessionMock(...a),
  },
}));

/* ---------- servis mock'ları (DB'ye ASLA inilmez) ---------- */
const createManualReservationMock = vi.fn();
const updateManualReservationMock = vi.fn();
const deleteManualReservationMock = vi.fn();
const getVillaAvailabilitySnapshotMock = vi.fn();
vi.mock("@/app/services/manualReservation.service", () => ({
  createManualReservation: (...a: unknown[]) => createManualReservationMock(...a),
  updateManualReservation: (...a: unknown[]) => updateManualReservationMock(...a),
  deleteManualReservation: (...a: unknown[]) => deleteManualReservationMock(...a),
  getVillaAvailabilitySnapshot: (...a: unknown[]) =>
    getVillaAvailabilitySnapshotMock(...a),
}));

const deletePaymentAccountMock = vi.fn();
vi.mock("@/app/services/payment-account.service", () => ({
  getPaymentAccounts: vi.fn(),
  createPaymentAccount: vi.fn(),
  updatePaymentAccount: vi.fn(),
  deletePaymentAccount: (...a: unknown[]) => deletePaymentAccountMock(...a),
  setActivePaymentAccount: vi.fn(),
}));

const deleteWesternUnionAccountMock = vi.fn();
vi.mock("@/app/services/western-union-account.service", () => ({
  getWesternUnionAccounts: vi.fn(),
  createWesternUnionAccount: vi.fn(),
  updateWesternUnionAccount: vi.fn(),
  deleteWesternUnionAccount: (...a: unknown[]) =>
    deleteWesternUnionAccountMock(...a),
  setActiveWesternUnionAccount: vi.fn(),
}));

const getFinanceKpiSnapshotMock = vi.fn();
vi.mock("@/app/services/finance.service", () => ({
  getFinanceKpiSnapshot: (...a: unknown[]) => getFinanceKpiSnapshotMock(...a),
}));

const listMailLogsMock = vi.fn();
vi.mock("@/app/services/mail-log.service", () => ({
  listMailLogs: (...a: unknown[]) => listMailLogsMock(...a),
}));

const deleteVillaFeatureMock = vi.fn();
vi.mock("@/app/services/villa-feature.service", () => ({
  getVillaFeatures: vi.fn(),
  addVillaFeature: vi.fn(),
  updateVillaFeature: vi.fn(),
  deleteVillaFeature: (...a: unknown[]) => deleteVillaFeatureMock(...a),
}));

/* Public action — admin yetkisi İSTEMEMELİ. */
const searchByTitleMock = vi.fn();
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    searchByTitle: (...a: unknown[]) => searchByTitleMock(...a),
  },
}));

import {
  createManualReservationAction,
  updateManualReservationAction,
  deleteManualReservationAction,
} from "@/app/(admin)/maki-admin/manual-reservations/manual-reservation.action";
import { deletePaymentAccountAction } from "@/app/services/payment-account.action";
import { deleteWesternUnionAccountAction } from "@/app/services/western-union-account.action";
import { getFinanceKpiSnapshotAction } from "@/app/(admin)/maki-admin/maki-finans/finance.action";
import { listMailLogsAction } from "@/app/(admin)/maki-admin/system-logs/system-logs.action";
import { deleteVillaFeatureAction } from "@/app/(admin)/maki-admin/features/features.action";

const ADMIN_ID = "admin-1";
const ALL_PERMISSIONS = [
  "dashboard", "villas", "villa_types", "features", "rules", "price_includes",
  "locations", "villa_lists", "property_owners", "reservations",
  "manual_reservations", "external_calendars", "offer_requests",
  "payment_methods", "payment_accounts", "finance", "pages", "blog", "menu",
  "homepage_collection", "discount_collection", "messages", "faqs",
  "reviews", "settings", "webmaster", "system_logs", "activity_logs", "users",
];

function loginAs(perms: string[]) {
  authorizeAdminSessionMock.mockResolvedValue({
    ok: true,
    caller: {
      id: ADMIN_ID,
      authUserId: "auth-1",
      email: "admin@example.com",
      is_active: true,
    },
  });
  findByIdForSessionMock.mockResolvedValue({
    data: { id: ADMIN_ID, is_active: true, sidebar_permissions: perms },
    error: null,
  });
}

function logout() {
  authorizeAdminSessionMock.mockResolvedValue({
    ok: false,
    status: 401,
    error: "Oturum bulunamadı",
  });
  findByIdForSessionMock.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  loginAs(ALL_PERMISSIONS);
  createManualReservationMock.mockResolvedValue({ ok: true });
  updateManualReservationMock.mockResolvedValue({ ok: true });
  deleteManualReservationMock.mockResolvedValue({ ok: true });
  deletePaymentAccountMock.mockResolvedValue(true);
  deleteWesternUnionAccountMock.mockResolvedValue(true);
  getFinanceKpiSnapshotMock.mockResolvedValue({ revenue: 0 });
  listMailLogsMock.mockResolvedValue([]);
  deleteVillaFeatureMock.mockResolvedValue(true);
});

/* ===============================================================
   1) YETKİLİ ADMIN → ACTION ÇALIŞIR
   =============================================================== */
describe("1) yetkili admin → action başarılı", () => {
  it("manual_reservations izni olan admin manuel rezervasyon oluşturabilir", async () => {
    loginAs(["manual_reservations"]);
    await createManualReservationAction({ villaId: "v1" } as never);
    expect(createManualReservationMock).toHaveBeenCalledTimes(1);
  });

  it("finance izni olan admin finans KPI okuyabilir", async () => {
    loginAs(["finance"]);
    await getFinanceKpiSnapshotAction("month" as never);
    expect(getFinanceKpiSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it("system_logs izni olan admin mail loglarını okuyabilir", async () => {
    loginAs(["system_logs"]);
    await listMailLogsAction();
    expect(listMailLogsMock).toHaveBeenCalledTimes(1);
  });

  it("payment_accounts VEYA settings izni yeterlidir (any-of)", async () => {
    loginAs(["settings"]);
    await deletePaymentAccountAction("acc-1" as never);
    expect(deletePaymentAccountMock).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    deletePaymentAccountMock.mockResolvedValue(true);
    loginAs(["payment_accounts"]);
    await deletePaymentAccountAction("acc-1" as never);
    expect(deletePaymentAccountMock).toHaveBeenCalledTimes(1);
  });
});

/* ===============================================================
   2) YETKİSİZ ADMIN → REDDEDİLİR   +   6) DB MUTATION ÇALIŞMAZ
   =============================================================== */
describe("2+6) yetkisiz admin → reddedilir, servis/DB HİÇ çağrılmaz", () => {
  it("manuel rezervasyon OLUŞTURMA — yanlış izin", async () => {
    loginAs(["pages"]);
    await expect(
      createManualReservationAction({ villaId: "v1" } as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(createManualReservationMock).not.toHaveBeenCalled();
  });

  it("manuel rezervasyon GÜNCELLEME — yanlış izin", async () => {
    loginAs(["pages"]);
    await expect(
      updateManualReservationAction("r1" as never, {} as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(updateManualReservationMock).not.toHaveBeenCalled();
  });

  it("manuel rezervasyon SİLME — yanlış izin", async () => {
    loginAs(["pages"]);
    await expect(
      deleteManualReservationAction("r1" as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(deleteManualReservationMock).not.toHaveBeenCalled();
  });

  it("ödeme hesabı SİLME — yanlış izin", async () => {
    loginAs(["villas"]);
    await expect(
      deletePaymentAccountAction("acc-1" as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(deletePaymentAccountMock).not.toHaveBeenCalled();
  });

  it("Western Union hesabı SİLME — yanlış izin", async () => {
    loginAs(["villas"]);
    await expect(
      deleteWesternUnionAccountAction("wu-1" as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(deleteWesternUnionAccountMock).not.toHaveBeenCalled();
  });

  it("villa özelliği SİLME — yanlış izin", async () => {
    loginAs(["messages"]);
    await expect(deleteVillaFeatureAction("f1")).rejects.toThrow(/Yetkisiz/);
    expect(deleteVillaFeatureMock).not.toHaveBeenCalled();
  });

  it("finans KPI OKUMA — yanlış izin (hassas veri sızmaz)", async () => {
    loginAs(["messages"]);
    await expect(
      getFinanceKpiSnapshotAction("month" as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(getFinanceKpiSnapshotMock).not.toHaveBeenCalled();
  });

  it("mail logları OKUMA — yanlış izin (müşteri e-postaları sızmaz)", async () => {
    loginAs(["messages"]);
    await expect(listMailLogsAction()).rejects.toThrow(/Yetkisiz/);
    expect(listMailLogsMock).not.toHaveBeenCalled();
  });

  it("BOŞ izin kümesi → her şey reddedilir (fail-closed)", async () => {
    loginAs([]);
    await expect(
      deleteManualReservationAction("r1" as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(deleteManualReservationMock).not.toHaveBeenCalled();
  });

  it("admin_users okunamazsa (DB hatası) → fail-closed", async () => {
    authorizeAdminSessionMock.mockResolvedValue({
      ok: true,
      caller: {
        id: ADMIN_ID,
        authUserId: "auth-1",
        email: "a@b.c",
        is_active: true,
      },
    });
    findByIdForSessionMock.mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });
    await expect(
      deleteManualReservationAction("r1" as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(deleteManualReservationMock).not.toHaveBeenCalled();
  });

  it("is_active=false → reddedilir", async () => {
    authorizeAdminSessionMock.mockResolvedValue({
      ok: true,
      caller: {
        id: ADMIN_ID,
        authUserId: "auth-1",
        email: "a@b.c",
        is_active: true,
      },
    });
    findByIdForSessionMock.mockResolvedValue({
      data: {
        id: ADMIN_ID,
        is_active: false,
        sidebar_permissions: ALL_PERMISSIONS,
      },
      error: null,
    });
    await expect(
      deleteManualReservationAction("r1" as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(deleteManualReservationMock).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   3) OTURUM YOK → REDDEDİLİR
   =============================================================== */
describe("3) login olmamış kullanıcı → reddedilir", () => {
  it("mutation action'ı çalışmaz", async () => {
    logout();
    await expect(
      createManualReservationAction({ villaId: "v1" } as never)
    ).rejects.toThrow(/Yetkisiz/);
    expect(createManualReservationMock).not.toHaveBeenCalled();
  });

  it("hassas okuma action'ı çalışmaz", async () => {
    logout();
    await expect(listMailLogsAction()).rejects.toThrow(/Yetkisiz/);
    expect(listMailLogsMock).not.toHaveBeenCalled();
  });

  it("oturum yoksa admin_users lookup'ına bile gidilmez", async () => {
    logout();
    await expect(
      deleteVillaFeatureAction("f1")
    ).rejects.toThrow(/Yetkisiz/);
    expect(findByIdForSessionMock).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   4) TÜM YETKİLERE SAHİP ADMIN → ERİŞİM KORUNUR
   =============================================================== */
describe("4) tüm yetkilere sahip admin → mevcut erişim korunur", () => {
  it("tüm SIDEBAR_PERMISSIONS key'lerine sahip admin hepsini çağırabilir", async () => {
    loginAs(ALL_PERMISSIONS);
    await createManualReservationAction({ villaId: "v1" } as never);
    await deletePaymentAccountAction("acc-1" as never);
    await deleteWesternUnionAccountAction("wu-1" as never);
    await getFinanceKpiSnapshotAction("month" as never);
    await listMailLogsAction();
    await deleteVillaFeatureAction("f1");
    expect(createManualReservationMock).toHaveBeenCalledTimes(1);
    expect(deletePaymentAccountMock).toHaveBeenCalledTimes(1);
    expect(deleteWesternUnionAccountMock).toHaveBeenCalledTimes(1);
    expect(getFinanceKpiSnapshotMock).toHaveBeenCalledTimes(1);
    expect(listMailLogsMock).toHaveBeenCalledTimes(1);
    expect(deleteVillaFeatureMock).toHaveBeenCalledTimes(1);
  });
});

/* ===============================================================
   5) PUBLIC ACTION → ADMIN YETKİSİ İSTEMEZ
   =============================================================== */
describe("5) public action'lar yanlışlıkla admin-only YAPILMADI", () => {
  it("searchVillas (public header araması) oturum olmadan çalışır", async () => {
    logout();
    searchByTitleMock.mockResolvedValue({ data: [], error: null });
    const { searchVillas } = await import(
      "@/app/components/layout/villa-search.action"
    );
    await expect(searchVillas("bodrum")).resolves.toBeDefined();
    expect(authorizeAdminSessionMock).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   KAYIT TARAMASI — gate'siz yeni action eklenemez
   =============================================================== */
const PUBLIC_ALLOWLIST: Record<string, string[]> = {
  "app/(public)/favoriler/shared-favorites.action.ts": [
    "createSharedFavoritesListAction",
  ],
  "app/components/layout/villa-search.action.ts": ["searchVillas"],
  "app/components/ui/hero/_components/hero-features.action.ts": [
    "loadHeroFeatures",
  ],
  "app/components/ui/hero/_components/hero-filters.action.ts": [
    "loadHeroFilters",
  ],
  "app/services/settings.action.ts": ["getPublicSettingsAction"],
  "app/services/villa-review.action.ts": ["createVillaReviewAction"],
  "app/services/villa.action.ts": [
    "getVillasByIdsAction",
    "getVillaBadgesAction",
  ],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") {
      continue;
    }
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("KAYIT TARAMASI — her Server Action export'u ya gate'li ya allow-list'te", () => {
  const root = process.cwd();
  const sources = [...walk(join(root, "app")), ...walk(join(root, "lib"))];
  const actionFiles = sources.filter((p) =>
    /^\s*["']use server["']/m.test(readFileSync(p, "utf8"))
  );

  it("en az 40 'use server' dosyası taranıyor (tarayıcı gerçekten çalışıyor)", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(40);
  });

  it("gate'siz ve allow-list'te olmayan HİÇBİR export yok", () => {
    const GUARD =
      /\b(requirePermission|requireAdminAction|callerHasPermission)\s*\(/;
    const offenders: string[] = [];
    for (const abs of actionFiles) {
      const rel = abs.slice(root.length + 1);
      const src = readFileSync(abs, "utf8");
      const lines = src.split("\n");
      const starts: Array<[number, string]> = [];
      lines.forEach((l, i) => {
        const m = /^export\s+(?:async\s+)?function\s+(\w+)/.exec(l);
        if (m) starts.push([i, m[1]]);
      });
      starts.forEach(([i, name], idx) => {
        const end = idx + 1 < starts.length ? starts[idx + 1][0] : lines.length;
        const body = stripComments(lines.slice(i, end).join("\n"));
        const allowed = PUBLIC_ALLOWLIST[rel]?.includes(name) ?? false;
        if (!GUARD.test(body) && !allowed) offenders.push(`${rel} :: ${name}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("allow-list'teki public action'lara YANLIŞLIKLA gate eklenmemiş", () => {
    const GUARD =
      /\b(requirePermission|requireAdminAction|callerHasPermission)\s*\(/;
    const broken: string[] = [];
    for (const [rel, names] of Object.entries(PUBLIC_ALLOWLIST)) {
      const src = readFileSync(join(root, rel), "utf8");
      const lines = src.split("\n");
      const starts: Array<[number, string]> = [];
      lines.forEach((l, i) => {
        const m = /^export\s+(?:async\s+)?function\s+(\w+)/.exec(l);
        if (m) starts.push([i, m[1]]);
      });
      starts.forEach(([i, name], idx) => {
        if (!names.includes(name)) return;
        const end = idx + 1 < starts.length ? starts[idx + 1][0] : lines.length;
        const body = stripComments(lines.slice(i, end).join("\n"));
        if (GUARD.test(body)) broken.push(`${rel} :: ${name}`);
      });
    }
    expect(broken).toEqual([]);
  });
});
