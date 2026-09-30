import type { ReactNode } from "react";

import AdminSectionGuard from "@/app/components/admin/AdminSectionGuard";

/* 🛡️ Admin yetki kapısı — /maki-admin/messages/* (alt ve dinamik route'lar
   dahil). İzin haritası: lib/auth/admin-permission-map.ts */
export default function Layout({ children }: { children: ReactNode }) {
  return <AdminSectionGuard need="messages">{children}</AdminSectionGuard>;
}
