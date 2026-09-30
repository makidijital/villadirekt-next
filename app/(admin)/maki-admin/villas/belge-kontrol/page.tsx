import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getLicenseCheckOverview } from "@/app/services/villa-license-check.service";
import LicenseCheckPanel from "./_components/LicenseCheckPanel";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";
import { adminPermissionGate } from "@/app/components/admin/AdminSectionGuard";

/* ===============================================================
   🛡️ ADMIN — MÜLKLER → BELGE KONTROLÜ (KTB)
   ===============================================================
   Aktif villaların `tourism_document_number` değerlerini KTB resmi
   sorgu sayfası üzerinden kontrol eder; sonuç + geçmiş ayrı tablolarda
   (migration 098). Otomatik pasife alma YOK.
   Tarama cron'suz: panel açıkken küçük batch'lerle ilerler
   (POST /api/admin/villa-license-checks/runs/[runId]/tick).
   PERMISSION: bölüm layout'u + sayfa kapısı "villas" (siralama ile
   aynı desen) — yeni permission YOK.
=============================================================== */

export const dynamic = "force-dynamic";

export default async function VillaBelgeKontrolPage() {
  /* 🛡️ SEC-01 — AUTH ÖNCE, VERİ SONRA. */
  const auth = await authorizeAdminSession();
  if (!auth.ok) return <AdminPageSessionRefresh />;
  const denied = await adminPermissionGate(auth.caller.id, "villas");
  if (denied) return denied;

  const overview = await getLicenseCheckOverview();

  return (
    <div className="space-y-8">
      <header className="admin-page-header">
        <div className="min-w-0">
          <p className="admin-page-eyebrow">Mülkler</p>
          <h1 className="admin-page-header__title">Belge Kontrolü</h1>
          <p className="admin-page-header__sub">
            Aktif mülklerin Bakanlık izin belge numaralarını KTB kaydına göre
            kontrol eder. “Kontrol Edilemedi” sonucu belgenin geçersiz olduğu
            anlamına gelmez.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link href="/maki-admin/villas" className="admin-btn-ghost">
            <ChevronLeft size={14} />
            Mülkler
          </Link>
        </div>
      </header>

      <LicenseCheckPanel initialOverview={overview} />
    </div>
  );
}
