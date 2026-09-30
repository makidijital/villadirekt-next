/* ===============================================================
   🛡️ AdminSectionGuard — bölüm layout'u yetki kapısı
   Sıra: oturum → izin → içerik. Yetkisiz: ilk izinli bölüme redirect;
   hiç izin yoksa bilgi kartı; children (bölüm içeriği) render EDİLMEZ.
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({
  auth: null as unknown,
  perms: [] as string[],
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/admin-route-auth", () => ({ authorizeAdminSession: async () => h.auth }));
vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: {
    findByIdForSession: async (id: string) => ({
      data: { id, is_active: true, sidebar_permissions: h.perms },
      error: null,
    }),
  },
}));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/app/components/admin/AdminPageSessionRefresh", () => ({
  default: function AdminPageSessionRefresh() {
    return null;
  },
}));

import AdminSectionGuard from "@/app/components/admin/AdminSectionGuard";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";

const OK = { ok: true, caller: { id: "a1", authUserId: "a1", email: "a@t", is_active: true } };
const CHILD = <p>GİZLİ-İÇERİK</p>;

beforeEach(() => {
  h.redirect.mockClear();
  h.perms = [];
  h.auth = OK;
});

describe("AdminSectionGuard", () => {
  it("oturum yok → mevcut SEC-01 fallback'i; izin sorgusu/children yok", async () => {
    h.auth = { ok: false, status: 401, error: "x" };
    const el = (await AdminSectionGuard({ need: "settings", children: CHILD })) as ReactElement;
    expect(el.type).toBe(AdminPageSessionRefresh);
  });

  it("izinli → children aynen", async () => {
    h.perms = ["settings"];
    const el = (await AdminSectionGuard({ need: "settings", children: CHILD })) as ReactElement;
    expect(renderToStaticMarkup(el)).toContain("GİZLİ-İÇERİK");
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("OR kümesi: herhangi biri yeterli", async () => {
    h.perms = ["settings"];
    const el = (await AdminSectionGuard({ need: ["payment_accounts", "settings"], children: CHILD })) as ReactElement;
    expect(renderToStaticMarkup(el)).toContain("GİZLİ-İÇERİK");
  });

  it("yetkisiz → menü sırasındaki ilk izinli bölüme redirect, children render edilmez", async () => {
    h.perms = ["users", "villas"];
    await expect(AdminSectionGuard({ need: "settings", children: CHILD })).rejects.toThrow(
      "NEXT_REDIRECT:/maki-admin/villas"
    );
  });

  it("hiç izin yok → bilgi kartı (redirect döngüsü yok), children yok", async () => {
    h.perms = [];
    const el = await AdminSectionGuard({ need: "settings", children: CHILD });
    expect(isValidElement(el)).toBe(true);
    const html = renderToStaticMarkup(el as ReactElement);
    expect(html).toContain("erişim yetkiniz yok");
    expect(html).not.toContain("GİZLİ-İÇERİK");
    expect(h.redirect).not.toHaveBeenCalled();
  });
});
