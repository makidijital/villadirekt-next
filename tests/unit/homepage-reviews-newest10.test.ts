/* ===============================================================
   🛡️ ANASAYFA "Misafirlerimiz ne diyor?" — EN YENİ 10 ONAYLI YORUM
   ===============================================================
   HEDEF KONTRAT:
     villa_reviews
     WHERE is_approved = true
     ORDER BY created_at DESC
     LIMIT 10

   KAPSAM:
     • Repository: is_approved filtresi VAR, created_at DESC VAR,
       is_featured SIRALAMASI YOK (homepage)
     • REGRESYON: villa-detay (findApprovedByVilla) featured-first
       sıralaması AYNEN duruyor → admin "öne çıkar" bozulmadı
     • HOMEPAGE_REVIEW_LIMIT = 10, over-fetch buffer = 20
     • is_featured artık anasayfa sırasını DEĞİŞTİRMİYOR
     • <10 yorum → hepsi döner, hata yok
     • 0 yorum → [] ; repo error → []
     • pasif / silinmiş villa yorumu düşer (defansif filtre korundu)
     • Cache: mevcut unstable_cache + "villa-reviews" tag korundu
     • Yeni API endpoint YOK, yeni carousel kütüphanesi YOK
     • Empty-state: reviews.length === 0 → section null
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- repository mock (DB'ye ASLA inilmez) ---------- */
const findFeaturedHomepageMock = vi.fn();

vi.mock("@/lib/db/villa-review.repository.server", () => ({
  villaReviewServerRepository: {
    findFeaturedHomepage: (...a: unknown[]) => findFeaturedHomepageMock(...a),
    findApprovedByVilla: vi.fn(),
    findAllApprovedRatings: vi.fn(),
    findApprovedRatingsAllVillas: vi.fn(),
    findApprovedRatingsByVilla: vi.fn(),
    findAllForAdmin: vi.fn(),
    findFeaturedStateById: vi.fn(),
    insert: vi.fn(),
    updateById: vi.fn(),
    clearFeaturedByVilla: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null | undefined) => u ?? null,
}));

import { getFeaturedHomepageReviews } from "@/app/services/villa-review.service";

const REPO_SRC = readFileSync(
  "lib/db/villa-review.repository.server.ts",
  "utf-8"
);
const SERVICE_SRC = readFileSync(
  "app/services/villa-review.service.ts",
  "utf-8"
);
const CACHE_SRC = readFileSync("lib/cache.helpers.ts", "utf-8");
const SECTION_SRC = readFileSync(
  "app/components/home/HomepageReviewsSection.tsx",
  "utf-8"
);
const CAROUSEL_SRC = readFileSync(
  "app/components/home/ReviewsCarousel.tsx",
  "utf-8"
);

/** Bir repository metodunun YALNIZ gövdesini döndürür (doc-comment
 *  eşleşmelerinden kaynaklanan yanlış pozitifleri engeller). */
function repoMethodBody(name: string): string {
  const start = REPO_SRC.indexOf(`async ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = REPO_SRC.indexOf("\n  },", start);
  expect(end).toBeGreaterThan(start);
  return REPO_SRC.slice(start, end);
}

function villaRow(over: Record<string, unknown> = {}) {
  return {
    id: "v1",
    slug: "villa-1",
    title: "Villa Bir",
    is_active: true,
    deleted_at: null,
    location: { name: "Kaş" },
    villa_images: [{ image_url: "cover.jpg", is_cover: true, sort_order: 0 }],
    ...over,
  };
}

function reviewRow(
  i: number,
  over: Record<string, unknown> = {},
  villaOver: Record<string, unknown> = {}
) {
  return {
    id: `r${i}`,
    guest_name: `Misafir ${i}`,
    rating: 5,
    comment: `Yorum ${i}`,
    created_at: `2026-01-${String(i).padStart(2, "0")}T00:00:00Z`,
    is_featured: false,
    villa: villaRow(villaOver),
    ...over,
  };
}

beforeEach(() => {
  findFeaturedHomepageMock.mockReset();
});

/* ===============================================================
   1) REPOSITORY SORGU KONTRATI
   =============================================================== */
describe("1) repository — homepage sorgusu", () => {
  const body = () => repoMethodBody("findFeaturedHomepage");

  it("1a) is_approved = true filtresi VAR", () => {
    expect(body()).toContain('.eq("is_approved", true)');
  });

  it("1b) created_at DESC sıralaması VAR", () => {
    expect(body()).toContain('.order("created_at", { ascending: false })');
  });

  it("1c) 🔒 is_featured SIRALAMASI YOK (homepage gövdesi)", () => {
    expect(body()).not.toContain('.order("is_featured"');
  });

  it("1d) limit parametresi uygulanıyor", () => {
    expect(body()).toContain(".limit(limit)");
  });

  it("1e) villa embed korundu (tek round-trip, N+1 yok)", () => {
    const b = body();
    expect(b).toContain("villa:villa_id");
    expect(b).toContain("villa_images");
    expect(b).toContain("is_active");
    expect(b).toContain("deleted_at");
  });
});

/* ===============================================================
   2) REGRESYON — villa detay / admin featured BOZULMADI
   =============================================================== */
describe("2) regresyon — 'öne çıkan' sistemi bozulmadı", () => {
  it("2a) villa-detay listesi HÂLÂ featured-first", () => {
    const b = repoMethodBody("findApprovedByVilla");
    expect(b).toContain('.order("is_featured", { ascending: false })');
    expect(b).toContain('.order("created_at", { ascending: false })');
  });

  it("2b) admin featured toggle repo metotları duruyor", () => {
    expect(REPO_SRC).toContain("async findFeaturedStateById(");
    expect(REPO_SRC).toContain("async clearFeaturedByVilla(");
    expect(repoMethodBody("clearFeaturedByVilla")).toContain(
      "is_featured: false"
    );
  });

  it("2c) toggleFeaturedReview service fonksiyonu duruyor", () => {
    expect(SERVICE_SRC).toContain("export async function toggleFeaturedReview(");
  });
});

/* ===============================================================
   3) LİMİT = 10
   =============================================================== */
describe("3) limit", () => {
  it("3a) HOMEPAGE_REVIEW_LIMIT = 10", () => {
    expect(SERVICE_SRC).toMatch(/const HOMEPAGE_REVIEW_LIMIT = 10;/);
  });

  it("3b) repo'ya over-fetch buffer (20) gider", async () => {
    findFeaturedHomepageMock.mockResolvedValue({ data: [], error: null });
    await getFeaturedHomepageReviews();
    expect(findFeaturedHomepageMock).toHaveBeenCalledTimes(1);
    expect(findFeaturedHomepageMock.mock.calls[0][0]).toBe(20);
  });

  it("3c) 20 satır gelse bile EN FAZLA 10 döner", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => reviewRow(i + 1));
    findFeaturedHomepageMock.mockResolvedValue({ data: rows, error: null });
    const out = await getFeaturedHomepageReviews();
    expect(out).toHaveLength(10);
  });

  it("3d) DB sırası (created_at DESC) AYNEN korunur, yeniden sıralanmaz", async () => {
    const rows = [reviewRow(3), reviewRow(2), reviewRow(1)];
    findFeaturedHomepageMock.mockResolvedValue({ data: rows, error: null });
    const out = await getFeaturedHomepageReviews();
    expect(out.map((r) => r.id)).toEqual(["r3", "r2", "r1"]);
  });
});

/* ===============================================================
   4) is_featured ARTIK SIRA DEĞİŞTİRMİYOR
   =============================================================== */
describe("4) is_featured anasayfa sırasını etkilemez", () => {
  it("4a) featured yorum en sonda gelse en sonda KALIR", async () => {
    const rows = [
      reviewRow(3),
      reviewRow(2),
      reviewRow(1, { is_featured: true }),
    ];
    findFeaturedHomepageMock.mockResolvedValue({ data: rows, error: null });
    const out = await getFeaturedHomepageReviews();
    expect(out.map((r) => r.id)).toEqual(["r3", "r2", "r1"]);
    expect(out[2].is_featured).toBe(true);
  });

  it("4b) is_featured alanı payload'da KORUNUYOR (kırılma yok)", async () => {
    findFeaturedHomepageMock.mockResolvedValue({
      data: [reviewRow(1, { is_featured: true })],
      error: null,
    });
    const out = await getFeaturedHomepageReviews();
    expect(out[0].is_featured).toBe(true);
  });
});

/* ===============================================================
   5) AZ VERİ / HİÇ VERİ / HATA — güvenli davranış
   =============================================================== */
describe("5) sınır durumları", () => {
  it("5a) 10'dan AZ yorum → hepsi döner, hata yok", async () => {
    const rows = [reviewRow(3), reviewRow(2), reviewRow(1)];
    findFeaturedHomepageMock.mockResolvedValue({ data: rows, error: null });
    const out = await getFeaturedHomepageReviews();
    expect(out).toHaveLength(3);
  });

  it("5b) tek yorum → 1 döner", async () => {
    findFeaturedHomepageMock.mockResolvedValue({
      data: [reviewRow(1)],
      error: null,
    });
    expect(await getFeaturedHomepageReviews()).toHaveLength(1);
  });

  it("5c) hiç yorum yok → []", async () => {
    findFeaturedHomepageMock.mockResolvedValue({ data: [], error: null });
    expect(await getFeaturedHomepageReviews()).toEqual([]);
  });

  it("5d) data null → []", async () => {
    findFeaturedHomepageMock.mockResolvedValue({ data: null, error: null });
    expect(await getFeaturedHomepageReviews()).toEqual([]);
  });

  it("5e) repo error → [] (throw ETMEZ)", async () => {
    findFeaturedHomepageMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    expect(await getFeaturedHomepageReviews()).toEqual([]);
  });
});

/* ===============================================================
   6) DEFANSİF VILLA FİLTRESİ KORUNDU
   =============================================================== */
describe("6) pasif / silinmiş villa filtresi", () => {
  it("6a) is_active === false → düşer", async () => {
    findFeaturedHomepageMock.mockResolvedValue({
      data: [reviewRow(1, {}, { is_active: false }), reviewRow(2)],
      error: null,
    });
    const out = await getFeaturedHomepageReviews();
    expect(out.map((r) => r.id)).toEqual(["r2"]);
  });

  it("6b) deleted_at dolu → düşer", async () => {
    findFeaturedHomepageMock.mockResolvedValue({
      data: [
        reviewRow(1, {}, { deleted_at: "2026-01-01T00:00:00Z" }),
        reviewRow(2),
      ],
      error: null,
    });
    const out = await getFeaturedHomepageReviews();
    expect(out.map((r) => r.id)).toEqual(["r2"]);
  });

  it("6c) villa null → düşer", async () => {
    findFeaturedHomepageMock.mockResolvedValue({
      data: [reviewRow(1, { villa: null }), reviewRow(2)],
      error: null,
    });
    const out = await getFeaturedHomepageReviews();
    expect(out.map((r) => r.id)).toEqual(["r2"]);
  });
});

/* ===============================================================
   7) CACHE — mevcut altyapı korundu, yeni endpoint yok
   =============================================================== */
describe("7) cache / veri akışı", () => {
  it("7a) getCachedHomepageReviews unstable_cache + villa-reviews tag", () => {
    const start = CACHE_SRC.indexOf("export const getCachedHomepageReviews");
    expect(start).toBeGreaterThan(-1);
    const block = CACHE_SRC.slice(start, CACHE_SRC.indexOf(");", start));
    expect(block).toContain("unstable_cache");
    expect(block).toContain("getFeaturedHomepageReviews()");
    expect(block).toContain('tags: ["villa-reviews"]');
    expect(block).toContain("revalidate: 3600");
  });

  it("7b) 🔒 homepage yorumları için YENİ API route yok", () => {
    expect(SECTION_SRC).not.toContain("fetch(");
    expect(SECTION_SRC).toContain("getCachedHomepageReviews");
  });
});

/* ===============================================================
   8) UI — tasarım / carousel korundu
   =============================================================== */
describe("8) UI koruması", () => {
  it("8a) empty-state: 0 yorum → section null", () => {
    expect(SECTION_SRC).toMatch(
      /reviews\.length === 0\)\s*return null/
    );
  });

  it("8b) carousel mevcut Embla kütüphanesi (yeni dependency yok)", () => {
    expect(CAROUSEL_SRC).toContain('from "embla-carousel-react"');
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["embla-carousel-react"]).toBeDefined();
    expect(deps["swiper"]).toBeUndefined();
    expect(deps["react-slick"]).toBeUndefined();
    expect(deps["keen-slider"]).toBeUndefined();
  });

  it("8c) sonsuz döngü (loop) birden fazla yorumda açık", () => {
    expect(CAROUSEL_SRC).toContain("const canNavigate = reviews.length > 1");
    expect(CAROUSEL_SRC).toContain("loop: canNavigate");
  });

  it("8d) responsive sınıflar korundu (mobil/tablet/desktop)", () => {
    expect(SECTION_SRC).toContain("px-5 md:px-10 lg:px-16");
    expect(CAROUSEL_SRC).toContain("basis-full");
    // Alt isim rail'i (overflow-x-auto) bilinçli olarak kaldırıldı;
    // desktop 2'li gösterim sınıfı kilitlenir.
    expect(CAROUSEL_SRC).toContain("lg:basis-1/2");
  });

  it("8e) 🔒 kart tasarımı anahtarları duruyor (tırnak + avatar + yıldız + villa)", () => {
    expect(CAROUSEL_SRC).toContain("ActiveTestimonial");
    expect(CAROUSEL_SRC).toContain("&ldquo;");
    expect(CAROUSEL_SRC).toContain("function Avatar(");
    expect(CAROUSEL_SRC).toContain("villaTitle");
    expect(CAROUSEL_SRC).toContain("dict.readMore");
  });
});
