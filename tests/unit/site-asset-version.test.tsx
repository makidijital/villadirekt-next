// @vitest-environment node
/* ===============================================================
   🛡️ SITE-ASSETS GÖRSEL URL VERSİYONLAMA (`?v=<R2 ETag>`)
   ===============================================================
   A) `withVersionParam` / `appendAssetVersion`: eski çıktı BİREBİR,
      mevcut `v` parametresi TEKRARLANMAZ, diğer query/hash korunur.
   B) Path normalize: legacy tam URL / dizin atlama versiyonlanmaz.
   C) Server: ETag → kısa versiyon; 404 → yok; hata cache'lenmez;
      görsel değişmezse versiyon AYNI, değişince FARKLI.
   D) Invalidation: yalnız site-assets path tag'leri.
   E) Upload route: başarıda invalidation, yanıt formatı AYNI.
   F) CMS render: kapak + bölüm görseline `?v=`; versiyon yoksa aynen.
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/* ---------------- C/D için mock'lar ---------------- */
const headMock = vi.fn();
vi.mock("@/lib/storage/s3-storage.provider", () => ({
  headObjectEtag: (...a: unknown[]) => headMock(...a),
  s3StorageProvider: {
    upload: (...a: unknown[]) => uploadMock(...a),
    remove: vi.fn(async () => ({ ok: true, failed: [], attempts: 1 })),
  },
}));
const revalidateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  /* unstable_cache: test ortamında doğrudan çalıştır (cache yok). */
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: (...a: unknown[]) => revalidateTagMock(...a),
}));
const uploadMock = vi.fn();

import {
  normalizeSiteAssetPath,
  versionedAssetUrl,
  withVersionParam,
} from "@/lib/storage/site-asset-version";
import {
  getSiteAssetVersion,
  getSiteAssetVersions,
  invalidateSiteAssetVersions,
} from "@/lib/storage/site-asset-version.server";
import { appendAssetVersion } from "@/lib/storage.helpers";

beforeEach(() => {
  headMock.mockReset();
  revalidateTagMock.mockReset();
  uploadMock.mockReset();
});

describe("A) ?v= birleştirme", () => {
  const U = "https://cdn.example.com/blog/makihotel.webp";

  it("query yok → ?v=; query var → &v= (eski davranış birebir)", () => {
    expect(withVersionParam(U, "abc")).toBe(`${U}?v=abc`);
    expect(withVersionParam(`${U}?w=1`, "abc")).toBe(`${U}?w=1&v=abc`);
    expect(appendAssetVersion(U, "2026-01-01T00:00:00+00:00")).toBe(
      `${U}?v=${encodeURIComponent("2026-01-01T00:00:00+00:00")}`
    );
  });

  it("mevcut v parametresi TEKRARLANMAZ (image.webp?v=1&v=2 oluşmaz)", () => {
    expect(withVersionParam(`${U}?v=1`, "2")).toBe(`${U}?v=2`);
    expect(withVersionParam(`${U}?a=1&v=1&b=2`, "2")).toBe(`${U}?a=1&b=2&v=2`);
    expect(appendAssetVersion(`${U}?v=old`, "new")).toBe(`${U}?v=new`);
    expect(withVersionParam(`${U}?v=1#x`, "2")).toBe(`${U}?v=2#x`);
    /* `vv=` / `version=` başka parametredir, silinmez */
    expect(withVersionParam(`${U}?vv=1&version=3`, "2")).toBe(`${U}?vv=1&version=3&v=2`);
  });

  it("versiyon yoksa URL AYNEN", () => {
    expect(appendAssetVersion(U, null)).toBe(U);
    expect(versionedAssetUrl(U, {}, "blog/makihotel.webp")).toBe(U);
    expect(versionedAssetUrl(U, { "blog/makihotel.webp": "e1" }, "blog/makihotel.webp")).toBe(`${U}?v=e1`);
    expect(versionedAssetUrl(null, { a: "1" }, "a")).toBeNull();
  });
});

describe("B) path normalize", () => {
  it("relative site-assets path'leri kabul, diğerleri red", () => {
    expect(normalizeSiteAssetPath("blog/x.webp")).toBe("blog/x.webp");
    expect(normalizeSiteAssetPath("/page-covers/a.webp")).toBe("page-covers/a.webp");
    expect(normalizeSiteAssetPath("https://legacy.host/x.webp")).toBeNull();
    expect(normalizeSiteAssetPath("../secret")).toBeNull();
    expect(normalizeSiteAssetPath("a.webp?v=1")).toBeNull();
    expect(normalizeSiteAssetPath("")).toBeNull();
    expect(normalizeSiteAssetPath(null)).toBeNull();
  });
});

describe("C) server versiyon (R2 ETag)", () => {
  it("ETag → 12 haneli versiyon; aynı içerik → aynı, yeni içerik → farklı", async () => {
    headMock.mockResolvedValueOnce('"195d7893b629dd86960814953cb45ba0"');
    const a = await getSiteAssetVersion("blog/x.webp");
    headMock.mockResolvedValueOnce('"195d7893b629dd86960814953cb45ba0"');
    const a2 = await getSiteAssetVersion("blog/x.webp");
    headMock.mockResolvedValueOnce('"a564cda083d9acf37adc5dda0057ba62"');
    const b = await getSiteAssetVersion("blog/x.webp");
    expect(a).toBe("195d7893b629");
    expect(a2).toBe(a);
    expect(b).toBe("a564cda083d9");
    expect(headMock).toHaveBeenCalledWith("villadirekt-site-assets", "blog/x.webp");
  });

  it("nesne yok → null; R2 hatası → null (sayfa bozulmaz)", async () => {
    headMock.mockResolvedValueOnce(null);
    expect(await getSiteAssetVersion("blog/yok.webp")).toBeNull();
    headMock.mockRejectedValueOnce(new Error("network"));
    expect(await getSiteAssetVersion("blog/x.webp")).toBeNull();
  });

  it("toplu: legacy tam URL'ler sorgulanmaz, bulunamayanlar map'e yazılmaz", async () => {
    headMock.mockImplementation(async (_b: string, k: string) =>
      k === "page-covers/a.webp" ? '"aaaaaaaaaaaaaaaa"' : null
    );
    const v = await getSiteAssetVersions([
      "page-covers/a.webp",
      "page-covers/yok.webp",
      "https://legacy/x.webp",
      null,
      "page-covers/a.webp",
    ]);
    expect(v).toEqual({ "page-covers/a.webp": "aaaaaaaaaaaa" });
    expect(headMock).toHaveBeenCalledTimes(2);
  });
});

describe("D) invalidation", () => {
  it("yalnız site-assets path tag'i; villa bucket'ı dokunulmaz", () => {
    invalidateSiteAssetVersions("villadirekt-site-assets", ["blog/x.webp", "https://x/y"]);
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
    expect(revalidateTagMock).toHaveBeenCalledWith("site-asset-version:blog/x.webp", { expire: 0 });
    invalidateSiteAssetVersions("villadirekt-villa-images", ["villas/a/b.webp"]);
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
  });

  it("revalidateTag throw etse bile sessiz", () => {
    revalidateTagMock.mockImplementation(() => {
      throw new Error("outside request scope");
    });
    expect(() => invalidateSiteAssetVersions("villadirekt-site-assets", ["blog/x.webp"])).not.toThrow();
  });
});

/* ---------------- E) upload route ---------------- */
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: async () => ({ ok: true, caller: { id: "a1" } }),
}));
vi.mock("@/lib/auth/action-authz", () => ({
  callerHasPermission: async () => true,
  FORBIDDEN_MESSAGE: "forbidden",
}));

describe("E) upload route", () => {
  async function post(ok: boolean) {
    uploadMock.mockResolvedValueOnce(ok ? { ok: true } : { ok: false, error: "x" });
    const { POST } = await import("@/app/api/admin/storage/upload/route");
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }), "a.webp");
    fd.append("bucket", "villadirekt-site-assets");
    fd.append("path", "blog/x.webp");
    fd.append("cacheControl", "3600");
    fd.append("upsert", "true");
    const res = await POST(new Request("http://t/api/admin/storage/upload", { method: "POST", body: fd }));
    return { status: res.status, json: await res.json() };
  }

  it("başarı → aynı path'in versiyonu invalidate; yanıt { ok: true } AYNI; path/cacheControl aynen", async () => {
    const r = await post(true);
    expect(r).toEqual({ status: 200, json: { ok: true } });
    expect(uploadMock.mock.calls[0][0]).toBe("villadirekt-site-assets");
    expect(uploadMock.mock.calls[0][1]).toBe("blog/x.webp");
    expect(uploadMock.mock.calls[0][3]).toMatchObject({ cacheControl: "3600", upsert: true });
    expect(revalidateTagMock).toHaveBeenCalledWith("site-asset-version:blog/x.webp", { expire: 0 });
  });

  it("hata → invalidation YOK, yanıt eskisi gibi 502", async () => {
    const r = await post(false);
    expect(r.status).toBe(502);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

/* ---------------- F) CMS render ---------------- */
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={String(props.alt ?? "")} src={String(props.src ?? "")} />
  ),
}));
vi.mock("@/app/components/seo/StructuredData", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  default: () => null,
}));
vi.mock("@/lib/storage.helpers", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  getPageCoverPublicUrl: (v: string | null | undefined) =>
    v ? `https://cdn.test/${v}` : null,
}));

describe("F) CMS kapak + bölüm görselleri", () => {
  const page = {
    title: "Yaz Rehberi",
    cover_image: "page-covers/yaz-rehberi.webp",
    sections: [{ type: "image", path: "page-covers/yaz-rehberi-section-0.webp", alt: "" }],
  };

  async function html(assetVersions?: Record<string, string>) {
    const { default: CmsPageBody } = await import("@/app/components/cms/CmsPageBody");
    return renderToStaticMarkup(
      <CmsPageBody
        locale="tr"
        slug="yaz-rehberi"
        page={page}
        title="Yaz Rehberi"
        resolvedExcerpt={null}
        body={null}
        assetVersions={assetVersions}
      />
    );
  }

  it("versiyonlarla: kapak ve bölüm URL'lerinde ?v=, R2 path AYNI", async () => {
    const out = await html({
      "page-covers/yaz-rehberi.webp": "aaaa1111bbbb",
      "page-covers/yaz-rehberi-section-0.webp": "cccc2222dddd",
    });
    expect(out).toContain("/page-covers/yaz-rehberi.webp?v=aaaa1111bbbb");
    expect(out).toContain("/page-covers/yaz-rehberi-section-0.webp?v=cccc2222dddd");
  });

  it("versiyonsuz (eski çağıran): URL'ler bugünkü gibi", async () => {
    const out = await html();
    expect(out).toContain("/page-covers/yaz-rehberi.webp\"");
    expect(out).not.toContain("?v=");
  });
});
