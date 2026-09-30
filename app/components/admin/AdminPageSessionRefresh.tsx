"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useAdmin } from "@/app/components/admin/AdminSessionGuard";

/* ===============================================================
   🛡️ SEC-01 — ADMIN SERVER PAGE: OTURUMSUZ FALLBACK
   ===============================================================
   NEDEN:
     Admin Server Component sayfaları artık veri çekmeden ÖNCE
     `authorizeAdminSession()` (access JWT + admin_users/is_active)
     çağırır. Oturum doğrulanamazsa sayfa HİÇBİR veri üretmeden yalnız
     bu bileşeni döndürür.

   NE YAPAR (yeni auth mantığı YOK):
     Access cookie'nin tarayıcıda süresi dolduğunda (maxAge = access
     TTL) mevcut akış zaten şudur: `AdminSessionGuard` →
     `/api/auth/me` 401 → `POST /api/auth/refresh` → `/me` → admin.
     Bu bileşen yalnız o MEVCUT yenileme tamamlandığında (guard `admin`
     state'ini set ettiğinde) `router.refresh()` ile sayfanın server
     render'ını yeni access cookie ile tekrar ister. Kendisi refresh
     endpoint'ini ÇAĞIRMAZ (rotation yarışı yaratmaz).

     • Guard, admin doğrulanamazsa children'ı hiç render etmez ve
       mevcut davranışla login'e yönlendirir → bu bileşen o durumda
       mount olmaz.
     • `admin` referansı her guard lookup'ında yenilenir; en fazla
       MAX_REFRESH kez yenileme istenir (sonsuz döngü koruması).
     • Hiçbir görsel çıktı üretmez.
   =============================================================== */

const MAX_REFRESH = 2;

export default function AdminPageSessionRefresh() {
  const router = useRouter();
  const { admin } = useAdmin();
  const refreshCount = useRef(0);

  useEffect(() => {
    if (!admin) return;
    if (refreshCount.current >= MAX_REFRESH) return;
    refreshCount.current += 1;
    router.refresh();
  }, [admin, router]);

  return null;
}
