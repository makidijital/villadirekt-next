import Link from "next/link";
import { getVillasForAdminPage } from "@/app/services/villa.service";
import { Plus, Home, Trash as TrashBin, ArrowDownUp, FileCheck } from "lucide-react";
import VillaOperationsList from "./_components/VillaOperationsList";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";
import { adminPermissionGate } from "@/app/components/admin/AdminSectionGuard";

/* 🛡️ FORCE-DYNAMIC — production statik cache problemi çözümü.
   `searchParams` dinamik API olduğu için Next.js 16'da bu sayfa
   zaten dynamic olur; force-dynamic ek garanti (FAZ 30 pattern). */
export const dynamic = "force-dynamic";

/* ===============================================================
   🛡️ PAGINATION SÖZLEŞMESİ
   ===============================================================
   URL state source-of-truth:
     ?page=N         (1-based; default 1)
     ?pageSize=M     (allowed: 10 | 30 | 50 | 100; default 30)
     ?q=text         (search; default boş)

   Sıralama paneli (/siralama) bu pagination'dan ETKİLENMEZ —
   ayrı service (`getVillasForAdmin` no opts) kullanır → tam liste
   alır. Bu sayfa yalnız operasyon ekranı için.
=============================================================== */
const ALLOWED_PAGE_SIZES = [10, 30, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 30;

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  q?: string;
  status?: string;
  document?: string;
}>;

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function parsePageSize(raw: string | undefined): number {
  const n = Number(raw);
  if (
    !Number.isFinite(n) ||
    !ALLOWED_PAGE_SIZES.includes(n as (typeof ALLOWED_PAGE_SIZES)[number])
  ) {
    return DEFAULT_PAGE_SIZE;
  }
  return n;
}

function parseQ(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

/* status → is_active filtre değeri.
   "active" → true, "passive" → false, geçersiz/eksik → undefined
   (undefined = filtre YOK; tüm villalar; eski davranış korunur). */
function parseStatus(value?: string): boolean | undefined {
  if (value === "active") return true;
  if (value === "passive") return false;
  return undefined;
}

/* document → belge filtresi. "licensed"/"unlicensed" geçerli, aksi
   halde undefined (filtre YOK; tüm villalar; eski davranış korunur). */
function parseDocument(value?: string): "licensed" | "unlicensed" | undefined {
  if (value === "licensed") return "licensed";
  if (value === "unlicensed") return "unlicensed";
  return undefined;
}

export default async function VillasPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  /* 🛡️ SEC-01 — AUTH ÖNCE, VERİ SONRA (bkz. maki-admin/page.tsx). */
  const auth = await authorizeAdminSession();
  if (!auth.ok) return <AdminPageSessionRefresh />;

  /* 🛡️ Yetki ("villas") — VERİDEN ÖNCE. Bölüm layout'u sayfanın
     server render'ını durdurmadığı için kontrol burada da yapılır. */
  const denied = await adminPermissionGate(auth.caller.id, "villas");
  if (denied) return denied;

  const sp = (await searchParams) || {};
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const q = parseQ(sp.q);
  const status = sp.status;
  const active = parseStatus(status);
  const document = sp.document;
  const documentFilter = parseDocument(document);

  /* 🛡️ Admin listing: pasif villalar dahil; soft-deleted hariç.
     YENİ service: pagination + search. Sıralama paneli'nin kullandığı
     `getVillasForAdmin()` (tam liste) BYTE-IDENTICAL korundu. */
  const {
    items: villas,
    total,
    page: serverPage,
    pageSize: serverPageSize,
  } = await getVillasForAdminPage({
    page,
    pageSize,
    q,
    active,
    document: documentFilter,
  });

  return (
    <div className="space-y-10">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Mülkler</p>
          <h1 className="admin-page-header__title">Tüm mülkler</h1>
          <p className="admin-page-header__sub">
            Toplam{" "}
            <span className="text-[var(--admin-text)] font-semibold">
              {total}
            </span>{" "}
            villa kayıtlı. Buradan ekleyebilir, düzenleyebilir ve galeri
            yönetimine geçebilirsin.
          </p>
        </div>
        {/* Dar ekranda iç navigasyon butonları taşmak yerine alt satıra
           geçer; geniş ekranda (xl+) tek satırda kalır. */}
        <div className="admin-page-header__actions flex-wrap xl:flex-nowrap xl:shrink-0">
          {/* 🛡️ Sıralama ayrı ekrana taşındı — drag-drop için
             /maki-admin/villas/siralama. */}
          <Link
            href="/maki-admin/villas/siralama"
            className="admin-btn-ghost"
          >
            <ArrowDownUp size={14} />
            Sıralamayı Düzenle
          </Link>
          {/* 🛡️ KTB belge kontrolü — /maki-admin/villas/belge-kontrol. */}
          <Link
            href="/maki-admin/villas/belge-kontrol"
            className="admin-btn-ghost"
          >
            <FileCheck size={14} />
            Belge Kontrolü
          </Link>
          <Link
            href="/maki-admin/villas/trash"
            className="admin-btn-ghost"
          >
            <TrashBin size={14} />
            Çöp Kutusu
          </Link>
          <Link href="/maki-admin/villas/ekle" className="admin-btn-primary">
            <Plus size={15} />
            Yeni Mülk
          </Link>
        </div>
      </header>

      {/* LIST */}
      {total === 0 && q.length === 0 ? (
        <div className="admin-card-flat p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center mx-auto">
            <Home size={18} className="text-[var(--admin-muted)]" />
          </div>
          <h3 className="font-display text-[22px] text-[var(--admin-text)] mt-4 tracking-[-0.015em]">
            Henüz mülk eklenmemiş
          </h3>
          <p className="text-[var(--admin-muted)] text-sm mt-2 max-w-sm mx-auto">
            İlk mülkünü ekleyerek katalog oluşturmaya başla. Daha sonra galeri,
            fiyatlar ve özellikler ekleyebilirsin.
          </p>
          <Link
            href="/maki-admin/villas/ekle"
            className="admin-btn-primary mt-6 inline-flex"
          >
            <Plus size={15} />
            Mülk Ekle
          </Link>
        </div>
      ) : (
        /* 🛡️ Operasyon ekranı — VillaOperationsList client island.
           Pagination + search URL bound; sıralama /siralama route'unda. */
        <VillaOperationsList
          initialVillas={villas}
          total={total}
          page={serverPage}
          pageSize={serverPageSize}
          q={q}
          status={status}
          document={document}
          allowedPageSizes={ALLOWED_PAGE_SIZES as unknown as number[]}
        />
      )}
    </div>
  );
}
