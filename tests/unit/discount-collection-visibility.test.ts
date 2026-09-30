/* ===============================================================
   🛡️ İNDİRİMLİ KOLEKSİYON — ADMIN ↔ ANA SAYFA GÖRÜNÜRLÜK SİMETRİSİ
   ===============================================================
   BUG: Bir villanın `villa_discounts` kaydı admin panelinden
   silindiğinde `discount_collections` satırı (kasıtlı olarak)
   SİLİNMEZ. Admin listesi (`listDiscountCollection`) tarih-bazlı
   filtresiyle villayı eliyordu; ana sayfa okuma yolu
   (`getCachedDiscountCollectionVillas`) ise hiçbir `villa_discounts`
   koşulu uygulamıyordu → villa admin'de kaybolurken ana sayfadaki
   "İndirimli Kiralık Villalar" bölümünde kart olarak kalmaya devam
   ediyordu.

   BU TEST İKİ TARAFI DA AYNI SENARYOLARLA SÜRER ve çıktılarının
   BİREBİR AYNI villa kümesi olmasını KİLİTLER. Cache (unstable_cache)
   mock'lanır — test edilen şey cache değil, MAPPER'ın görünürlük
   kararıdır (cache invalidation zaten `revalidateDiscount()` ile
   çalışıyor; kök neden filtre asimetrisiydi).
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ---- tarih yardımcıları (lib/date-format ile aynı "YYYY-MM-DD") ---- */
function iso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const TODAY = iso(0);
const PAST_START = iso(-30);
const PAST_END = iso(-1);
const FUTURE_START = iso(10);
const FUTURE_END = iso(40);

/* ---- mocks ---- */
const findActivePublicCardsMock = vi.fn();
const findAllForAdminMock = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
}));

vi.mock("@/lib/db/discount.repository", () => ({
  discountRepository: {
    findActivePublicCards: (...a: unknown[]) => findActivePublicCardsMock(...a),
    findAllForAdmin: (...a: unknown[]) => findAllForAdminMock(...a),
  },
}));

/* 🛡️ EKLENDİ (availability turu) — `cache.helpers` artık indirim
   penceresi için `getBlockedVillaIds`i çağırıyor. Bu dosyadaki testler
   GÖRÜNÜRLÜK kararını ölçer, müsaitliği DEĞİL; mock olmadan gerçek
   native DB bağlantısı denenirdi. Hiçbir mevcut assertion
   değiştirilmedi/gevşetilmedi — yalnız yeni bağımlılık izole edildi. */
vi.mock("@/lib/availability.helper", () => ({
  getBlockedVillaIds: async () => new Set<string>(),
}));

vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null) => u,
  resolveAssetUrl: (u: string | null) => u,
}));

vi.mock("@/app/services/villa-review.service", () => ({
  getApprovedVillaReviews: async () => [],
  getFeaturedHomepageReviews: async () => [],
  getGlobalReviewStats: async () => ({ average: 0, count: 0 }),
  getVillaReviewStats: async () => ({ average: 0, count: 0 }),
  getVillaReviewStatsBatch: async () => ({}),
}));

/* Ağır/alakasız veri katmanı — bu testte hiç çağrılmaz. */
vi.mock("@/app/services/settings.service", () => ({ getPublicSettings: async () => null }));
vi.mock("@/app/services/menu.service", () => ({ getMenu: async () => [] }));
vi.mock("@/app/services/villa.service", () => ({ getVillas: async () => [] }));
vi.mock("@/app/services/faq.service", () => ({ getFaqs: async () => [] }));
vi.mock("@/lib/i18n/get-faq-translations.server", () => ({
  applyFaqTranslations: async (f: unknown[]) => f,
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findActiveLocationIds: async () => ({ data: [], error: null }),
    findActiveImagesByIds: async () => ({ data: [], error: null }),
  },
}));
vi.mock("@/lib/db/villa-type.repository", () => ({ villaTypeRepository: {} }));
vi.mock("@/lib/db/villa-location.repository", () => ({ villaLocationRepository: {} }));
vi.mock("@/lib/db/homepage.repository", () => ({ homepageRepository: {} }));

/* ---- fixtures ---- */
type Discount = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency: string | null;
};

/** Ana sayfa (public cards) satır şekli — discount.repository
 *  findActivePublicCards select'i ile birebir alanlar. */
function publicRow(villaId: string, discounts: Discount[]) {
  return {
    id: `dc-${villaId}`,
    sort_order: 0,
    is_active: true,
    custom_title: null,
    custom_cover_image: null,
    villa: {
      id: villaId,
      slug: villaId,
      title: villaId,
      badge: null,
      bedrooms: 3,
      bathrooms: 2,
      guests: 6,
      is_active: true,
      deleted_at: null,
      location: { name: "Kaş" },
      villa_images: [{ image_url: "a.webp", is_cover: true, sort_order: 0 }],
      villa_prices: [
        { price: 10000, currency: "TRY", start_date: iso(-5), end_date: iso(60) },
      ],
      villa_discounts: discounts,
    },
  };
}

/** Admin satır şekli — findAllForAdmin LIST_SELECT ile birebir alanlar. */
function adminRow(villaId: string, discounts: Discount[]) {
  return {
    id: `dc-${villaId}`,
    villa_id: villaId,
    sort_order: 0,
    is_active: true,
    custom_title: null,
    custom_cover_image: null,
    created_at: null,
    villa: {
      id: villaId,
      slug: villaId,
      title: villaId,
      is_active: true,
      deleted_at: null,
      villa_images: [],
      villa_discounts: discounts.map((d) => ({ end_date: d.end_date })),
    },
  };
}

const ACTIVE: Discount = {
  start_date: TODAY,
  end_date: iso(20),
  discount_type: "percent",
  discount_value: 15,
  currency: null,
};
const FUTURE: Discount = {
  start_date: FUTURE_START,
  end_date: FUTURE_END,
  discount_type: "percent",
  discount_value: 20,
  currency: null,
};
const EXPIRED: Discount = {
  start_date: PAST_START,
  end_date: PAST_END,
  discount_type: "percent",
  discount_value: 25,
  currency: null,
};

/* Senaryolar: [villaId, indirim kayıtları, ana sayfada görünmeli mi] */
const SCENARIOS: Array<[string, Discount[], boolean]> = [
  ["v-active", [ACTIVE], true],
  ["v-future", [FUTURE], true],
  ["v-expired", [EXPIRED], false],
  ["v-deleted", [], false],
  ["v-mixed", [EXPIRED, FUTURE], true],
];

async function homepageIds(rows: unknown[]): Promise<string[]> {
  findActivePublicCardsMock.mockResolvedValue({ data: rows, error: null });
  const { getCachedDiscountCollectionVillas } = await import("@/lib/cache.helpers");
  const out = await getCachedDiscountCollectionVillas();
  return out.map((v) => v.id);
}

async function adminIds(rows: unknown[]): Promise<string[]> {
  findAllForAdminMock.mockResolvedValue({ data: rows, error: null });
  const { listDiscountCollection } = await import(
    "@/app/services/discount-collection.service"
  );
  const out = await listDiscountCollection();
  return out.map((i) => i.villa_id);
}

describe("İndirimli Koleksiyon — görünürlük", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1) İNDİRİM SİLİNDİ (villa_discounts BOŞ) → ana sayfada GÖRÜNMEZ", async () => {
    const ids = await homepageIds([publicRow("villa-in-love", [])]);
    expect(ids).toEqual([]);
  });

  it("2) Aktif indirimi olan villa ana sayfada GÖRÜNÜR", async () => {
    const ids = await homepageIds([publicRow("v-active", [ACTIVE])]);
    expect(ids).toEqual(["v-active"]);
  });

  it("3) Silinen villa GİDERKEN diğer aktif indirimli villalar KALIR", async () => {
    const ids = await homepageIds([
      publicRow("v-active", [ACTIVE]),
      publicRow("villa-in-love", []),
      publicRow("v-future", [FUTURE]),
    ]);
    expect(ids).toEqual(["v-active", "v-future"]);
  });

  it("4) GELECEK tarihli indirim ELENMEZ (mevcut iş kuralı korunur)", async () => {
    const ids = await homepageIds([publicRow("v-future", [FUTURE])]);
    expect(ids).toEqual(["v-future"]);
  });

  it("5) SÜRESİ GEÇMİŞ tek indirim → GÖRÜNMEZ (admin ile aynı kural)", async () => {
    const ids = await homepageIds([publicRow("v-expired", [EXPIRED])]);
    expect(ids).toEqual([]);
  });

  it("6) Geçmiş + gelecek karışık → GÖRÜNÜR ve GELECEK kayıt seçilir", async () => {
    findActivePublicCardsMock.mockResolvedValue({
      data: [publicRow("v-mixed", [EXPIRED, FUTURE])],
      error: null,
    });
    const { getCachedDiscountCollectionVillas } = await import("@/lib/cache.helpers");
    const out = await getCachedDiscountCollectionVillas();
    expect(out).toHaveLength(1);
    expect(out[0].discount).toMatchObject({
      start_date: FUTURE_START,
      end_date: FUTURE_END,
      discount_value: 20,
    });
  });

  it("7) Bozuk end_date ('Invalid Date') GÜVENLİ şekilde elenir", async () => {
    const broken: Discount = { ...ACTIVE, start_date: "not-a-date", end_date: "not-a-date" };
    const ids = await homepageIds([publicRow("v-broken", [broken])]);
    expect(ids).toEqual([]);
  });

  it("8) Villa pasif/silinmiş ise (mevcut davranış) yine GÖRÜNMEZ", async () => {
    const row = publicRow("v-inactive", [ACTIVE]);
    row.villa.is_active = false;
    const ids = await homepageIds([row]);
    expect(ids).toEqual([]);
  });
});

describe("İndirimli Koleksiyon — ADMIN ↔ ANA SAYFA SİMETRİSİ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("9) Her senaryoda iki taraf AYNI villa kümesini döndürür", async () => {
    for (const [villaId, discounts, shouldShow] of SCENARIOS) {
      const home = await homepageIds([publicRow(villaId, discounts)]);
      const admin = await adminIds([adminRow(villaId, discounts)]);
      expect(home, `homepage: ${villaId}`).toEqual(shouldShow ? [villaId] : []);
      expect(admin, `admin: ${villaId}`).toEqual(shouldShow ? [villaId] : []);
      expect(home, `simetri: ${villaId}`).toEqual(admin);
    }
  });

  it("10) Karışık liste — iki taraf AYNI sırayla AYNI villaları verir", async () => {
    const home = await homepageIds(SCENARIOS.map(([id, d]) => publicRow(id, d)));
    const admin = await adminIds(SCENARIOS.map(([id, d]) => adminRow(id, d)));
    const expected = SCENARIOS.filter(([, , show]) => show).map(([id]) => id);
    expect(home).toEqual(expected);
    expect(admin).toEqual(expected);
  });
});
