import ActivityLogList from "./ActivityLogList";

/* ===============================================================
   🛡️ FAZ 55 — ADMIN ACTIVITY LOGS PAGE
   ===============================================================
   /maki-admin/activity-logs — full audit trail listesi.
   Server-side header + client list island (FAZ 33B / FAZ 40 pattern).
   sidebar_permissions "activity_logs" izin anahtarı migration 028'de
   tüm aktif adminlere eklenir.
=============================================================== */

export default function Page() {
  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Sistem</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Aktivite Logları
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Admin panel üzerinde gerçekleştirilen tüm önemli işlemlerin tam
          audit izi. Filtreleyin, satır açarak before/after JSON'u inceleyin.
        </p>
      </div>
      <ActivityLogList />
    </div>
  );
}
