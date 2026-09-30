/* ===============================================================
   🛡️ MIGRATION 086 — ADMIN MENÜ ÇEVİRİ UI TESTLERİ
   ===============================================================
   `PageTranslationsCard.test.tsx` (Phase 12C) ile AYNI mock-katman
   prensibi.

   Kapsam:
     A) `MenuTranslationsPanel` — mevcut menüyü DÜZENLEME akışı
     B) `/maki-admin/menu/new` — YENİ menü oluştururken TR + EN + DE
     C) Mevcut CRUD sözleşmesinin BOZULMADIĞI (POST payload, href,
        source_type/source_id)

   ⚠️ Bu ekranlar ADMIN ARAYÜZ DİLİNİ DEĞİŞTİRMEZ — admin Türkçe kalır.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/* ---------- mock katmanı ---------- */
const loadMenuTranslationsMock = vi.fn();
const saveMenuTranslationMock = vi.fn();
vi.mock("@/app/(admin)/maki-admin/menu/menu-translations.action", () => ({
  loadMenuTranslationsAction: (...a: unknown[]) =>
    loadMenuTranslationsMock(...a),
  saveMenuTranslationAction: (...a: unknown[]) => saveMenuTranslationMock(...a),
}));

const adminFetchMock = vi.fn();
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (...a: unknown[]) => adminFetchMock(...a),
}));

const notifyErrorMock = vi.fn();
const notifySuccessMock = vi.fn();
vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({
    success: notifySuccessMock,
    error: notifyErrorMock,
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

const revalidateMenuMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateMenu: (...a: unknown[]) => revalidateMenuMock(...a),
  revalidateTaxonomy: vi.fn().mockResolvedValue(undefined),
}));

const routerPushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/maki-admin/menu/new",
}));

/* Liste ekranı için dnd-kit shallow mock — sürükle-bırak bu testlerin
   konusu DEĞİL; satır render'ı ve aksiyon görünürlüğü test edilir. */
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: () => null,
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  verticalListSortingStrategy: () => null,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  arrayMove: <T,>(a: T[]) => a,
}));
vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

import MenuTranslationsPanel from "@/app/(admin)/maki-admin/menu/MenuTranslationsPanel";
import NewMenu from "@/app/(admin)/maki-admin/menu/new/page";
import MenuPage from "@/app/(admin)/maki-admin/menu/page";

beforeEach(() => {
  vi.clearAllMocks();
  loadMenuTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  saveMenuTranslationMock.mockResolvedValue({
    ok: true,
    row: { id: "t1", menu_id: "m1", locale: "en", name: "X" },
  });
  adminFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, pages: [], types: [], locations: [], menu: [] }),
  });
});

/* ===============================================================
   A) MenuTranslationsPanel — DÜZENLEME
   =============================================================== */
describe("MenuTranslationsPanel", () => {
  async function mountPanel(name = "Kiralık Villalar") {
    render(<MenuTranslationsPanel menuId="m1" menuName={name} />);
    await screen.findByLabelText("English");
  }

  it("1) TR adı SALT OKUNUR referans olarak gösterilir (input DEĞİL)", async () => {
    await mountPanel();
    expect(screen.getByText("Kiralık Villalar")).toBeInTheDocument();
    expect(
      (screen.getByText("Kiralık Villalar") as HTMLElement).tagName
    ).not.toBe("INPUT");
  });

  it("2) EN + DE alanları AYNI ANDA görünür", async () => {
    await mountPanel();
    expect(screen.getByLabelText("English")).toBeInTheDocument();
    expect(screen.getByLabelText("Deutsch")).toBeInTheDocument();
  });

  it("3) mevcut çeviriler yüklenir (düzenleme akışı)", async () => {
    loadMenuTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        { locale: "en", name: "Rental Villas" },
        { locale: "de", name: "Mietvillen" },
      ],
    });
    await mountPanel();
    expect(loadMenuTranslationsMock).toHaveBeenCalledWith("m1");
    expect(screen.getByLabelText("English")).toHaveValue("Rental Villas");
    expect(screen.getByLabelText("Deutsch")).toHaveValue("Mietvillen");
  });

  it("4) EN + DE güncellenir ve İKİSİ DE kaydedilir", async () => {
    await mountPanel();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.change(screen.getByLabelText("Deutsch"), {
      target: { value: "Mietvillen" },
    });
    fireEvent.click(screen.getByText("Çevirileri kaydet"));

    await waitFor(() =>
      expect(saveMenuTranslationMock).toHaveBeenCalledTimes(2)
    );
    expect(saveMenuTranslationMock).toHaveBeenCalledWith({
      menuId: "m1",
      locale: "en",
      name: "Rental Villas",
    });
    expect(saveMenuTranslationMock).toHaveBeenCalledWith({
      menuId: "m1",
      locale: "de",
      name: "Mietvillen",
    });
  });

  it("5) BOŞ bırakılabilir — kaydetme hata VERMEZ", async () => {
    await mountPanel();
    fireEvent.click(screen.getByText("Çevirileri kaydet"));
    await waitFor(() =>
      expect(saveMenuTranslationMock).toHaveBeenCalledTimes(2)
    );
    expect(saveMenuTranslationMock.mock.calls[0][0].name).toBe("");
    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("6) kayıt sonrası MEVCUT cache invalidation çağrılır (revalidateMenu)", async () => {
    await mountPanel();
    fireEvent.click(screen.getByText("Çevirileri kaydet"));
    await waitFor(() => expect(revalidateMenuMock).toHaveBeenCalled());
  });

  it("7) yetkisiz/hatalı kayıt kullanıcıya bildirilir, 2. locale denenmez", async () => {
    saveMenuTranslationMock.mockResolvedValue({ ok: false, error: "Yetkisiz" });
    await mountPanel();
    fireEvent.click(screen.getByText("Çevirileri kaydet"));
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(saveMenuTranslationMock).toHaveBeenCalledTimes(1);
    expect(revalidateMenuMock).not.toHaveBeenCalled();
  });

  it("8) okuma hatası kullanıcıya bildirilir (panel çökmez)", async () => {
    loadMenuTranslationsMock.mockResolvedValue({
      ok: false,
      error: "Çeviriler okunamadı",
    });
    render(<MenuTranslationsPanel menuId="m1" menuName="X" />);
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
  });
});

/* ===============================================================
   B+C) /maki-admin/menu/new — OLUŞTURMA
   =============================================================== */
describe("/maki-admin/menu/new — TR + EN + DE", () => {
  async function fillManual() {
    render(<NewMenu />);
    await waitFor(() => expect(adminFetchMock).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText("Örn: İletişim"), {
      target: { value: "Kiralık Villalar" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("/iletisim veya https://…"),
      { target: { value: "/kiralik-villalar" } }
    );
  }

  function mockCreateOk(id: string | null = "new-menu-id") {
    adminFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, id }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          pages: [],
          types: [],
          locations: [],
          menu: [],
        }),
      });
    });
  }

  it("9) EN + DE alanları formda mevcut", async () => {
    await fillManual();
    expect(screen.getByLabelText("English")).toBeInTheDocument();
    expect(screen.getByLabelText("Deutsch")).toBeInTheDocument();
  });

  it("10) TR + EN + DE birlikte kaydedilir", async () => {
    mockCreateOk();
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.change(screen.getByLabelText("Deutsch"), {
      target: { value: "Mietvillen" },
    });
    fireEvent.click(screen.getByText("Kaydet"));

    await waitFor(() =>
      expect(saveMenuTranslationMock).toHaveBeenCalledTimes(2)
    );
    expect(saveMenuTranslationMock).toHaveBeenCalledWith({
      menuId: "new-menu-id",
      locale: "en",
      name: "Rental Villas",
    });
    expect(saveMenuTranslationMock).toHaveBeenCalledWith({
      menuId: "new-menu-id",
      locale: "de",
      name: "Mietvillen",
    });
  });

  it("11) MEVCUT POST payload'ı DEĞİŞMEDİ (name/href/source_type/source_id/is_active)", async () => {
    mockCreateOk();
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));

    await waitFor(() =>
      expect(
        adminFetchMock.mock.calls.some((c) => c[1]?.method === "POST")
      ).toBe(true)
    );
    const post = adminFetchMock.mock.calls.find(
      (c) => c[1]?.method === "POST"
    )!;
    expect(post[0]).toBe("/api/admin/menu");
    expect(JSON.parse(post[1].body as string)).toEqual({
      name: "Kiralık Villalar",
      href: "/kiralik-villalar",
      source_type: "manual",
      source_id: null,
      is_active: true,
    });
  });

  it("12) EN/DE BOŞ bırakılırsa çeviri isteği HİÇ atılmaz", async () => {
    mockCreateOk();
    await fillManual();
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(routerPushMock).toHaveBeenCalled());
    expect(saveMenuTranslationMock).not.toHaveBeenCalled();
  });

  it("13) yalnız EN doldurulursa TEK çeviri isteği atılır", async () => {
    mockCreateOk();
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() =>
      expect(saveMenuTranslationMock).toHaveBeenCalledTimes(1)
    );
    expect(saveMenuTranslationMock.mock.calls[0][0].locale).toBe("en");
  });

  it("14) id dönmezse (eski/None yanıt) menü OLUŞUR, çeviri atlanır — çökme yok", async () => {
    mockCreateOk(null);
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    expect(saveMenuTranslationMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/maki-admin/menu");
  });

  it("15) çeviri kaydı patlarsa menü kaydı BOZULMAZ (best-effort)", async () => {
    mockCreateOk();
    saveMenuTranslationMock.mockResolvedValue({
      ok: false,
      error: "Yetkisiz",
    });
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    expect(notifyErrorMock).toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/maki-admin/menu");
  });

  it("16) menü oluşturma BAŞARISIZSA çeviri hiç denenmez", async () => {
    adminFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: "boom" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, pages: [], types: [], locations: [], menu: [] }),
      });
    });
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(saveMenuTranslationMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  /* ===========================================================
     KAPSAM KİLİDİ — çeviri alanları YALNIZ "Manuel Link" türünde
     =========================================================== */
  it.each([
    ["CMS Sayfa"],
    ["Mülk Tipi"],
    ["Bölge"],
  ])("17-%#) '%s' türü seçilince EN/DE alanları GİZLENİR", async (label) => {
    render(<NewMenu />);
    await waitFor(() => expect(adminFetchMock).toHaveBeenCalled());
    /* Varsayılan "Manuel Link" → alanlar görünür. */
    expect(screen.getByLabelText("English")).toBeInTheDocument();

    fireEvent.click(screen.getByText(label));
    expect(screen.queryByLabelText("English")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Deutsch")).not.toBeInTheDocument();
  });

  it("20) manual'de doldurulup tür DEĞİŞTİRİLİRSE çeviri yazılmaz", async () => {
    mockCreateOk();
    render(<NewMenu />);
    await waitFor(() => expect(adminFetchMock).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    /* Tür değişir → alanlar gizlenir, taslak temizlenir. */
    fireEvent.click(screen.getByText("Mülk Tipi"));
    fireEvent.click(screen.getByText("Manuel Link"));
    expect(screen.getByLabelText("English")).toHaveValue("");
  });
});

/* ===============================================================
   D) /maki-admin/menu listesi — "Çeviriler" YALNIZ manual satırda
   =============================================================== */
describe("/maki-admin/menu — çeviri aksiyonu görünürlüğü", () => {
  const MENU_ROWS = [
    {
      id: "m-manual",
      name: "Kiralık Villalar",
      href: "/kiralik-villalar",
      order: 1,
      parent_id: null,
      source_type: "manual",
      source_id: null,
    },
    {
      id: "m-page",
      name: "Hakkımızda",
      href: "/p/hakkimizda",
      order: 2,
      parent_id: null,
      source_type: "page",
      source_id: "p1",
    },
    {
      id: "m-category",
      name: "Lüks Villa",
      href: "/arama?villa-turleri=luks-villa",
      order: 3,
      parent_id: null,
      source_type: "category",
      source_id: "t1",
    },
    {
      id: "m-region",
      name: "Kalkan",
      href: "/arama?bolgeler=kalkan",
      order: 4,
      parent_id: null,
      source_type: "region",
      source_id: "l1",
    },
  ];

  beforeEach(() => {
    adminFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        menu: MENU_ROWS,
        /* page-auto satırı: menüde referansı OLMAYAN, show_in_menu=true */
        pages: [
          { id: "p1", title: "Hakkımızda", slug: "hakkimizda", show_in_menu: true },
          { id: "p2", title: "İletişim", slug: "iletisim", show_in_menu: true },
        ],
        types: [{ id: "t1", name: "Lüks Villa", slug: "luks-villa" }],
        locations: [{ id: "l1", name: "Kalkan", slug: "kalkan" }],
      }),
    });
  });

  it("21) TEK 'Çeviriler' butonu var — yalnız manual satırda", async () => {
    render(<MenuPage />);
    await screen.findByText("Kiralık Villalar");
    expect(screen.getAllByText("Çeviriler")).toHaveLength(1);
  });

  it("22) page / category / region / page-auto satırlarında buton YOK", async () => {
    render(<MenuPage />);
    await screen.findByText("Kiralık Villalar");
    /* Tüm satırlar listede (sıralama/parent-child değişmedi). */
    for (const name of ["Hakkımızda", "Lüks Villa", "Kalkan", "İletişim"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    /* Ama çeviri butonu yalnız 1 tane (manual). */
    const buttons = screen.getAllByText("Çeviriler");
    expect(buttons).toHaveLength(1);
  });

  it("23) butona basınca panel AÇILIR ve doğru menuId ile yüklenir", async () => {
    render(<MenuPage />);
    await screen.findByText("Kiralık Villalar");
    fireEvent.click(screen.getByText("Çeviriler"));
    await waitFor(() =>
      expect(loadMenuTranslationsMock).toHaveBeenCalledWith("m-manual")
    );
    expect(await screen.findByLabelText("English")).toBeInTheDocument();
  });

  it("24) href / sıralama / kaynak rozetleri DEĞİŞMEDİ", async () => {
    render(<MenuPage />);
    await screen.findByText("Kiralık Villalar");
    expect(screen.getByText("/kiralik-villalar")).toBeInTheDocument();
    expect(
      /* 🛡️ SEO landing — kategori menü öğesi `/villa-turleri/<slug>`. */
      screen.getByText("/villa-turleri/luks-villa")
    ).toBeInTheDocument();
    expect(screen.getByText("/arama?bolgeler=kalkan")).toBeInTheDocument();
    expect(screen.getByText("/p/hakkimizda")).toBeInTheDocument();
  });
});
