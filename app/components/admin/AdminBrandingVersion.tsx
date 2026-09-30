"use client";

import { createContext, useContext, type ReactNode } from "react";

/* ===============================================================
   🛡️ ADMIN BRANDING GÖRSEL VERSİYONU (admin logo / admin icon)
   ===============================================================
   `branding/admin-logo.webp` ve `branding/admin-icon.webp` sabit
   path'e overwrite edilir ve DB kaydı yoktur. Versiyon (R2 ETag)
   `app/(admin)/layout.tsx` (server) tarafından okunur ve buradan
   client admin layout'una / login sayfasına iletilir →
   `getAdminLogoUrl(version)` / `getAdminIconUrl(version)`.
   Versiyon yoksa `undefined` → URL BUGÜNKÜ gibi (hydration-safe,
   server ve client aynı değeri görür).
   =============================================================== */
export type AdminBrandingVersions = {
  logo?: string;
  icon?: string;
};

const AdminBrandingVersionContext = createContext<AdminBrandingVersions>({});

export function AdminBrandingVersionProvider({
  versions,
  children,
}: {
  versions: AdminBrandingVersions;
  children: ReactNode;
}) {
  return (
    <AdminBrandingVersionContext.Provider value={versions}>
      {children}
    </AdminBrandingVersionContext.Provider>
  );
}

export function useAdminBrandingVersions(): AdminBrandingVersions {
  return useContext(AdminBrandingVersionContext);
}
