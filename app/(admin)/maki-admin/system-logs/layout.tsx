import type { ReactNode } from "react";

import AdminSectionGuard from "@/app/components/admin/AdminSectionGuard";

/* 🛡️ Admin yetki kapısı — /maki-admin/system-logs/* (alt ve dinamik route'lar
   dahil). İzin haritası: lib/auth/admin-permission-map.ts */
export default function Layout({ children }: { children: ReactNode }) {
  return <AdminSectionGuard need="system_logs">{children}</AdminSectionGuard>;
}
