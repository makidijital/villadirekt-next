/* ===============================================================
   🛡️ ADMIN ROUTE → PERMISSION HARİTASI (tek kaynak, saf / client-safe)
   ===============================================================
   Yetki MODELİ DEĞİŞMEDİ: karar her zaman `admin_users.sidebar_permissions`
   (DB) üzerinden `callerHasPermission` / `requirePermission` ile verilir
   (lib/auth/action-authz). Bu dosya yalnız "hangi bölüm / endpoint hangi
   mevcut anahtarı ister" sorusunu TEK yerde toplar.

   • Sayfa bölümleri: `maki-admin/layout.tsx` menüsündeki `permissionKey`
     değerleriyle BİREBİR aynı ve AYNI SIRADA (tests/unit/
     admin-route-permissions.test.ts bunu kaynak koddan doğrular).
   • Dizi = "herhangi biri yeterli" (OR) — `requirePermission` semantiği.
   • Yeni anahtar / rol / süper-admin kavramı YOK.
   =============================================================== */

import type { PermissionRequirement } from "@/lib/auth/action-authz";

export type AdminSection = { href: string; need: PermissionRequirement };

/** Menü sırasıyla admin bölümleri (ilk izinli bölüm = varsayılan açılış). */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { href: "/maki-admin", need: "dashboard" },
  { href: "/maki-admin/villas", need: "villas" },
  { href: "/maki-admin/types", need: "villa_types" },
  { href: "/maki-admin/features", need: "features" },
  { href: "/maki-admin/rules", need: "rules" },
  { href: "/maki-admin/price-includes", need: "price_includes" },
  { href: "/maki-admin/locations", need: "locations" },
  { href: "/maki-admin/villa-listesi", need: "villa_lists" },
  { href: "/maki-admin/property-owners", need: "property_owners" },
  { href: "/maki-admin/reservations", need: "reservations" },
  { href: "/maki-admin/manual-reservations", need: "manual_reservations" },
  { href: "/maki-admin/external-reservations", need: "external_calendars" },
  { href: "/maki-admin/offer-requests", need: "offer_requests" },
  { href: "/maki-admin/payment-methods", need: "payment_methods" },
  /* Menü anahtarı "payment_accounts"; sayfanın TÜM action'ları zaten
     ["payment_accounts","settings"] ister (payment-account.action.ts) →
     sayfa da aynı OR kümesiyle korunur (erişim daralmaz). */
  { href: "/maki-admin/payment-accounts", need: ["payment_accounts", "settings"] },
  { href: "/maki-admin/maki-finans", need: "finance" },
  { href: "/maki-admin/pages", need: "pages" },
  { href: "/maki-admin/blog", need: "blog" },
  { href: "/maki-admin/menu", need: "menu" },
  { href: "/maki-admin/homepage-collection", need: "homepage_collection" },
  { href: "/maki-admin/discount-collection", need: "discount_collection" },
  { href: "/maki-admin/messages", need: "messages" },
  { href: "/maki-admin/faqs", need: "faqs" },
  { href: "/maki-admin/reviews", need: "reviews" },
  { href: "/maki-admin/settings", need: "settings" },
  { href: "/maki-admin/webmaster", need: "webmaster" },
  { href: "/maki-admin/system-logs", need: "system_logs" },
  { href: "/maki-admin/activity-logs", need: "activity_logs" },
  { href: "/maki-admin/users", need: "users" },
];

function has(granted: readonly string[], need: PermissionRequirement): boolean {
  const req = Array.isArray(need) ? need : [need];
  return req.some((k) => granted.includes(k));
}

/** Yolu koruyan bölüm (en uzun önek). `/maki-admin/login` ve bilinmeyen
 *  yollar için null. */
export function adminSectionForPath(pathname: string): AdminSection | null {
  const p = (pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/maki-admin/login") return null;
  let best: AdminSection | null = null;
  for (const s of ADMIN_SECTIONS) {
    const match = s.href === "/maki-admin" ? p === "/maki-admin" : p === s.href || p.startsWith(s.href + "/");
    if (match && (!best || s.href.length > best.href.length)) best = s;
  }
  return best;
}

/** İzinlere göre menü sırasındaki ilk erişilebilir bölüm (yoksa null). */
export function firstAllowedAdminHref(granted: readonly string[]): string | null {
  return ADMIN_SECTIONS.find((s) => has(granted, s.need))?.href ?? null;
}

/* ---------------------------------------------------------------
   PAYLAŞILAN API OKUMALARI — birden çok bölümün MEŞRU kullandığı
   endpoint'ler (kullanım kaynak koddan doğrulandı; bkz. route yorumları).
--------------------------------------------------------------- */

/** GET /api/admin/villas (villa seçim listesi): villas (ekle/düzenle),
 *  reservations (ekle, [id]), manual_reservations ([id]),
 *  homepage_collection, discount_collection, reviews (manuel yorum). */
export const VILLA_SELECT_LIST_READERS: PermissionRequirement = [
  "villas",
  "reservations",
  "manual_reservations",
  "homepage_collection",
  "discount_collection",
  "reviews",
];

/** GET /api/admin/villas/[id] ve /prices: villas (takvim, sıralama)
 *  + reservations (ekle, [id] fiyat hesaplama). */
export const VILLA_DETAIL_READERS: PermissionRequirement = ["villas", "reservations"];

/** GET /api/admin/taxonomies: villas (ekle) + offer_requests (filtre). */
export const TAXONOMY_READERS: PermissionRequirement = ["villas", "offer_requests"];

/** GET /api/admin/pages: pages + menu (menüye sayfa bağlama listesi). */
export const PAGE_LIST_READERS: PermissionRequirement = ["pages", "menu"];

/* ---------------------------------------------------------------
   STORAGE (upload/remove) — bucket + yol öneki → izin
   Önekler mevcut upload çağrılarından çıkarıldı:
     villa-images  villas/…         AdminGallery (buildVillaImagePath)
                   descriptions/…   RichTextEditor (villa formu + blog)
     site-assets   category-covers/ types (buildCategoryCoverPath)
                   location-covers/ locations (buildLocationCoverPath)
                   page-covers/     pages (buildPageCoverPath + section)
                   blog/            BlogPostForm kapak
                   branding/        webmaster (admin-branding)
                   logo/ favicon/ watermark/ hero/ seo/ popup/  settings
   Bilinmeyen önek: villa-images → villas, site-assets → settings
   (bucket'ın mevcut sahibi; yeni bir yol açılmaz).
--------------------------------------------------------------- */
const STORAGE_PREFIX_PERMISSIONS: Record<string, Array<[string, PermissionRequirement]>> = {
  "tatilinyeri-villa-images": [
    ["villas/", "villas"],
    ["descriptions/", ["villas", "blog"]],
  ],
  "tatilinyeri-site-assets": [
    ["category-covers/", "villa_types"],
    ["location-covers/", "locations"],
    ["page-covers/", "pages"],
    ["blog/", "blog"],
    ["branding/", "webmaster"],
    ["logo/", "settings"],
    ["favicon/", "settings"],
    ["watermark/", "settings"],
    ["hero/", "settings"],
    ["seo/", "settings"],
    ["popup/", "settings"],
  ],
};
const STORAGE_BUCKET_DEFAULT: Record<string, PermissionRequirement> = {
  "tatilinyeri-villa-images": "villas",
  "tatilinyeri-site-assets": "settings",
};

/** Bu bucket/yol için gereken izin; bucket tanınmıyorsa null. */
export function storagePermissionFor(bucket: string, path: string): PermissionRequirement | null {
  const rules = STORAGE_PREFIX_PERMISSIONS[bucket];
  if (!rules) return null;
  const p = (path || "").replace(/^\/+/, "");
  for (const [prefix, need] of rules) if (p.startsWith(prefix)) return need;
  return STORAGE_BUCKET_DEFAULT[bucket] ?? null;
}
