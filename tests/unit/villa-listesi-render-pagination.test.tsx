/* ===============================================================
   🚀 /maki-admin/villa-listesi — RENDER PAGINATION DAVRANIŞ KİLİDİ
   ===============================================================
   AMAÇ: Pagination'ın YALNIZ render katmanını sınırladığını, mevcut
   hiçbir davranışı değiştirmediğini kanıtlamak.

   KİLİTLENEN DAVRANIŞLAR (hepsi filtrelenmiş TÜM liste üzerinde):
     1) Aynı anda yalnız 24 VillaCard mount edilir
     2) Sayaç `filtered.length` (24 DEĞİL, tüm filtrelenen sayı)
     3) "Tümünü seç" → filtrelenen TÜM villaları seçer (sayfadan bağımsız)
     4) Seçim sayfa değişiminde KORUNUR
     5) Sıralama/sıra korunur — sayfa N doğru dilimi gösterir
     6) Arama filtresi çalışmaya devam eder ve 1. sayfaya döner
     7) ≤24 villada pagination bar HİÇ render edilmez (tasarım değişmez)

   `VillaCard` kasten stub'lanır: amaç kart içeriğini değil, MOUNT
   SAYISINI ölçmek. Fiyat/kur/müsaitlik motorlarına dokunulmaz.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

/* ---------------- mock katmanı ---------------- */

/* VillaCard → hafif stub. Mount sayısını data-testid ile sayarız. */
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: ({ id, title }: { id: string; title: string }) => (
    <div data-testid="villa-card" data-villa-id={id}>
      {title}
    </div>
  ),
}));

/* react-datepicker ağır ve bu testin konusu değil. */
vi.mock("@/app/components/admin/shared/AdminDateRangePicker", () => ({
  default: () => <div data-testid="date-range-picker" />,
}));

/* Müsaitlik server action'ı — tarih seçilmediği için zaten boş döner. */
const getBlockedVillaIdsActionMock = vi.fn(async () => [] as string[]);
vi.mock("@/lib/availability.action", () => ({
  getBlockedVillaIdsAction: (...a: unknown[]) =>
    getBlockedVillaIdsActionMock(...(a as [])),
}));

/* Paylaşım server action'ı — bu testte çağrılmaz. */
const createSharedVillaListActionMock = vi.fn();
vi.mock(
  "@/app/(admin)/maki-admin/villa-listesi/_components/shared-villa-list.action",
  () => ({
    createSharedVillaListAction: (...a: unknown[]) =>
      createSharedVillaListActionMock(...(a as [])),
  })
);

vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: {} }),
}));

import VillaListesiClient, {
  type VillaListesiRow,
} from "@/app/(admin)/maki-admin/villa-listesi/_components/VillaListesiClient";

/* ---------------- fixtures ---------------- */

const LOCATIONS = [
  { id: "loc-1", name: "Kalkan", filter_group_name: "Kalkan" },
];

/** N villa — başlıklar sıralı ("Villa 001" … "Villa NNN"). */
function makeVillas(n: number): VillaListesiRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `v-${String(i + 1).padStart(3, "0")}`,
    slug: `villa-${i + 1}`,
    title: `Villa ${String(i + 1).padStart(3, "0")}`,
    location_id: "loc-1",
    location: "Kalkan",
    price: null,
    currency: null,
    images: [],
    badge: null,
    guests: 4,
    bedrooms: 2,
    bathrooms: 1,
    cleaning_fee: 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
    prices: [],
  }));
}

function renderList(count: number) {
  const villas = makeVillas(count);
  render(
    <VillaListesiClient
      villas={villas}
      locations={LOCATIONS}
      categories={[]}
      villaCategoryMap={{}}
    />
  );
  return villas;
}

const cards = () => screen.queryAllByTestId("villa-card");
const cardTitles = () => cards().map((c) => c.textContent);
const pagerNav = () => screen.queryByRole("navigation", { name: "Sayfa gezinme" });

beforeEach(() => {
  getBlockedVillaIdsActionMock.mockClear();
  createSharedVillaListActionMock.mockClear();
});

describe("villa-listesi — render pagination (yalnız görüntüleme sınırı)", () => {
  it("1) 100 villada aynı anda YALNIZ 24 VillaCard mount edilir", () => {
    renderList(100);
    expect(cards()).toHaveLength(24);
  });

  it("2) sayaç filtrelenen TÜM sayıyı gösterir (24 değil)", () => {
    renderList(100);
    /* "<strong>100</strong> villa listelendi / toplam 100" */
    expect(screen.getByText("villa listelendi", { exact: false })).toBeTruthy();
    const strongs = screen
      .getAllByText("100")
      .map((el) => el.tagName.toLowerCase());
    expect(strongs).toContain("strong");
    expect(screen.queryByText("24 villa listelendi")).toBeNull();
  });

  it("3) 'Tümünü seç' sayfadaki 24'ü DEĞİL, filtrelenen TÜM villaları seçer", () => {
    renderList(100);
    fireEvent.click(screen.getByRole("button", { name: "Tümünü seç" }));
    /* Sticky bar: "<strong>100</strong> villa seçildi" */
    expect(screen.getByText("villa seçildi", { exact: false })).toBeTruthy();
    const selectedCount = screen
      .getAllByText("100")
      .filter((el) => el.tagName.toLowerCase() === "strong");
    expect(selectedCount.length).toBeGreaterThan(0);
    /* Sayfada hâlâ 24 kart var — seçim render'dan bağımsız. */
    expect(cards()).toHaveLength(24);
  });

  it("4) sayfa 1 ilk 24'ü, sayfa 2 sonraki 24'ü gösterir (sıra korunur)", () => {
    renderList(100);
    expect(cardTitles()[0]).toBe("Villa 001");
    expect(cardTitles()[23]).toBe("Villa 024");

    fireEvent.click(within(pagerNav()!).getByRole("button", { name: "2" }));

    expect(cards()).toHaveLength(24);
    expect(cardTitles()[0]).toBe("Villa 025");
    expect(cardTitles()[23]).toBe("Villa 048");
    expect(screen.queryByText("Villa 001")).toBeNull();
  });

  it("5) seçim sayfa değişiminde KORUNUR", () => {
    renderList(100);
    fireEvent.click(screen.getByRole("button", { name: "Tümünü seç" }));
    fireEvent.click(within(pagerNav()!).getByRole("button", { name: "3" }));
    /* Sticky bar hâlâ 100 seçili diyor. */
    const stillSelected = screen
      .getAllByText("100")
      .filter((el) => el.tagName.toLowerCase() === "strong");
    expect(stillSelected.length).toBeGreaterThan(0);
    expect(cards()).toHaveLength(24);
  });

  it("6) son sayfa kalan kadar kart gösterir (100 → 4 kart)", () => {
    renderList(100);
    fireEvent.click(within(pagerNav()!).getByRole("button", { name: "5" }));
    expect(cards()).toHaveLength(4);
    expect(cardTitles()[0]).toBe("Villa 097");
  });

  it("7) arama filtresi çalışır VE 1. sayfaya döner", () => {
    renderList(100);
    /* Önce 3. sayfaya git. */
    fireEvent.click(within(pagerNav()!).getByRole("button", { name: "3" }));
    expect(cardTitles()[0]).toBe("Villa 049");

    /* Arama → tek eşleşme; pagination bar kaybolur, sayfa 1'e döner. */
    const input = screen.getByPlaceholderText(
      "Mülk adı, bölge, slug veya ID ara…"
    );
    fireEvent.change(input, { target: { value: "Villa 077" } });

    expect(cards()).toHaveLength(1);
    expect(cardTitles()[0]).toBe("Villa 077");
    expect(pagerNav()).toBeNull();

    /* Arama temizlenince yine 1. sayfadayız (3. sayfa DEĞİL). */
    fireEvent.change(input, { target: { value: "" } });
    expect(cards()).toHaveLength(24);
    expect(cardTitles()[0]).toBe("Villa 001");
  });

  it("8) 24 ve altında pagination bar HİÇ render edilmez (tasarım değişmez)", () => {
    renderList(24);
    expect(cards()).toHaveLength(24);
    expect(pagerNav()).toBeNull();
  });

  it("9) 25 villada pagination bar görünür ve 2 sayfa olur", () => {
    renderList(25);
    expect(cards()).toHaveLength(24);
    const nav = pagerNav();
    expect(nav).not.toBeNull();
    expect(within(nav!).getByRole("button", { name: "2" })).toBeTruthy();
    expect(within(nav!).queryByRole("button", { name: "3" })).toBeNull();
    fireEvent.click(within(nav!).getByRole("button", { name: "2" }));
    expect(cards()).toHaveLength(1);
  });

  it("10) boş liste — kart da pagination da yok, mevcut boş-state korunur", () => {
    renderList(0);
    expect(cards()).toHaveLength(0);
    expect(pagerNav()).toBeNull();
    expect(screen.getByText("Aktif mülk bulunamadı.")).toBeTruthy();
  });
});

/* ===============================================================
   KAYNAK KİLİDİ — pagination'ın kapsamı genişlemesin
   =============================================================== */
describe("villa-listesi — kaynak kilidi", () => {
  const src = readFileSync(
    join(
      process.cwd(),
      "app/(admin)/maki-admin/villa-listesi/_components/VillaListesiClient.tsx"
    ),
    "utf-8"
  );

  it("11) sayfa boyutu 24", () => {
    expect(src).toMatch(/const RENDER_PAGE_SIZE = 24;/);
  });

  it("12) 'Tümünü seç' hâlâ `filtered` üzerinden çalışır (pageItems DEĞİL)", () => {
    expect(src).toMatch(
      /function selectAllFiltered\(\) \{\s*setSelected\(new Set\(filtered\.map\(\(v\) => v\.id\)\)\);/
    );
    expect(src).not.toMatch(/setSelected\(new Set\(pageItems/);
  });

  it("13) dilimleme YALNIZ sortedFiltered üzerinde, pipeline'dan SONRA", () => {
    expect(src).toMatch(
      /const pageItems = sortedFiltered\.slice\(/
    );
    /* filtered/sortedFiltered zincirine dilimleme sızmamış. */
    expect(src).not.toMatch(/filtered\s*=\s*[^;]*\.slice\(/);
  });

  it("14) paylaşım hâlâ seçili id'lerle çalışır (render'la değil)", () => {
    expect(src).toMatch(/villaIds: Array\.from\(selected\)/);
  });

  it("15) URL/router mimarisine dokunulmadı", () => {
    /* Yorum satırları hariç YALNIZ gerçek kod incelenir. */
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/from\s*"next\/navigation"/);
    expect(code).not.toMatch(/useSearchParams|useRouter|usePathname/);
  });
});
