import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getVillasForSortOrder } from "@/app/services/villa.service";
import VillaSortPanel from "./_components/VillaSortPanel";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";
import { adminPermissionGate } from "@/app/components/admin/AdminSectionGuard";

/* ===============================================================
   🛡️ ADMIN — VILLA SIRALA (drag-drop only)
   ===============================================================
   Mevcut `/maki-admin/villas` operasyon ekranından AYRILMIŞ
   drag-drop sıralama akışı. Tek sorumluluk: villa sort_order
   güncellemek. Operasyonel aksiyonlar (düzenle/galeri/takvim/
   ZIP/temporary URL/kopyala/pasifleştir/sil) burada YOK; admin
   onlar için "Mülkler" ekranına döner.

   VERI KAYNAĞI:
     `getVillasForSortOrder()` — bu ekrana ÖZEL minimal projection
     (`id, title, sort_order`). Satır KÜMESİ ve SIRASI eski
     `getVillasForAdmin()` ile BİREBİR aynı (aynı WHERE
     `deleted_at IS NULL`, aynı `ORDER BY sort_order ASC,
     created_at DESC`); pagination YOK. Bu sayfa tüm aktif+pasif
     (soft-deleted hariç) villaları tek seferde fetch eder —
     sort_order semantiği GLOBAL kalır.
     ⚠️ `getVillasForAdmin()` / `listForAdmin()` DEĞİŞTİRİLMEDİ;
     `/maki-admin/villas` operasyon ekranı onları kullanmaya
     devam eder.

   CACHE:
     `dynamic = "force-dynamic"` — FAZ 30 pattern; mutation
     sonrası router.refresh + revalidateVillas zinciri panelden
     gelir.

   PERMISSION:
     Sidebar menüsünde `permissionKey: "villas"` reuse — yeni
     permission/role/migration YOK.
=============================================================== */

export const dynamic = "force-dynamic";

export default async function VillaSiralaPage() {
  /* 🛡️ SEC-01 — AUTH ÖNCE, VERİ SONRA (bkz. maki-admin/page.tsx). */
  const auth = await authorizeAdminSession();
  if (!auth.ok) return <AdminPageSessionRefresh />;

  /* 🛡️ Yetki ("villas") — VERİDEN ÖNCE. Bölüm layout'u sayfanın
     server render'ını durdurmadığı için kontrol burada da yapılır. */
  const denied = await adminPermissionGate(auth.caller.id, "villas");
  if (denied) return denied;

  // 🛡️ Admin listing: pasif villalar dahil; soft-deleted hariç.
  //    Minimal projection — panel yalnız id + title okuyor.
  const villas = await getVillasForSortOrder();

  return (
    <div className="space-y-10">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <Link
            href="/maki-admin/villas"
            className="inline-flex items-center gap-1 text-[13px] text-[var(--admin-muted)] hover:text-[var(--admin-text)] transition"
          >
            <ChevronLeft size={14} />
            Mülkler
          </Link>
          <p className="admin-page-eyebrow mt-3">Mülkler</p>
          <h1 className="admin-page-header__title">Mülk Sırala</h1>
          <p className="admin-page-header__sub">
            Mülkleri sürükle-bırak ile sırala. Sıra anlık olarak
            kaydedilir; public site, arama ve homepage listeleri
            otomatik güncellenir. Bu ekranda yalnız sıralama yapılır
            — düzenleme / galeri / silme gibi işlemler için{" "}
            <Link
              href="/maki-admin/villas"
              className="underline decoration-dotted underline-offset-4 hover:text-[var(--admin-text)]"
            >
              Mülkler
            </Link>{" "}
            ekranına dön.
          </p>
        </div>
      </header>

      {/* PANEL — drag-drop minimal liste */}
      <VillaSortPanel initialVillas={villas} />
    </div>
  );
}
