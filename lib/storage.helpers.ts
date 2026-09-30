import { storageProvider, STORAGE_BUCKETS } from "@/lib/storage";
import { withVersionParam } from "@/lib/storage/site-asset-version";

/* ===============================================================
   🛡️ STORAGE HELPERS — R2 storage public URL üretici
   ===============================================================
   DB'de FULL public URL tutmuyoruz; sadece bucket-relative path
   (örn. "category-covers/balayi-villalari.webp"). Runtime'da
   bu helper public URL'i üretir. Bucket adı veya project URL
   değişirse DB değerleri kırılmaz; sadece bu fonksiyon güncellenir.

   BUCKET KONTRATI:
     site-assets/
       ├─ logo/             → settings.site_logo            (1 file: logo.webp)
       ├─ watermark/        → settings.watermark_logo       (1 file: watermark.webp)
       ├─ favicon/          → settings.favicon_url          (1 file: favicon.webp)
       ├─ hero/             → settings.hero_background_image (1 file: homepage-hero.webp)
       ├─ seo/              → settings.default_og_image     (1 file: default-og.webp)
       ├─ category-covers/  → villa_types.cover_image       (migration 010)
       ├─ location-covers/  → villa_locations.cover_image   (migration 011)
       └─ page-covers/      → pages.cover_image             (migration 014)

     Singleton-asset klasörleri (logo/watermark/favicon/hero/seo)
     deterministik dosya adıyla 1 satır içerir. Upsert ile aynı
     dosyaya yazılır; legacy root-level kayıtlar
     (logo-xxxxx.webp, watermark-xxxxx.webp) eski DB değerlerinde
     full URL formatında saklı; render aynen çalışır (URL DB'de).

   USAGE:
     const url = getCategoryCoverPublicUrl(t.cover_image);
     const url = getLocationCoverPublicUrl(l.cover_image);
     if (url) <img src={url} />
   =============================================================== */

/* FAZ 38: Bucket sabit `STORAGE_BUCKETS.SITE_ASSETS` üzerinden;
   local alias backward-compat için korunur. */
const SITE_ASSETS_BUCKET = STORAGE_BUCKETS.SITE_ASSETS;

/**
 * Verilen bucket-relative path için public URL üretir.
 * NULL/empty input → null (caller fallback'e düşsün).
 * Path bozuksa eski sağlayıcı yine bir URL döner ama 404 verir — bu
 * davranış admin upload sonrası tipik race condition'da kabul
 * edilebilir (sonraki render fresh URL alır).
 */
export function getCategoryCoverPublicUrl(
  path: string | null | undefined
): string | null {
  /* FAZ 38: storageProvider.getPublicUrl delege; empty/invalid → null
     davranışı provider içinde aynen. */
  if (!path || typeof path !== "string" || path.trim().length === 0) {
    return null;
  }
  return storageProvider.getPublicUrl(SITE_ASSETS_BUCKET, path);
}

/**
 * Slug + dosya uzantısından kategori cover path'i üretir.
 * Üretim deterministik: aynı slug + extension → aynı path →
 * upsert ile eski overwrite (duplicate dosya birikmez).
 * Slug boşsa null döner (caller upload'u atlamalı).
 */
export function buildCategoryCoverPath(
  slug: string | null | undefined,
  extension: string
): string | null {
  const s = (slug || "").trim();
  if (!s) return null;
  const ext = (extension || "webp").replace(/^\./, "").toLowerCase().trim();
  return `category-covers/${s}.${ext}`;
}

/* ===============================================================
   🛡️ LOCATION COVERS — kategori cover paterninin birebir paraleli.
   ===============================================================
   `getLocationCoverPublicUrl` internal'i `getCategoryCoverPublicUrl`
   ile aynı (`storageProvider(bucket).getPublicUrl(path)`);
   `buildLocationCoverPath` aynı slug-deterministik path builder
   ama "location-covers/" prefix'iyle. Üretim semantic'i, overwrite
   davranışı, immune-to-bucket-rename özelliği — hepsi kategori
   sistemiyle birebir.
=============================================================== */

/**
 * Verilen bucket-relative path için public URL üretir.
 * Davranış `getCategoryCoverPublicUrl` ile birebir aynı; sadece
 * çağrı semantic'i ayrı tutuldu (caller-side okunabilirlik).
 */
export function getLocationCoverPublicUrl(
  path: string | null | undefined
): string | null {
  if (!path || typeof path !== "string" || path.trim().length === 0) {
    return null;
  }
  return storageProvider.getPublicUrl(SITE_ASSETS_BUCKET, path);
}

/**
 * Slug + dosya uzantısından bölge cover path'i üretir.
 * Deterministik: aynı slug + extension → aynı path → upsert ile
 * eski overwrite (duplicate dosya birikmez). category paterniyle
 * sadece klasör adı farklı (`location-covers/`).
 */
export function buildLocationCoverPath(
  slug: string | null | undefined,
  extension: string
): string | null {
  const s = (slug || "").trim();
  if (!s) return null;
  const ext = (extension || "webp").replace(/^\./, "").toLowerCase().trim();
  return `location-covers/${s}.${ext}`;
}

/* ===============================================================
   🛡️ PAGE COVERS — CMS sayfa hero/section görselleri (migration 014)
   ===============================================================
   Kategori/bölge cover paterniyle birebir aynı semantic; sadece
   klasör adı farklı (`page-covers/`). Pages.cover_image + her
   `{ type: "image", path }` section bu URL builder'ı kullanır.
=============================================================== */

export function getPageCoverPublicUrl(
  path: string | null | undefined
): string | null {
  if (!path || typeof path !== "string" || path.trim().length === 0) {
    return null;
  }
  return storageProvider.getPublicUrl(SITE_ASSETS_BUCKET, path);
}

export function buildPageCoverPath(
  slug: string | null | undefined,
  extension: string
): string | null {
  const s = (slug || "").trim();
  if (!s) return null;
  const ext = (extension || "webp").replace(/^\./, "").toLowerCase().trim();
  return `page-covers/${s}.${ext}`;
}

/* ===============================================================
   🛡️ SINGLETON ASSET PATHS — logo, watermark, favicon, hero, og
   ===============================================================
   Her biri tek dosya. Deterministik path → upsert ile aynı satıra
   yazılır. Yeni upload sonrası DB'ye **full public URL** yazılır
   (legacy contract; Footer/header/hero/og caller'ları direkt URL
   bekliyor). Eski root-level dosyalar (logo-xxxxx.webp) DB'de
   full URL halinde duruyor → render değişmez.
=============================================================== */

export function buildLogoPath(): string {
  return "logo/logo.webp";
}

export function buildWatermarkPath(): string {
  return "watermark/watermark.webp";
}

export function buildFaviconPath(): string {
  return "favicon/favicon.webp";
}

export function buildHeroBgPath(): string {
  return "hero/homepage-hero.webp";
}

export function buildDefaultOgPath(): string {
  return "seo/default-og.webp";
}

/* ===============================================================
   🛡️ RESOLVE ASSET URL — backward-compat normalizer
   ===============================================================
   DB'de değer iki şekilde olabilir:
     1) FULL URL: "https://<proj>.eski storage host/storage/v1/object/public/..."
        → direkt döndür (legacy ve current default contract)
     2) Bucket-relative path: "logo/logo.webp" / "page-covers/..."
        → getPublicUrl ile full URL üret
     3) NULL / boş → null
   `<img src>` / `<link href>` caller'ları her iki durumda da
   doğru URL alır. Legacy root dosyaları (logo-xxxxx.webp) DB'de
   tam URL formatında olduğu için 1. tier'dan geçer.
=============================================================== */
export function resolveAssetUrl(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  /* Bucket-relative path varsayımı — site-assets bucket altında.
     FAZ 38: storageProvider delege. */
  return storageProvider.getPublicUrl(SITE_ASSETS_BUCKET, trimmed);
}

/* ===============================================================
   🛡️ RESOLVE ASSET URL + CACHE-BUST — singleton asset versiyonlama
   ===============================================================
   `resolveAssetUrl`'in additive sarmalayıcısı. Singleton asset'ler
   (logo / footer-logo / favicon / og / watermark) sabit path'e
   overwrite edildiği için public URL değişmiyor → browser/CDN eski
   byte'ı cache'liyor. Hero'daki `withCacheBust` mantığının aynısı:
   URL'e `?v=<cacheKey>` ekler. cacheKey = `settings.updated_at`
   (server'dan gelir → SSR/client aynı string → hydration-safe).

   DAVRANIŞ:
     - value yok/boş               → null (resolveAssetUrl ile birebir)
     - cacheKey yok/boş            → resolveAssetUrl(value) (bust YOK; aynen)
     - cacheKey var + URL üretildi → `<url>?v=<encoded>` (query varsa &)
   ⚠️ `resolveAssetUrl` imzası DEĞİŞMEZ; mevcut çağıranlar etkilenmez.
   =============================================================== */
export function resolveAssetUrlVersioned(
  value: string | null | undefined,
  cacheKey?: string | number | null
): string | null {
  const url = resolveAssetUrl(value);
  if (!url) return null;
  if (cacheKey === undefined || cacheKey === null || cacheKey === "") {
    return url;
  }
  return withVersionParam(url, cacheKey);
}


/* ===============================================================
   🛡️ appendAssetVersion — hazır URL'e cache-bust `?v=` ekler.
   ===============================================================
   `resolveAssetUrlVersioned` relative path'ten URL üretir; bu sibling
   ZATEN üretilmiş bir public URL alır (örn. getCategoryCoverPublicUrl /
   getLocationCoverPublicUrl çıktısı) ve `?v=<cacheKey>` ekler.

   GEREKÇE: kategori/bölge cover'ları deterministik path'e (slug.webp)
   overwrite edilir → URL değişmez → CDN/browser eski görseli
   max-age=3600 boyunca servis eder. cacheKey değişince URL değişir →
   anında fresh fetch. cacheKey = taxonomy cache build timestamp
   (revalidateTaxonomy upload sonrası invalidate → rebuild → yeni token).

   DAVRANIŞ:
     - url yok/boş     → null
     - cacheKey yok/boş → url (bust YOK)
     - cacheKey var     → `<url>?v=<encoded>` (query varsa &)
   =============================================================== */
export function appendAssetVersion(
  url: string | null | undefined,
  cacheKey?: string | number | null
): string | null {
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return null;
  }
  if (cacheKey === undefined || cacheKey === null || cacheKey === "") {
    return url;
  }
  return withVersionParam(url, cacheKey);
}

/* ===============================================================
   🛡️ RESOLVE VILLA IMAGE URL — villa-images bucket için
   ===============================================================
   `villa_images.image_url` alanı VILLA_IMAGES bucket'ında dosyaları
   referanslar. `resolveAssetUrl` SITE_ASSETS bucket'ına sabitlenmiş
   olduğu için villa galerisi relative path'lerinde yanlış URL
   üretiyordu (yanlış bucket → 404).

   Davranış `resolveAssetUrl` ile birebir paralel; tek fark hedef
   bucket:
     1) FULL URL (legacy DB satırları) → trim sonrası AYNEN pass-through
     2) Relative path (yeni — Aşama B sonrası) → getPublicUrl(
        VILLA_IMAGES, path) ile doğru bucket URL'i üretilir
     3) NULL / boş / non-string → null

   Path-only contract: storage provider değişimi gelecekte olursa
   tek nokta (STORAGE_BUCKETS.VILLA_IMAGES) güncellenir; DB'deki
   relative path'ler dokunulmaz.

   Caller'lar: villa.service.ts (mapVilla), cache.helpers.ts
   (homepage collection + category covers Tier 2 fallback),
   AdminGallery.tsx (admin thumbnail), villa-listesi/page.tsx
   (admin curator list).
=============================================================== */
export function resolveVillaImageUrl(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return storageProvider.getPublicUrl(
    STORAGE_BUCKETS.VILLA_IMAGES,
    trimmed
  );
}

/** Storage bucket adı — admin upload kodu için. */
export const SITE_ASSETS_BUCKET_NAME = SITE_ASSETS_BUCKET;
