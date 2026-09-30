/* ===============================================================
   🛡️ NAVIGATION LOCALE PERSISTENCE — REGRESYON TESTLERİ
   ===============================================================
   BUG: Header'dan EN seçilip `/en/...`'e geçildikten sonra başka bir
   sayfaya navigasyon yapıldığında dil TR'ye dönüyordu.

   KÖK NEDEN: Public tarafta locale'in TEK kaynağı URL'dir
   (`localeFromPathname`). Render doğru çalışıyordu; ancak iç linklerin
   bir kısmı canonical TR path'ini SABİT yazıyordu (`href="/"`,
   `href="/teklif-al"`, menü satırlarının `/p/{slug}` · `/arama?...`
   href'leri, `/favoriler`, `/kisa-sureli-tarihler/...` …). `/en/...`
   üzerindeyken bu linklere tıklayan kullanıcı prefix'siz bir TR
   route'una düşüyor → locale "kendiliğinden" TR'ye dönüyordu.

   ÇÖZÜM: `localeHref` (lib/i18n/locale-href.ts) — mevcut
   `buildLocaleAlternates` (Phase 7B) üzerine SAF, ince sarmalayıcı.
   Yeni i18n/routing sistemi, cookie veya middleware YOK.

   KAPSAM:
     A) `localeHref` birim davranışı (idempotent · query · dış link)
     B) Header — logo · CTA · menü · alt menü
     C) Footer — logo · taksonomi · CTA · kurumsal sayfalar
     D) Diğer global navigasyon (BottomNav · favoriler · çerez)
     E) Dil değiştirici hedefleri (TR↔EN↔DE)
     F) SSR/hydration — saf, senkron, storage/cookie YOK
     G) STRUCTURAL INVARIANT — kaynak kilidi (yeni leak eklenirse kırılır)
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { localeHref } from "@/lib/i18n/locale-href";
import { getLocaleSwitchTargets } from "@/lib/i18n/locale-switch.helper";
import { localeFromPathname, SUPPORTED_LOCALES } from "@/lib/i18n/config";

/* ---------------- mock katmanı ---------------- */
const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/app/components/layout/TopBar", () => ({ default: () => null }));
vi.mock("@/app/components/layout/VillaSearchBox", () => ({
  default: () => null,
}));
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: {} }),
}));
vi.mock("@/app/components/favorites/FavoritesContext", () => ({
  useFavorites: () => ({ count: 0, isHydrated: true }),
}));

import Header from "@/app/components/layout/Header";
import Footer from "@/app/components/layout/Footer";

const LOCALES = ["tr", "en", "de"] as const;
type L = (typeof LOCALES)[number];
/** Aktif locale için beklenen prefix. */
const PREFIX: Record<L, string> = { tr: "", en: "/en", de: "/de" };
/** O locale'in "bulunduğu sayfa" pathname'i. */
const ON_PAGE: Record<L, string> = {
  tr: "/kiralik-villa/villa-lorien",
  en: "/en/kiralik-villa/villa-lorien",
  de: "/de/kiralik-villa/villa-lorien",
};

const MENU = [
  {
    id: "m1",
    name: "Kurumsal",
    href: "/p/hakkimizda",
    source_type: "page",
    children: [
      {
        id: "m1c1",
        name: "Villa Tipleri",
        href: "/arama?villa-turleri=balayi",
        source_type: "category",
        children: [],
      },
    ],
  },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
});

function href(el: Element | null): string {
  return el?.getAttribute("href") ?? "";
}
function allHrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("a[href]"))
    .map((a) => a.getAttribute("href") || "")
    .filter((h) => h.startsWith("/"));
}

/* ===============================================================
   A) localeHref — birim davranışı
   =============================================================== */
describe("localeHref — birim davranışı", () => {
  it("1) TR çıktısı GİRDİYLE BİREBİR AYNI (canonical route korunur)", () => {
    for (const p of ["/", "/teklif-al", "/p/x", "/arama?a=1", "/blog/y"]) {
      expect(localeHref(p, "tr")).toBe(p);
    }
  });

  it("2) EN/DE prefix uygular; kök için çifte slash üretmez", () => {
    expect(localeHref("/", "en")).toBe("/en");
    expect(localeHref("/", "de")).toBe("/de");
    expect(localeHref("/teklif-al", "en")).toBe("/en/teklif-al");
    expect(localeHref("/p/hakkimizda", "de")).toBe("/de/p/hakkimizda");
  });

  it("3) query ve hash AYNEN taşınır (kontrat değişmez)", () => {
    expect(localeHref("/arama?villa-turleri=balayi&flexible=3", "en")).toBe(
      "/en/arama?villa-turleri=balayi&flexible=3"
    );
    expect(localeHref("/arama#sonuc", "de")).toBe("/de/arama#sonuc");
    expect(localeHref("/?a=1", "en")).toBe("/en?a=1");
  });

  it("4) idempotent — zaten prefix'li path yeniden prefix'lenmez", () => {
    expect(localeHref("/en/blog", "en")).toBe("/en/blog");
    expect(localeHref("/en/blog", "de")).toBe("/de/blog");
    expect(localeHref("/de/blog", "tr")).toBe("/blog");
  });

  it("5) dış bağlantı / özel şema AYNEN korunur", () => {
    for (const p of [
      "https://example.com/x",
      "//cdn.example.com/a.png",
      "mailto:a@b.c",
      "tel:+905555555555",
      "#hero",
      "",
    ]) {
      expect(localeHref(p, "en")).toBe(p);
    }
    expect(localeHref(null, "en")).toBe("");
    expect(localeHref(undefined, "de")).toBe("");
  });
});

/* ===============================================================
   B) HEADER — navigasyon locale'i kaybetmiyor
   =============================================================== */
describe("Header — iç linkler aktif locale'i taşır", () => {
  it.each(LOCALES)("6) %s: logo · CTA · menü · alt menü doğru prefix", (loc) => {
    usePathnameMock.mockReturnValue(ON_PAGE[loc]);
    const { container } = render(
      <Header menu={MENU} siteLogo={null} />
    );
    const p = PREFIX[loc];

    /* Logo → ana sayfa */
    expect(href(container.querySelector('a[href="' + (p || "/") + '"]'))).toBe(
      p || "/"
    );
    /* CTA "Teklif Al" */
    expect(
      container.querySelector(`a[href="${p}/teklif-al"]`)
    ).toBeTruthy();
    /* Menü (page) + alt menü (category, query'li) */
    expect(
      container.querySelector(`a[href="${p}/p/hakkimizda"]`)
    ).toBeTruthy();
    expect(
      container.querySelector(
        `a[href="${p}/arama?villa-turleri=balayi"]`
      )
    ).toBeTruthy();
  });

  it("7) EN'de HİÇBİR iç link prefix'siz TR route'una gitmiyor", () => {
    usePathnameMock.mockReturnValue(ON_PAGE.en);
    const { container } = render(<Header menu={MENU} siteLogo={null} />);
    for (const h of allHrefs(container)) {
      expect(h, `prefix'siz link: ${h}`).toMatch(/^\/en(\/|$|\?)/);
    }
  });

  it("8) DE'de HİÇBİR iç link prefix'siz TR route'una gitmiyor", () => {
    usePathnameMock.mockReturnValue(ON_PAGE.de);
    const { container } = render(<Header menu={MENU} siteLogo={null} />);
    for (const h of allHrefs(container)) {
      expect(h, `prefix'siz link: ${h}`).toMatch(/^\/de(\/|$|\?)/);
    }
  });

  it("9) TR'de linkler canonical (prefix'siz) KALIR — TR davranışı değişmedi", () => {
    usePathnameMock.mockReturnValue(ON_PAGE.tr);
    const { container } = render(<Header menu={MENU} siteLogo={null} />);
    for (const h of allHrefs(container)) {
      expect(h).not.toMatch(/^\/(en|de)(\/|$)/);
    }
    expect(container.querySelector('a[href="/teklif-al"]')).toBeTruthy();
    expect(container.querySelector('a[href="/p/hakkimizda"]')).toBeTruthy();
  });
});

/* ===============================================================
   C) FOOTER
   =============================================================== */
describe("Footer — iç linkler aktif locale'i taşır", () => {
  const footerProps = {
    settings: null,
    locations: [{ id: "l1", name: "Kalkan", slug: "kalkan" }],
    villaTypes: [{ id: "t1", name: "Balayı Villası", slug: "balayi-villasi" }],
    corporatePages: [{ id: "p1", title: "Hakkımızda", slug: "hakkimizda" }],
    year: 2026,
    siteName: "Villa Kiralama",
    phoneDigits: "905555555555",
    /* `Settings` / `TaxonomyItem` tipleri bu testin konusu DEĞİL —
       yalnız link üretimi doğrulanır; tam shape yerine component'in
       prop tipine daraltılır. */
  } as unknown as React.ComponentProps<typeof Footer>;

  it.each(["en", "de"] as const)(
    "10) %s: footer iç linklerinin TAMAMI prefix'li",
    (loc) => {
      usePathnameMock.mockReturnValue(ON_PAGE[loc]);
      const { container } = render(<Footer {...footerProps} />);
      const hrefs = allHrefs(container);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const h of hrefs) {
        expect(h, `prefix'siz link: ${h}`).toMatch(
          new RegExp(`^/${loc}(/|$|\\?)`)
        );
      }
    }
  );

  it("11) TR: footer linkleri canonical kalır", () => {
    usePathnameMock.mockReturnValue(ON_PAGE.tr);
    const { container } = render(<Footer {...footerProps} />);
    for (const h of allHrefs(container)) {
      expect(h).not.toMatch(/^\/(en|de)(\/|$)/);
    }
  });
});

/* ===============================================================
   D) DİL DEĞİŞTİRİCİ — TR ↔ EN ↔ DE
   =============================================================== */
describe("Dil değiştirici hedefleri", () => {
  it("12) TR → EN / DE: aynı içeriğin locale karşılığı", () => {
    const t = getLocaleSwitchTargets("/kiralik-villa/villa-lorien");
    expect(t.tr).toBe("/kiralik-villa/villa-lorien");
    expect(t.en).toBe("/en/kiralik-villa/villa-lorien");
    expect(t.de).toBe("/de/kiralik-villa/villa-lorien");
  });

  it("13) EN → DE ve DE → EN: aynı sayfada kalır (mapping korunur)", () => {
    expect(getLocaleSwitchTargets("/en/blog/kalkan-rehberi").de).toBe(
      "/de/blog/kalkan-rehberi"
    );
    expect(getLocaleSwitchTargets("/de/blog/kalkan-rehberi").en).toBe(
      "/en/blog/kalkan-rehberi"
    );
  });

  it("14) EN → TR: canonical TR route'una döner", () => {
    expect(getLocaleSwitchTargets("/en/teklif-al").tr).toBe("/teklif-al");
  });

  it("15) query korunur (mevcut /arama davranışı BOZULMADI)", () => {
    const t = getLocaleSwitchTargets("/arama", "villa-turleri=balayi&flexible=3");
    expect(t.en).toBe("/en/arama?villa-turleri=balayi&flexible=3");
    expect(t.de).toBe("/de/arama?villa-turleri=balayi&flexible=3");
  });

  it("16) hedef, o locale'de GEÇERLİ bir route'tur (switch → yeni sayfa → locale korunur)", () => {
    const t = getLocaleSwitchTargets("/kisa-sureli-tarihler/haziran/3");
    expect(localeFromPathname(t.en)).toBe("en");
    expect(localeFromPathname(t.de)).toBe("de");
    expect(localeFromPathname(t.tr)).toBe("tr");
  });
});

/* ===============================================================
   E) "SEÇ → GEZİN → KORUNUYOR" UÇTAN UCA ZİNCİR
   =============================================================== */
describe("Uçtan uca: locale seç → navigasyon → locale korunuyor", () => {
  it.each([
    ["tr", "en"],
    ["tr", "de"],
    ["en", "de"],
    ["de", "en"],
    ["en", "tr"],
  ] as const)(
    "17) %s → %s seçildi → sonraki iç linkler hedef locale'de",
    (from, to) => {
      /* 1) Kullanıcı `from` locale'indeki bir sayfada. */
      const target = getLocaleSwitchTargets(ON_PAGE[from])[to];
      /* 2) Dil değiştiriciden `to` seçildi → yeni pathname. */
      expect(localeFromPathname(target)).toBe(to);

      /* 3) Yeni sayfada Header render edilir; iç linkler `to` taşımalı. */
      usePathnameMock.mockReturnValue(target);
      const { container } = render(<Header menu={MENU} siteLogo={null} />);
      const p = PREFIX[to];
      expect(container.querySelector(`a[href="${p}/teklif-al"]`)).toBeTruthy();

      /* 4) Kullanıcı o linke tıklayıp gitseydi locale yine `to` olurdu. */
      expect(localeFromPathname(`${p}/teklif-al`)).toBe(to);
    }
  );

  it("18) refresh (aynı URL yeniden render) → locale AYNI kalır", () => {
    for (const loc of LOCALES) {
      usePathnameMock.mockReturnValue(ON_PAGE[loc]);
      const { container, unmount } = render(
        <Header menu={MENU} siteLogo={null} />
      );
      const p = PREFIX[loc];
      expect(container.querySelector(`a[href="${p}/teklif-al"]`)).toBeTruthy();
      unmount();
      /* İkinci render (refresh) → BİREBİR aynı sonuç (state'siz). */
      usePathnameMock.mockReturnValue(ON_PAGE[loc]);
      const again = render(<Header menu={MENU} siteLogo={null} />);
      expect(
        again.container.querySelector(`a[href="${p}/teklif-al"]`)
      ).toBeTruthy();
      again.unmount();
    }
  });

  it("19) çok adımlı gezinti: /en → menü → /en/p/... → CTA → /en/teklif-al", () => {
    usePathnameMock.mockReturnValue("/en");
    const first = render(<Header menu={MENU} siteLogo={null} />);
    const menuHref = href(
      first.container.querySelector('a[href^="/en/p/"]')
    );
    expect(menuHref).toBe("/en/p/hakkimizda");
    first.unmount();

    usePathnameMock.mockReturnValue(menuHref);
    const second = render(<Header menu={MENU} siteLogo={null} />);
    expect(
      second.container.querySelector('a[href="/en/teklif-al"]')
    ).toBeTruthy();
    expect(localeFromPathname(menuHref)).toBe("en");
  });
});

/* ===============================================================
   F) SSR / HYDRATION GÜVENLİĞİ
   =============================================================== */
describe("SSR / hydration güvenliği", () => {
  it("20) `localeHref` saf ve deterministik — iki çağrı aynı sonucu verir", () => {
    for (const loc of SUPPORTED_LOCALES) {
      const a = localeHref("/arama?x=1", loc);
      const b = localeHref("/arama?x=1", loc);
      expect(a).toBe(b);
    }
  });

  it("21) locale-href kaynağında cookie/localStorage/window/Date/random YOK", () => {
    /* Yalnız KOD taranır — bu dosyanın kendi açıklama yorumları
       ("cookie/localStorage KULLANILMAZ …") sahte pozitif üretmesin. */
    const src = stripComments(
      fs.readFileSync(
        path.join(process.cwd(), "lib/i18n/locale-href.ts"),
        "utf-8"
      )
    );
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "document.cookie",
      "window.",
      "Math.random",
      "Date.now",
      "useState",
      "useEffect",
      "headers(",
      "cookies(",
    ]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });
});

/* ===============================================================
   G) STRUCTURAL INVARIANT — KAYNAK KİLİDİ
   ---------------------------------------------------------------
   "Public bir bileşende yazılan iç link, aktif locale'i taşımalıdır."
   Yeni bir prefix'siz `href="/..."` eklenirse bu test KIRILIR.
   =============================================================== */
const ROOT = process.cwd();

/** Bilinçli canonical (locale prefix'i ALMAMASI GEREKEN) yerler. */
const INTENTIONAL_CANONICAL: Record<string, string[]> = {
  /* TR-only route'ların kendi inline blokları. */
  "app/(public)/kiralik-villa/[slug]/page.tsx": ["/arama"],
  "app/p/[slug]/page.tsx": ["/"],
  /* Menü href ÜRETİCİLERİ canonical kalır — locale, Header/Footer
     render'ında `localeHref` ile uygulanır (tek kaynak korunur). */
  "lib/menu-resolver.ts": [
    "/p/${p.slug}",
    "/arama?villa-turleri=${encodeURIComponent(token)}",
    "/arama?bolgeler=${encodeURIComponent(token)}",
  ],
  "app/services/menu.service.ts": ["/p/${p.slug}"],
  /* 🔄 VARSAYILAN DİL — `trHomeHref` bir LİNK DEĞİL, TR ana sayfanın
     KANONİK YOLUDUR ve tanımı gereği prefix'siz olmalıdır ("/" veya
     "/tr"). Buradaki "/" yalnızca fail-safe başlangıç değeridir;
     gerçek değer `resolvePublicHome(settings)`'ten gelir ve Header'a
     prop olarak geçer (Header bunu `locale === DEFAULT_LOCALE`
     dalında kullanır, EN/DE'de `localeHref` devrede kalır).
     Kural GEVŞETİLMEDİ — yalnız bu dosya + bu tek değer muaf. */
  "app/components/layout/HeaderWrapper.tsx": ["/"],
};

const HREF_PATTERNS = [
  /href=(?:"(\/[^"]*)"|\{`(\/[^`]*)`\}|\{"(\/[^"]*)"\})/g,
  /href:\s*(?:"(\/[^"]*)"|`(\/[^`]*)`)/g,
  /router\.(?:push|replace)\(\s*(?:"(\/[^"]*)"|`(\/[^`]*)`)/g,
  /\b(?:const|let)\s+\w*[Hh]ref\w*\s*(?::[^=]+)?=\s*(?:"(\/[^"]*)"|`(\/[^`]*)`)/g,
];

/** Blok + satır yorumlarını temizler (satır numaraları korunur). */
function stripComments(src: string): string {
  const out: string[] = [];
  let i = 0;
  let state: "code" | "block" | "line" = "code";
  while (i < src.length) {
    const ch = src[i];
    if (state === "code") {
      if (src.startsWith("/*", i)) {
        state = "block";
        i += 2;
        continue;
      }
      if (src.startsWith("//", i)) {
        state = "line";
        i += 2;
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }
    if (state === "block") {
      if (src.startsWith("*/", i)) {
        state = "code";
        i += 2;
        continue;
      }
      out.push(ch === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }
    if (ch === "\n") {
      state = "code";
      out.push("\n");
      i += 1;
      continue;
    }
    out.push(" ");
    i += 1;
  }
  return out.join("");
}

/* 🛡️ Taranacak dosyalar ELLE listelenmez — public reachability
   kapanışı TEST ZAMANINDA hesaplanır (admin ve ölü kod otomatik
   dışarıda kalır; `public-tr-leak-forensic.test.ts` ile AYNI ilke). */
function publicReachability(): string[] {
  const EXT = [".ts", ".tsx"];
  const seeds: string[] = [];
  const walkSeeds = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = `${dir}/${e.name}`;
      if (rel.includes("(admin)") || rel.includes("/api")) continue;
      if (e.isDirectory()) walkSeeds(rel);
      else if (/^(page|layout|not-found|error|template)\.tsx$/.test(e.name)) {
        seeds.push(rel);
      }
    }
  };
  walkSeeds("app");

  const resolve = (spec: string, from: string): string | null => {
    let cand: string;
    if (spec.startsWith("@/")) cand = spec.slice(2);
    else if (spec.startsWith(".")) {
      cand = path.posix.normalize(
        path.posix.join(path.posix.dirname(from), spec)
      );
    } else return null;
    for (const e of EXT) {
      if (fs.existsSync(path.join(ROOT, cand + e))) return cand + e;
    }
    for (const e of EXT) {
      const idx = `${cand}/index${e}`;
      if (fs.existsSync(path.join(ROOT, idx))) return idx;
    }
    return null;
  };

  const IMPORT = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  const seen = new Set<string>();
  const stack = [...new Set(seeds)];
  while (stack.length > 0) {
    const f = stack.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    let src: string;
    try {
      src = fs.readFileSync(path.join(ROOT, f), "utf-8");
    } catch {
      continue;
    }
    IMPORT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT.exec(src)) !== null) {
      const r = resolve(m[1], f);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return [...seen].sort();
}

describe("STRUCTURAL INVARIANT — prefix'siz iç link eklenemez", () => {
  it("22) public navigasyonda beyaz listede olmayan prefix'siz iç link YOK", () => {
    const files = publicReachability();
    /* Kapanış makul büyüklükte olmalı (elle liste kullanılmıyor). */
    expect(files.length).toBeGreaterThan(150);
    expect(files.some((f) => f.includes("(admin)"))).toBe(false);

    const offenders: string[] = [];
    for (const rel of files) {
      if (rel === "lib/i18n/locale-href.ts") continue; // helper'ın kendisi
      let src: string;
      try {
        src = stripComments(fs.readFileSync(path.join(ROOT, rel), "utf-8"));
      } catch {
        continue;
      }
      const allow = INTENTIONAL_CANONICAL[rel] ?? [];
      for (const line of src.split("\n")) {
        for (const re of HREF_PATTERNS) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(line)) !== null) {
            const url = m.slice(1).find((g) => g && g.startsWith("/"));
            if (!url) continue;
            if (
              url.startsWith("//") ||
              url.startsWith("/en") ||
              url.startsWith("/de") ||
              url.startsWith("/api/")
            ) {
              continue;
            }
            if (allow.includes(url)) continue;
            offenders.push(`${rel} → ${url}`);
          }
        }
      }
    }
    expect(
      offenders,
      `Prefix'siz iç link bulundu (localeHref(...) kullanın):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("23) tarayıcı GERÇEKTEN çalışıyor — bilinen eski hatalar yakalanır", () => {
    const sample = [
      '          <Link href="/teklif-al" className="x">',
      '  href: "/",',
      "  router.push(`/kiralik-villa/${slug}`);",
    ];
    const found: string[] = [];
    for (const line of sample) {
      for (const re of HREF_PATTERNS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const url = m.slice(1).find((g) => g && g.startsWith("/"));
          if (url) found.push(url);
        }
      }
    }
    expect(found).toContain("/teklif-al");
    expect(found).toContain("/");
    expect(found).toContain("/kiralik-villa/${slug}");
  });
});
