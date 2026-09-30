/* ===============================================================
   🧹 ESKİ DOMAIN / MARKA / HOSTING KALINTISI KİLİDİ
   ===============================================================
   - Admin bildirim alıcısı YALNIZ env'den (eski adrese fallback YOK).
   - CDN host'ları YALNIZ env'den (eski CDN'e fallback YOK).
   - Site URL YALNIZ NEXT_PUBLIC_SITE_URL (Vercel fallback YOK).
   - Footer marka fallback'i nötr.
   =============================================================== */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
/* Yorumları at → yalnız çalışan kod kontrol edilir. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const MAIL_ROUTES = [
  "app/api/mail/reservation-request/route.ts",
  "app/api/mail/reservation-approved/route.ts",
  "app/api/mail/payment-confirmed/route.ts",
];

describe("eski domain/marka kalıntısı yok", () => {
  it("admin bildirim alıcısı yalnız MAIL_ADMIN_NOTIFY_TO; boşsa atlanır", () => {
    for (const p of MAIL_ROUTES) {
      const c = code(p);
      expect(c).not.toMatch(/villayagel/i);
      expect(c).toContain('(process.env.MAIL_ADMIN_NOTIFY_TO || "").trim()');
      expect(c).toContain("if (adminNotifyTo) {");
    }
  });

  it("next.config.ts eski CDN domain'ine fallback içermez", () => {
    expect(read("next.config.ts")).not.toMatch(/villayagel/i);
  });

  it("site URL üretiminde NEXT_PUBLIC_VERCEL_URL kullanılmaz", () => {
    for (const p of [
      "lib/seo.ts",
      "app/components/seo/StructuredData.tsx",
      "app/robots.ts",
      "app/sitemap.ts",
      "app/components/search/KiralikVillalarPageBody.tsx",
      "app/components/search/kiralik-villalar-metadata.ts",
    ]) {
      expect(read(p)).not.toContain("NEXT_PUBLIC_VERCEL_URL");
      expect(code(p)).toContain("process.env.NEXT_PUBLIC_SITE_URL");
    }
  });

  it("footer marka fallback'i nötr (site_name varsa o kullanılır)", () => {
    const c = code("app/components/layout/FooterWrapper.tsx");
    expect(c).toContain('settings?.site_name || "Villa Kiralama"');
    expect(c).not.toMatch(/villa ?ya ?gel/i);
  });
});
