import AdminSectionGuard from "@/app/components/admin/AdminSectionGuard";

import SettingsNav from "./_components/SettingsNav";

/* ===============================================================
   🛡️ ADMIN > SETTINGS LAYOUT — modüler experience
   ===============================================================
   Mevcut /maki-admin/settings/page.tsx (1497 satır) DOKUNULMADI;
   içerikleriyle birlikte sticky nav'ın "Tümü (Klasik)" linkinde
   intact. Yeni alt route'lar (genel/iletisim/seo/rezervasyon/...)
   nav'daki diğer linklerle açılır.

   Layout SSR-safe server component; SettingsNav client island
   (usePathname kullanır).
   =============================================================== */

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* 🛡️ Admin yetki kapısı — /maki-admin/settings/* ("settings");
     yetkisiz admin alt menüyü de görmez. */
  return (
    <AdminSectionGuard need="settings">
      <div className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] xl:grid-cols-[240px_1fr] gap-6 lg:gap-10">
          <SettingsNav />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </AdminSectionGuard>
  );
}
