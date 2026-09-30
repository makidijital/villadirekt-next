import type { Metadata } from "next";

import { ADMIN_BRANDING_PATHS, getAdminIconUrl } from "@/lib/admin-branding";
import { getSiteAssetVersions } from "@/lib/storage/site-asset-version.server";
import { AdminBrandingVersionProvider } from "@/app/components/admin/AdminBrandingVersion";

/* ===============================================================
   🛡️ ADMIN-WIDE CACHE BYPASS — force-dynamic (server layout)
   ===============================================================
   Bu dosya `(admin)` route group'unun TEPE LAYOUT'udur. Server
   component (`"use client"` yok) olduğu için Next.js Route Segment
   Config seçenekleri export edebilir.

   `export const dynamic = "force-dynamic"` direktifi Next.js
   inheritance kuralı ile `(admin)/**` altındaki TÜM child route
   segment'lere uygulanır:
     - app/(admin)/maki-admin/page.tsx
     - app/(admin)/maki-admin/villas/**
     - app/(admin)/maki-admin/reservations/**
     - app/(admin)/maki-admin/settings/**
     - ... (toplam 47 admin page.tsx)

   Child page'ler `"use client"` olsa bile parent server layout'tan
   inherit ederler (kendi `export const dynamic` yazamasalar bile).
   Mevcut `maki-admin/layout.tsx` `"use client"` durumu BU
   DAVRANIŞI ETKİLEMEZ — bu layout daha üst seviyede, Route Segment
   Config server layout'unda kalır.

   PUBLIC ROUTE GROUP `(public)` ETKİLENMEZ — kendi ISR + revalidate
   tag + unstable_cache stratejisi korunur (sitemap, anasayfa,
   villa detay, kategori/bölge koleksiyonları, vb.).

   Mevcut child segment'lerden bazıları (villa-listesi, villas)
   kendi `export const dynamic = "force-dynamic"` deklarasyonunu
   taşıyor — Route Segment Config inheritance kuralında deeper-wins
   geçerli, aynı değer override edildiği için davranış değişmez.

   AMAÇ: Production'da admin mutation sonrası (villa silme, ekleme,
   güncelleme, settings save vb.) cached HTML servis edilmesinin
   önüne geçmek. Local dev (`next dev`) zaten her request fresh
   render yaptığı için davranış local'de değişmez.
=============================================================== */
export const dynamic = "force-dynamic";

/* ===============================================================
   🛡️ ADMIN METADATA — public root metadata'sını YALNIZ (admin)/** için
   ezer (Next.js metadata kalıtımı; deeper-wins).
     - title.absolute: root'un public title'ını + olası template'i yok
       sayar → tüm admin sekmelerinde sabit "MAKİ Dijital — Yönetim Paneli".
     - icons: MAKİ admin favicon (server-side; client useAdminFavicon hook'u
       zararsız kalır, flash kalkar).
     - robots: admin noindex/nofollow (hijyen; public SEO ETKİLENMEZ).
   PUBLIC ROUTE GROUP `(public)` root metadata'sını AYNEN kullanır —
   bu override route-group izole, public'e SIZMAZ.
=============================================================== */
/* 🛡️ Admin logo/icon `?ts=<R2 ETag>` — sabit path'e overwrite edilen
   branding görselleri değişince URL de değişir (DB kaydı yok; versiyon
   R2 nesnesinden okunur, 1 saat cache + upload'da anında invalidation).
   Versiyon alınamazsa URL'ler BUGÜNKÜ gibi versiyonsuz. */
async function getAdminBrandingVersions() {
  const v = await getSiteAssetVersions([
    ADMIN_BRANDING_PATHS["admin-logo"],
    ADMIN_BRANDING_PATHS["admin-icon"],
  ]);
  return {
    logo: v[ADMIN_BRANDING_PATHS["admin-logo"]],
    icon: v[ADMIN_BRANDING_PATHS["admin-icon"]],
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { icon } = await getAdminBrandingVersions();
  return {
    title: { absolute: "MAKİ Dijital — Yönetim Paneli" },
    icons: { icon: getAdminIconUrl(icon) },
    robots: { index: false, follow: false },
  };
}

export default async function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const versions = await getAdminBrandingVersions();
  return (
    <AdminBrandingVersionProvider versions={versions}>
      {children}
    </AdminBrandingVersionProvider>
  );
}
