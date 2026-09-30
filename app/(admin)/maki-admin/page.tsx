import "server-only";

import Link from "next/link";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { ArrowUpRight } from "lucide-react";

import { getDailyReservationCounts } from "@/app/services/analytics.service";
import { getOperationsSnapshot } from "@/app/services/operations.service";
import ReservationsChart from "@/app/components/admin/dashboard/ReservationsChart";
import UpcomingOperations from "@/app/components/admin/dashboard/UpcomingOperations";
import HideableSection from "@/app/components/admin/dashboard/HideableSection";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";
import { adminPermissionGate } from "@/app/components/admin/AdminSectionGuard";

export default async function AdminHome() {
  /* 🛡️ SEC-01 — AUTH ÖNCE, VERİ SONRA. Middleware yalnız optimistic
     redirect kapısıdır (refresh cookie'nin varlığına bakar); gerçek
     oturum burada mevcut `authorizeAdminSession()` ile doğrulanır.
     Başarısızsa HİÇBİR sorgu çalışmaz, veri üretilmez. */
  const auth = await authorizeAdminSession();
  if (!auth.ok) return <AdminPageSessionRefresh />;

  /* 🛡️ Yetki ("dashboard") — VERİDEN ÖNCE. Yetkisiz admin (login sonrası
     herkes buraya gelir) menü sırasındaki ilk izinli bölüme yönlendirilir;
     rezervasyon/misafir verisi hiç sorgulanmaz. */
  const denied = await adminPermissionGate(auth.caller.id, "dashboard");
  if (denied) return denied;

  /* Dashboard data fetch — yalnız operasyon odaklı sectionlar için
     gerçek veri çekilir. Eski statik KPI counts (toplam villa,
     toplam rezervasyon, tahmini gelir) UI cleanup'ı sonrası
     kaldırıldı; ilgili count query'leri de düşürüldü (no-op fetch
     yok). */
  const [{ data: recent }, dailyReservations, operationsSnapshot] =
    await Promise.all([
      /* 🛡️ PHASE 3: recent reservations server-side service_role ile
         (040 admin-only RLS sonrası server-anon reddedilir). PII
         (name/total_price) yalnız server'da; admin dashboard'da zaten
         gösterilen alanlar. */
      reservationServerRepository.findRecentForDashboard(),
      /* 📊 ANALYTICS — son 30 gün günlük rezervasyon serisi
         (pending + confirmed; rejected/cancelled hariç). Tek SELECT
         + JS-side bucket; finance / booking / pricing engine'lere
         sıfır etkileşim. Hata durumunda 30-elemanlı sıfır seri döner
         (UI tarafı çökmez). */
      getDailyReservationCounts(30),
      /* 🏨 OPERATIONS — yaklaşan giriş/çıkış count + items
         (bugün/yarın/7gün × in/out, detay listesi inline). Tek
         SELECT + JS-side single-pass aggregation; reservation/
         booking/pricing logic'e sıfır etkileşim. Hata durumunda
         EMPTY_SNAPSHOT döner (UI tarafı çökmez). */
      getOperationsSnapshot(),
    ]);

  return (
    <div className="space-y-10">
      {/* ANALYTICS — Son 30 Gün Rezervasyonları */}
      <section className="admin-card-flat overflow-hidden">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Son 30 Gün Rezervasyonları</h3>
            <p className="admin-card__sub">
              Günlük oluşturulan rezervasyon sayısı
            </p>
          </div>
        </div>
        <div className="p-5">
          <HideableSection label="Günlük rezervasyon grafiği">
            <ReservationsChart data={dailyReservations} />
          </HideableSection>
        </div>
      </section>

      {/* UPCOMING OPERATIONS — Yaklaşan giriş/çıkış paneli */}
      <UpcomingOperations snapshot={operationsSnapshot} />

      {/* RECENT RESERVATIONS */}
      <section className="admin-table">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Son rezervasyonlar</h3>
            <p className="admin-card__sub">En yeni 5 talep</p>
          </div>
          <Link href="/maki-admin/reservations" className="admin-muted-link">
            Tümü
            <ArrowUpRight size={13} />
          </Link>
        </div>

        {recent && recent.length > 0 ? (
          <HideableSection label="Son rezervasyonlar listesi">
            <div>
              {recent.map((r: any) => (
                <Link
                  key={r.id}
                  href={`/maki-admin/reservations/${r.id}`}
                  className="admin-row"
                >
                  <div className="w-9 h-9 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center text-[var(--admin-muted)] font-medium text-[13px] shrink-0">
                    {(r.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[var(--admin-text)] truncate">
                      {r.name || "İsimsiz"}
                    </p>
                    <p className="text-[12px] text-[var(--admin-muted-2)] truncate mt-0.5">
                      {r.villa?.title || "Mülk yok"}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                  <p className="font-display text-[15px] text-[var(--admin-text)] hidden md:block tabular-nums">
                    ₺
                    {new Intl.NumberFormat("tr-TR").format(
                      Number(r.total_price || 0)
                    )}
                  </p>
                </Link>
              ))}
            </div>
          </HideableSection>
        ) : (
          <div className="p-12 text-center">
            <p className="text-[var(--admin-muted-2)] italic">
              Henüz rezervasyon yok
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Bekliyor", cls: "admin-badge--pending" },
    confirmed: { label: "Onaylandı", cls: "admin-badge--confirmed" },
    rejected: { label: "Reddedildi", cls: "admin-badge--rejected" },
  };
  const conf = map[status] || {
    label: status || "-",
    cls: "admin-badge--neutral",
  };
  return (
    <span className={`admin-badge ${conf.cls}`}>
      <span className="admin-badge__dot" />
      {conf.label}
    </span>
  );
}
