/* ===============================================================
   🛡️ SEC-05 Phase 2 — TAKİP / ÖZEL SCRIPT ALANLARI YALNIZ PUBLIC
   ===============================================================
   1) SiteTrackingScripts: ham içerik AYNEN basılır (hiçbir takip
      kodu kaybolmaz), GTM yalnız geçerli ID ile (Phase 1 kilidi).
   2) Mimari kilit: root layout ve admin layout'ları bu alanları
      render ETMEZ; public layout, /p layout'u ve 404 render EDER.
   =============================================================== */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/script", () => ({
  default: (p: { id?: string; strategy?: string; children?: string }) => (
    <script id={p.id} data-strategy={p.strategy}>
      {p.children}
    </script>
  ),
}));

import SiteTrackingScripts from "@/app/components/layout/SiteTrackingScripts";
import type { Settings } from "@/app/services/settings.types";

const HEAD =
  '<meta name="x-verify" content="abc"><script async src="https://static.example.test/t.js"></script>';
const ANALYTICS =
  "<script>window.dataLayer=window.dataLayer||[];</script><noscript><img src=\"https://px.example.test/p?id=1\" /></noscript>";

const s = (v: Partial<Settings>) => v as Settings;

describe("SEC-05 P2 — SiteTrackingScripts", () => {
  it("custom head + analytics ham içeriği BİREBİR basılır (sıra: head → GTM → analytics)", () => {
    const html = renderToStaticMarkup(
      <SiteTrackingScripts
        settings={s({
          custom_head_scripts: `  ${HEAD}  `,
          analytics_script: ANALYTICS,
          gtm_container_id: "GTM-ABC1234",
        })}
      />
    );
    expect(html).toContain(`<div>${HEAD}</div>`);
    expect(html).toContain(`<div>${ANALYTICS}</div>`);
    expect(html).toContain('id="gtm-init"');
    expect(html).toContain("'GTM-ABC1234'");
    const iHead = html.indexOf(HEAD);
    const iGtm = html.indexOf("gtm-init");
    const iAn = html.indexOf(ANALYTICS);
    expect(iHead).toBeLessThan(iGtm);
    expect(iGtm).toBeLessThan(iAn);
  });

  it("geçersiz GTM ID → GTM script'i render edilmez (Phase 1 korunur)", () => {
    const html = renderToStaticMarkup(
      <SiteTrackingScripts
        settings={s({ gtm_container_id: "');window.X=1;//" })}
      />
    );
    expect(html).not.toContain("gtm-init");
    expect(html).not.toContain("window.X");
  });

  it("boş / null ayar → hiçbir çıktı yok", () => {
    expect(renderToStaticMarkup(<SiteTrackingScripts settings={null} />)).toBe("");
    expect(
      renderToStaticMarkup(
        <SiteTrackingScripts
          settings={s({
            custom_head_scripts: "   ",
            analytics_script: "",
            gtm_container_id: null,
          })}
        />
      )
    ).toBe("");
  });
});

describe("SEC-05 P2 — mimari kilit (admin'de render yok)", () => {
  const root = process.cwd();
  const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
  /* Yorumları at → yalnız kod satırları kontrol edilir. */
  const code = (p: string) =>
    read(p)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("root app/layout.tsx ham HTML / GTM render etmez", () => {
    const c = code("app/layout.tsx");
    expect(c).not.toContain("dangerouslySetInnerHTML");
    expect(c).not.toContain("gtm-init");
    expect(c).not.toContain("custom_head_scripts");
    expect(c).not.toContain("analytics_script");
    expect(c).not.toContain("SiteTrackingScripts");
  });

  it("admin layout'ları SiteTrackingScripts kullanmaz", () => {
    for (const p of ["app/(admin)/layout.tsx", "app/(admin)/maki-admin/layout.tsx"]) {
      const c = code(p);
      expect(c).not.toContain("SiteTrackingScripts");
      expect(c).not.toContain("custom_head_scripts");
      expect(c).not.toContain("analytics_script");
    }
  });

  it("public layout (normal + bakım dalı), /p layout'u ve 404 render eder", () => {
    const pub = code("app/(public)/layout.tsx");
    expect(pub.match(/<SiteTrackingScripts settings=\{settings\} \/>/g)?.length).toBe(2);
    expect(code("app/p/layout.tsx")).toContain('export { default } from "@/app/(public)/layout"');
    expect(code("app/not-found.tsx")).toContain("<SiteTrackingScripts settings={settings} />");
  });
});
