/* ===============================================================
   🛡️ PHASE 12 — MAKI ADMIN / PAGES I18N TESTLERİ (Seçenek A)
   ===============================================================
   KAPSAM:
     1) `admin` namespace'inin TR/EN/DE bütünlüğü (aynı key ağacı,
        boş değer yok)
     2) TR BYTE-IDENTITY — dictionary değerleri Phase 12 ÖNCESİNDEKİ
        hardcoded metinlerin BİREBİR kopyası mı? (U+2026 "…",
        U+2014 "—", kesme işareti dahil). Bu test dosyası referans
        metinleri BAĞIMSIZ olarak taşır — dictionary'den türetmez.
     3) SOURCE-LOCK — 3 Pages route dosyasında (yorumlar STRIP
        edildikten sonra) hardcoded Türkçe karakter KALMAMALI.
     4) Render — list / new / [id] ekranlarındaki metinler
        dictionary'den geliyor mu?
     5) `formatDictionaryString` — `{url}` / `{hint}` parametreli
        4 key doğru yerleşiyor mu? (TR/EN/DE)

   BU FAZDA admin'de locale KAYNAĞI YOK: call-site'lar bilinçli
   olarak `DEFAULT_LOCALE` kullanır, bu yüzden render testleri TR
   metinleri bekler (davranış Phase 12 öncesiyle aynı).
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/* ===============================================================
   MOCK KATMANI — i18n DIŞINDAKİ her şey stub'lanır. CRUD/upload/
   routing davranışı bu testlerin konusu DEĞİL.
   =============================================================== */

const adminFetchMock = vi.fn();
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
}));

const notifyErrorMock = vi.fn();
const notifySuccessMock = vi.fn();
const confirmMock = vi.fn().mockResolvedValue(false);
vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({
    success: notifySuccessMock,
    error: notifyErrorMock,
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
  useConfirm: () => confirmMock,
}));

vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateMenu: vi.fn().mockResolvedValue(undefined),
  revalidateTaxonomy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/activity-log.client", () => ({
  logActivity: vi.fn(),
}));

const useParamsMock = vi.fn(() => ({ id: "page-1" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => useParamsMock(),
  usePathname: () => "/maki-admin/pages",
}));

vi.mock("@/lib/storage", () => ({
  storageProvider: { upload: vi.fn() },
}));

vi.mock("@/lib/storage.helpers", () => ({
  getPageCoverPublicUrl: () => null,
  buildPageCoverPath: () => "pages/x.webp",
  SITE_ASSETS_BUCKET_NAME: "site-assets",
}));

vi.mock("@/lib/image.helpers", () => ({
  convertImageToWebP: vi.fn(),
}));

import AdminPagesList from "@/app/(admin)/maki-admin/pages/page";
import NewPagePage from "@/app/(admin)/maki-admin/pages/new/page";
import EditPagePage from "@/app/(admin)/maki-admin/pages/[id]/page";

/* ===============================================================
   YARDIMCI — yorum strip (Phase 11 `public-layout-locale.test.tsx`
   ile AYNI ilke; o dosyadan bağımsız, lokal kopya).
   =============================================================== */
function stripComments(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  let state: "code" | "block" | "line" = "code";
  while (i < n) {
    const c = src[i];
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
      if (c === '"' || c === "'" || c === "`") {
        const q = c;
        out.push(c);
        i += 1;
        while (i < n) {
          if (src[i] === "\\") {
            out.push(src[i]);
            if (i + 1 < n) out.push(src[i + 1]);
            i += 2;
            continue;
          }
          out.push(src[i]);
          if (src[i] === q) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      out.push(c);
      i += 1;
      continue;
    }
    if (state === "block") {
      if (src.startsWith("*/", i)) {
        state = "code";
        i += 2;
        continue;
      }
      out.push(c === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }
    if (c === "\n") {
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

function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}

function leafValues(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (typeof obj !== "object" || obj === null) return [];
  return Object.values(obj as Record<string, unknown>).flatMap(leafValues);
}

const ROUTE_FILES = [
  "app/(admin)/maki-admin/pages/page.tsx",
  "app/(admin)/maki-admin/pages/new/page.tsx",
  "app/(admin)/maki-admin/pages/[id]/page.tsx",
];

function readRoute(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
}

function okJson(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useParamsMock.mockReturnValue({ id: "page-1" });
});

/* ===============================================================
   1) DICTIONARY BÜTÜNLÜĞÜ
   =============================================================== */
describe("Phase 12 — admin namespace bütünlüğü", () => {
  it("TR/EN/DE'de `admin` namespace'i mevcut", () => {
    expect(tr.admin).toBeTruthy();
    expect(en.admin).toBeTruthy();
    expect(de.admin).toBeTruthy();
  });

  it("üç dilde AYNI key ağacı (leaf path'leri birebir eşit)", () => {
    const trPaths = leafPaths(tr.admin).sort();
    const enPaths = leafPaths(en.admin).sort();
    const dePaths = leafPaths(de.admin).sort();
    expect(enPaths).toEqual(trPaths);
    expect(dePaths).toEqual(trPaths);
  });

  it("hiçbir dilde boş/whitespace değer yok", () => {
    for (const [name, dict] of [
      ["tr", tr],
      ["en", en],
      ["de", de],
    ] as const) {
      const values = leafValues(dict.admin);
      expect(values.length).toBeGreaterThan(80);
      for (const v of values) {
        expect(typeof v, name).toBe("string");
        expect(v.trim().length, `${name}: "${v}"`).toBeGreaterThan(0);
      }
    }
  });

  it("`getDictionary(DEFAULT_LOCALE).admin` TR sözlüğünü döner", () => {
    expect(getDictionary(DEFAULT_LOCALE).admin).toBe(tr.admin);
  });

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — `common` namespace'ine 3 PUBLIC
     anahtar eklendi (`searching`, `carouselPrev`, `carouselNext`:
     VillaSearchBox + HorizontalCarousel). Bu testin amacı "admin
     namespace'i public `common`'ı KİRLETMESİN" — o kural GEÇERLİ. */
  it("public `common.*` namespace'i KİRLETİLMEDİ (key seti aynı)", () => {
    expect(Object.keys(tr.common).sort()).toEqual(
      [
        "back",
        "cancel",
        "carouselNext",
        "carouselPrev",
        "checkAvailability",
        "close",
        "continue",
        "error",
        "language",
        "loading",
        "next",
        "perNight",
        "previous",
        "save",
        "search",
        "searching",
        "success",
        "viewAll",
      ].sort()
    );
    /* `common.save` admin'de YENİDEN KULLANILIYOR → değeri değişmemeli. */
    expect(tr.common.save).toBe("Kaydet");
    /* `common.loading` admin varyantıyla BYTE-IDENTICAL DEĞİL. */
    expect(tr.common.loading).toBe("Yükleniyor");
    expect(tr.admin.common.loadingEllipsis).toBe("Yükleniyor…");
    expect(tr.admin.common.loadingEllipsis).not.toBe(tr.common.loading);
  });
});

/* ===============================================================
   2) TR BYTE-IDENTITY — bağımsız referans metinler
   =============================================================== */
describe("Phase 12 — TR byte-identity", () => {
  const EXPECTED: Array<[string, string]> = [
    ["admin.common.loadingEllipsis", "Yükleniyor…"],
    ["admin.common.saving", "Kaydediliyor…"],
    ["admin.common.deleting", "Siliniyor…"],
    ["admin.common.delete", "Sil"],
    ["admin.common.edit", "Düzenle"],
    ["admin.common.moveUp", "Yukarı"],
    ["admin.common.moveDown", "Aşağı"],
    ["admin.common.networkError", "Network hatası"],
    ["admin.common.requestFailed", "İstek başarısız"],
    ["admin.common.updateFailed", "Güncellenemedi"],
    ["admin.common.saveFailed", "Kaydedilemedi"],
    ["admin.common.unknownError", "Bilinmeyen hata"],
    [
      "admin.common.unknownErrorCheckNetwork",
      "Bilinmeyen hata — Network tab'a bakın.",
    ],
    [
      "admin.common.networkOrRuntimeError",
      "Network veya runtime hatası — DevTools Network tab'a bakın.",
    ],
    ["admin.pages.list.eyebrow", "İçerik"],
    ["admin.pages.list.title", "Sayfalar"],
    [
      "admin.pages.list.subtitle",
      "Hakkımızda, Gizlilik gibi statik sayfaları yönet.",
    ],
    ["admin.pages.list.newPageCta", "Yeni Sayfa"],
    ["admin.pages.list.emptyTitle", "Henüz sayfa yok"],
    [
      "admin.pages.list.emptyDescription",
      "İlk sayfanı eklemek için yukarıdaki butonu kullan.",
    ],
    ["admin.pages.list.view", "Gör"],
    ["admin.pages.list.inMenu", "Menüde"],
    ["admin.pages.list.addToMenu", "Menüye Ekle"],
    ["admin.pages.list.removeFromMenu", "Menüden kaldır"],
    ["admin.pages.list.addToTopMenu", "Üst menüye ekle"],
    ["admin.pages.form.newTitle", "Yeni sayfa"],
    [
      "admin.pages.form.newSubtitle",
      "Premium editorial CMS — hero, içerik, sections.",
    ],
    ["admin.pages.form.editTitle", "Sayfayı düzenle"],
    ["admin.pages.form.editSubtitle", "Başlık, içerik, SEO ve yayın durumu."],
    ["admin.pages.form.viewPage", "Sayfayı görüntüle"],
    ["admin.pages.form.backToList", "Sayfa listesine dön"],
    ["admin.pages.form.fieldTitle", "Başlık"],
    ["admin.pages.form.titlePlaceholder", "Örn: Hakkımızda"],
    ["admin.pages.form.fieldSlug", "Slug"],
    ["admin.pages.form.slugPlaceholder", "hakkimizda"],
    ["admin.pages.form.fieldExcerpt", "Kısa açıklama (excerpt)"],
    [
      "admin.pages.form.excerptPlaceholder",
      "Hero altında küçük açıklama metni…",
    ],
    ["admin.pages.form.fieldCover", "Kapak görseli (opsiyonel)"],
    ["admin.pages.form.slugRequiredFirst", "Önce slug girin"],
    ["admin.pages.form.uploadOrReplaceImage", "Görsel yükle/değiştir"],
    ["admin.pages.form.removeCover", "Kapağı kaldır"],
    [
      "admin.pages.form.coverHint",
      "Otomatik WebP, max 1920px. Aynı slug için overwrite.",
    ],
    [
      "admin.pages.form.fieldBody",
      "İçerik (sade — paragraph'lar boş satırla ayrılır)",
    ],
    ["admin.pages.form.bodyPlaceholder", "Sayfa metni…"],
    [
      "admin.pages.form.bodyHint",
      "Aşağıda section ekleyebilirsiniz. Section eklenmişse bu alan gizlenir; sadece sections render edilir.",
    ],
    [
      "admin.pages.form.editBodyHint",
      "Bu sayfaya daha önce bölüm (section) eklenmişse içerik korunur ve herkese görünür kalır; buradan yalnız ana metin alanı düzenlenir.",
    ],
    ["admin.pages.form.seoHeading", "SEO"],
    ["admin.pages.form.seoTitleLabel", "SEO Title (boş → sayfa başlığı)"],
    ["admin.pages.form.seoDescriptionLabel", "SEO Description"],
    ["admin.pages.form.noindexLabel", "noindex (arama motorlarına gösterme)"],
    ["admin.pages.form.showInMenuLabel", "Menüde Göster (üst menüye ekle)"],
    ["admin.pages.sections.label", "Bölümler (opsiyonel, sıralı)"],
    ["admin.pages.sections.typeRichtext", "Metin"],
    ["admin.pages.sections.typeImage", "Görsel"],
    ["admin.pages.sections.typeQuote", "Alıntı"],
    ["admin.pages.sections.empty", "Henüz bölüm yok. Yukarıdan ekleyin."],
    [
      "admin.pages.sections.richtextPlaceholder",
      "Metin… (paragraph'lar boş satırla)",
    ],
    [
      "admin.pages.sections.imageHint",
      "WebP, max 1920px. Section başına deterministik path.",
    ],
    [
      "admin.pages.sections.altTextPlaceholder",
      "Alt metin (SEO + erişilebilirlik)",
    ],
    ["admin.pages.sections.quoteTextPlaceholder", "Alıntı metni…"],
    ["admin.pages.sections.quoteAuthorPlaceholder", "Yazar (opsiyonel)"],
    ["admin.pages.publish.heading", "Yayın"],
    ["admin.pages.publish.published", "Yayında"],
    ["admin.pages.publish.draft", "Taslakta"],
    ["admin.pages.publish.publishTitle", "Yayına al"],
    ["admin.pages.publish.unpublishTitle", "Yayından kaldır (taslak)"],
    ["admin.pages.publish.showInTopMenu", "Üst menüde göster"],
    ["admin.pages.toast.listFailed", "Sayfa listesi yüklenemedi"],
    ["admin.pages.toast.publishFailed", "Yayın durumu güncellenemedi"],
    ["admin.pages.toast.published", "Yayına alındı"],
    ["admin.pages.toast.drafted", "Taslağa alındı"],
    ["admin.pages.toast.deleteFailed", "Sayfa silinemedi"],
    ["admin.pages.toast.deleted", "Sayfa silindi"],
    ["admin.pages.toast.menuAdded", "Menüye eklendi"],
    ["admin.pages.toast.menuRemoved", "Menüden kaldırıldı"],
    ["admin.pages.toast.imageUploadFailed", "Görsel yüklenemedi"],
    ["admin.pages.toast.coverUploaded", "Kapak yüklendi"],
    ["admin.pages.toast.imageAdded", "Görsel eklendi"],
    ["admin.pages.toast.titleSlugRequired", "Başlık ve slug zorunlu"],
    ["admin.pages.toast.saveFailed", "Sayfa kaydedilemedi"],
    ["admin.pages.toast.saveFailedRuntime", "Sayfa kaydedilemedi (runtime)"],
    ["admin.pages.toast.created", "Sayfa oluşturuldu"],
    ["admin.pages.toast.loadFailed", "Sayfa yüklenemedi"],
    ["admin.pages.toast.updated", "Sayfa güncellendi"],
    ["admin.pages.confirm.deleteTitle", "Sayfa silinsin mi?"],
    [
      "admin.pages.confirm.deleteDescription",
      "Bu işlem geri alınamaz. Sayfa yayından kaldırılır ve menü bağlantıları etkilenebilir.",
    ],
    ["admin.pages.confirm.deleteLabel", "Sayfayı Sil"],
    ["admin.pages.notFound.title", "Sayfa bulunamadı"],
    [
      "admin.pages.notFound.description",
      "Bu sayfa silinmiş ya da geçersiz bir bağlantı kullanılmış olabilir.",
    ],
  ];

  it("TR değerleri Phase 12 öncesi metinlerle BİREBİR aynı", () => {
    for (const [keyPath, expected] of EXPECTED) {
      const value = keyPath
        .split(".")
        .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], tr);
      expect(value, keyPath).toBe(expected);
    }
  });

  it("parametreli TR şablonları BİREBİR aynı ({url} / {hint})", () => {
    expect(tr.admin.common.hintPrefix).toBe("İpucu: {hint}");
    expect(tr.admin.pages.form.slugChangedWarning).toBe(
      "Slug değişti — eski URL ({url}) artık çalışmayacak."
    );
    expect(tr.admin.pages.publish.hint).toBe(
      "Kapatılırsa {url} 404 döner; SEO indexinden düşer. İçerik silinmez."
    );
    expect(tr.admin.pages.publish.showInMenuHint).toBe(
      "Header menüsünde görünür. Kapalıyken sayfa {url} üzerinden direkt erişilebilir."
    );
  });

  it("referans listesi TR leaf'lerinin TAMAMINI kapsıyor (parametreliler hariç)", () => {
    const templated = new Set([
      "admin.common.hintPrefix",
      "admin.pages.form.slugChangedWarning",
      "admin.pages.publish.hint",
      "admin.pages.publish.showInMenuHint",
    ]);
    const all = leafPaths(tr.admin).map((p) => `admin.${p}`);
    const covered = new Set(EXPECTED.map(([k]) => k));
    const missing = all.filter((p) => !covered.has(p) && !templated.has(p));
    expect(missing).toEqual([]);
  });
});

/* ===============================================================
   3) EN / DE TAMLIĞI
   =============================================================== */
describe("Phase 12 — EN/DE çeviri kalitesi", () => {
  /* Türkçeye ÖZGÜ karakterler (ö/ü Almancada da var → EN ve DE için
     ayrı sınıflar). */
  const TR_ONLY = /[çÇğĞıİşŞ]/;
  const TR_EN = /[çÇğĞıİöÖşŞüÜ]/;

  it("EN değerlerinde Türkçe karakter yok", () => {
    for (const v of leafValues(en.admin)) {
      expect(TR_EN.test(v), `EN: "${v}"`).toBe(false);
    }
  });

  it("DE değerlerinde Türkçeye özgü karakter yok", () => {
    for (const v of leafValues(de.admin)) {
      expect(TR_ONLY.test(v), `DE: "${v}"`).toBe(false);
    }
  });

  it("EN/DE, TR'nin kopyası değil (dilden bağımsız terimler hariç)", () => {
    /* Üç dilde de aynı kalması BEKLENEN, dilden bağımsız terimler. */
    const LANGUAGE_NEUTRAL = new Set([
      "pages.form.fieldSlug",
      "pages.form.seoHeading",
      "pages.form.seoDescriptionLabel",
    ]);
    const paths = leafPaths(tr.admin);
    let differing = 0;
    for (const p of paths) {
      if (LANGUAGE_NEUTRAL.has(p)) continue;
      const get = (d: unknown) =>
        p.split(".").reduce<unknown>(
          (acc, k) => (acc as Record<string, unknown>)[k],
          (d as { admin: unknown }).admin
        );
      const t = get(tr);
      if (get(en) !== t) differing += 1;
    }
    /* Neredeyse tüm key'ler farklı olmalı; eşik savunmacı. */
    expect(differing).toBeGreaterThan(paths.length - 8);
  });

  it("parametreli şablonlar EN/DE'de de placeholder'ı KORUYOR", () => {
    for (const d of [en, de]) {
      expect(d.admin.common.hintPrefix).toContain("{hint}");
      expect(d.admin.pages.form.slugChangedWarning).toContain("{url}");
      expect(d.admin.pages.publish.hint).toContain("{url}");
      expect(d.admin.pages.publish.showInMenuHint).toContain("{url}");
    }
  });
});

/* ===============================================================
   4) SOURCE-LOCK
   =============================================================== */
describe("Phase 12 — source-lock (hardcoded Türkçe kalmadı)", () => {
  const TR_CHARS = /[çÇğĞıİöÖşŞüÜ]/;

  for (const rel of ROUTE_FILES) {
    it(`${rel} — yorumlar hariç Türkçe karakter içermiyor`, () => {
      const code = stripComments(readRoute(rel));
      const offenders = code
        .split("\n")
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => TR_CHARS.test(line))
        .map(([i, line]) => `${i}: ${line.trim()}`);
      expect(offenders).toEqual([]);
    });
  }

  it("3 route dosyası da dictionary'yi DEFAULT_LOCALE ile çağırıyor", () => {
    for (const rel of ROUTE_FILES) {
      const code = stripComments(readRoute(rel));
      expect(code, rel).toContain("getDictionary(DEFAULT_LOCALE)");
      /* Seçenek A: admin'de locale kaynağı YOK. */
      expect(code, rel).not.toContain("localStorage");
      expect(code, rel).not.toContain("document.cookie");
      expect(code, rel).not.toContain("localeFromPathname");
    }
  });
});

/* ===============================================================
   5) RENDER — LİSTE
   =============================================================== */
describe("Phase 12 — Pages listesi render", () => {
  it("dolu liste: başlık, CTA ve satır aksiyonları dictionary'den", async () => {
    adminFetchMock.mockResolvedValue(
      okJson([
        {
          id: "page-1",
          title: "Hakkımızda",
          slug: "hakkimizda",
          is_active: true,
          show_in_menu: false,
        },
      ])
    );
    render(<AdminPagesList />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: tr.admin.pages.list.title })
      ).toBeTruthy()
    );
    expect(screen.getByText(tr.admin.pages.list.eyebrow)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.list.subtitle)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.list.newPageCta)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.list.view)).toBeTruthy();
    expect(screen.getByText(tr.admin.common.edit)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.publish.published)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.list.addToMenu)).toBeTruthy();
    expect(screen.getByText(tr.admin.common.delete)).toBeTruthy();
  });

  it("taslak + menüdeki satır: draft / inMenu varyantları", async () => {
    adminFetchMock.mockResolvedValue(
      okJson([
        {
          id: "page-2",
          title: "Gizlilik",
          slug: "gizlilik",
          is_active: false,
          show_in_menu: true,
        },
      ])
    );
    render(<AdminPagesList />);
    await waitFor(() =>
      expect(screen.getByText(tr.admin.pages.publish.draft)).toBeTruthy()
    );
    expect(screen.getByText(tr.admin.pages.list.inMenu)).toBeTruthy();
    expect(
      screen.getByTitle(tr.admin.pages.publish.publishTitle)
    ).toBeTruthy();
    expect(screen.getByTitle(tr.admin.pages.list.removeFromMenu)).toBeTruthy();
  });

  it("boş liste: empty state dictionary'den", async () => {
    adminFetchMock.mockResolvedValue(okJson([]));
    render(<AdminPagesList />);
    await waitFor(() =>
      expect(screen.getByText(tr.admin.pages.list.emptyTitle)).toBeTruthy()
    );
    expect(
      screen.getByText(tr.admin.pages.list.emptyDescription)
    ).toBeTruthy();
  });

  it("liste yüklenemezse toast başlığı dictionary'den", async () => {
    adminFetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: "boom" }),
    });
    render(<AdminPagesList />);
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toBe(
      tr.admin.pages.toast.listFailed
    );
  });
});

/* ===============================================================
   6) RENDER — YENİ SAYFA
   =============================================================== */
describe("Phase 12 — Yeni sayfa render", () => {
  it("başlık, alan etiketleri ve section butonları dictionary'den", () => {
    render(<NewPagePage />);
    expect(
      screen.getByRole("heading", { name: tr.admin.pages.form.newTitle })
    ).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.newSubtitle)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.fieldTitle)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.fieldSlug)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.fieldExcerpt)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.fieldCover)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.fieldBody)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.sections.label)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.sections.empty)).toBeTruthy();
    expect(
      screen.getByText(tr.admin.pages.form.seoTitleLabel)
    ).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.noindexLabel)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.showInMenuLabel)).toBeTruthy();
    expect(screen.getByText(tr.common.save)).toBeTruthy();
  });

  it("placeholder'lar dictionary'den", () => {
    render(<NewPagePage />);
    expect(
      screen.getByPlaceholderText(tr.admin.pages.form.titlePlaceholder)
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText(tr.admin.pages.form.slugPlaceholder)
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText(tr.admin.pages.form.excerptPlaceholder)
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText(tr.admin.pages.form.bodyPlaceholder)
    ).toBeTruthy();
  });

  it("section ekleme: sectionLabel dictionary'den gelir", () => {
    render(<NewPagePage />);
    fireEvent.click(
      screen.getByText(tr.admin.pages.sections.typeRichtext)
    );
    expect(
      screen.getByPlaceholderText(
        tr.admin.pages.sections.richtextPlaceholder
      )
    ).toBeTruthy();
    expect(screen.getByTitle(tr.admin.common.moveUp)).toBeTruthy();
    expect(screen.getByTitle(tr.admin.common.moveDown)).toBeTruthy();
    expect(screen.getByTitle(tr.admin.common.delete)).toBeTruthy();
  });

  it("başlık/slug boşken toast mesajı dictionary'den", async () => {
    render(<NewPagePage />);
    fireEvent.click(screen.getByText(tr.common.save));
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toBe(
      tr.admin.pages.toast.titleSlugRequired
    );
  });
});

/* ===============================================================
   7) RENDER — SAYFA DÜZENLE
   =============================================================== */
describe("Phase 12 — Sayfa düzenle render", () => {
  const ROW = {
    id: "page-1",
    title: "Hakkımızda",
    slug: "hakkimizda",
    body: "metin",
    excerpt: "",
    seo_title: "",
    seo_description: "",
    noindex: false,
    is_active: true,
    show_in_menu: false,
    cover_image: null,
  };

  it("başlık, yayın bloğu ve kaydet butonu dictionary'den", async () => {
    adminFetchMock.mockResolvedValue(okJson(ROW));
    render(<EditPagePage />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: tr.admin.pages.form.editTitle })
      ).toBeTruthy()
    );
    expect(screen.getByText(tr.admin.pages.form.editSubtitle)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.backToList)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.viewPage)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.publish.heading)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.publish.published)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.publish.showInTopMenu)).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.editBodyHint)).toBeTruthy();
    expect(screen.getByText(tr.common.save)).toBeTruthy();
  });

  it("yayın/menü açıklamaları formatDictionaryString ile üretiliyor", async () => {
    adminFetchMock.mockResolvedValue(okJson(ROW));
    render(<EditPagePage />);
    await waitFor(() =>
      expect(
        screen.getByText(
          formatDictionaryString(tr.admin.pages.publish.hint, {
            url: "/p/hakkimizda",
          })
        )
      ).toBeTruthy()
    );
    expect(
      screen.getByText(
        formatDictionaryString(tr.admin.pages.publish.showInMenuHint, {
          url: "/p/hakkimizda",
        })
      )
    ).toBeTruthy();
  });

  it("slug değişince uyarı metni {url} ile doldurulur", async () => {
    adminFetchMock.mockResolvedValue(okJson(ROW));
    render(<EditPagePage />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: tr.admin.pages.form.editTitle })
      ).toBeTruthy()
    );
    const slugInput = document.querySelector(
      "input.font-mono"
    ) as HTMLInputElement;
    fireEvent.change(slugInput, { target: { value: "yeni-slug" } });
    expect(
      screen.getByText(
        formatDictionaryString(tr.admin.pages.form.slugChangedWarning, {
          url: "/p/hakkimizda",
        })
      )
    ).toBeTruthy();
  });

  it("404: notFound bloğu dictionary'den", async () => {
    adminFetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, error: "yok" }),
    });
    render(<EditPagePage />);
    await waitFor(() =>
      expect(screen.getByText(tr.admin.pages.notFound.title)).toBeTruthy()
    );
    expect(
      screen.getByText(tr.admin.pages.notFound.description)
    ).toBeTruthy();
    expect(screen.getByText(tr.admin.pages.form.backToList)).toBeTruthy();
  });
});

/* ===============================================================
   8) formatDictionaryString — üç dil
   =============================================================== */
describe("Phase 12 — formatDictionaryString parametreleri", () => {
  it("{url} üç dilde de doğru yerleşir", () => {
    for (const d of [tr, en, de]) {
      const out = formatDictionaryString(d.admin.pages.publish.hint, {
        url: "/p/test",
      });
      expect(out).toContain("/p/test");
      expect(out).not.toContain("{url}");
    }
  });

  it("{hint} üç dilde de doğru yerleşir", () => {
    for (const d of [tr, en, de]) {
      const out = formatDictionaryString(d.admin.common.hintPrefix, {
        hint: "eksik kolon",
      });
      expect(out).toContain("eksik kolon");
      expect(out).not.toContain("{hint}");
    }
  });

  it("TR çıktısı Phase 12 öncesi JSX metniyle BİREBİR aynı", () => {
    expect(
      formatDictionaryString(tr.admin.pages.form.slugChangedWarning, {
        url: "/p/hakkimizda",
      })
    ).toBe("Slug değişti — eski URL (/p/hakkimizda) artık çalışmayacak.");
    expect(
      formatDictionaryString(tr.admin.pages.publish.hint, { url: "/p/slug" })
    ).toBe(
      "Kapatılırsa /p/slug 404 döner; SEO indexinden düşer. İçerik silinmez."
    );
    expect(
      formatDictionaryString(tr.admin.pages.publish.showInMenuHint, {
        url: "/p/slug",
      })
    ).toBe(
      "Header menüsünde görünür. Kapalıyken sayfa /p/slug üzerinden direkt erişilebilir."
    );
    expect(
      formatDictionaryString(tr.admin.common.hintPrefix, { hint: "X" })
    ).toBe("İpucu: X");
  });
});
