import type { MetadataRoute } from "next";

/* 🛡️ Public locale prefix'leri — `lib/i18n/config.ts`'in TEK doğruluk
   kaynağından türetilir (yeni bir locale listesi İCAT EDİLMEZ). */
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ ROBOTS — Next.js App Router (production-grade crawl policy)
   ===============================================================
   POLİTİKA: "default allow + explicit disallow". Kök (/) crawl'a açık;
   yalnız internal / token / duplicate-risk path'ler kapatılır. Bu,
   indexlenmesi gereken sayfaları (villa detay, CMS, listeleme) ASLA
   yanlışlıkla kapatmaz.

   ALLOW (kapatılmaz — SEO değeri):
     /                       (anasayfa)
     /kiralik-villalar       (villa listesi)
     /kiralik-villa/[slug]   (villa detay — ASLA blocklanmaz)
     /p/[slug]               (CMS sayfaları)
     /iletisim, /teklif-al   (statik/landing)

   DISALLOW (crawl budget + duplicate + gizlilik):
     /maki-admin   → admin panel (indexlenmemeli)
     /api          → API route'ları (içerik değil)
     /arama        → faceted search; sonsuz query permütasyonu + duplicate
     /favoriler    → kullanıcı state + /favoriler/paylas/[token] (prefix kapsar)
     /liste/       → token-bazlı paylaşım listesi (per-user)
     /v/           → voucher (token, gizli)
     /rezervasyon/ → transactional checkout flow (villa detayın thin duplicate'i)

   PREFIX ÇAKIŞMA KONTROLÜ (doğrulandı):
     Hiçbir disallow prefix'i allow route'larıyla çakışmaz.
     Özellikle: `/kiralik-villa/` ve `/kiralik-villalar` AÇIK kalır;
     disallow listesinde `/kiralik-villa*` YOK. Villa sayfaları güvende.
     /v/ /liste/ /rezervasyon/ trailing-slash ile yazıldı (bu segmentlerin
     index page'i yok; yanlış pozitif blok riski yok).

   SITEMAP: absolute URL şart. NEXT_PUBLIC_SITE_URL (sitemap.ts ile aynı
     kaynak). Boşsa sitemap/host alanları OMIT edilir (geçersiz relative
     referans basılmaz) + uyarı loglanır.

   ⚠️ ÖN KOŞUL: NEXT_PUBLIC_SITE_URL prod'da `https://<domain>` olarak
     SET EDİLMELİ (build anında da; robots.txt static üretilir).

   FUTURE-PROOF: yeni public route eklenince DEFAULT ALLOW olur (kök açık).
     Yalnız yeni bir internal/token/duplicate path çıkarsa buraya disallow
     eklenir. Yeni SEO sayfaları otomatik crawl'a açık kalır.

   🛡️ LOCALE PREFIX'LERİ: Aşağıdaki TR path'lerinin `/en` ve `/de`
     varyantları AYNI politikaya tabidir (ör. `/arama` kapalıyken
     `/en/arama` açık kalmamalı — faceted search asimetrisi). Liste tek
     yerde tutulur; `withLocalePrefixes` her giriş için prefix'li
     kardeşlerini otomatik üretir. TR girdileri ve SIRA korunur; yeni bir
     route politikası EKLENMEZ, yalnız mevcut politika EN/DE'ye eşitlenir.
   =============================================================== */

/** TR (prefix'siz) disallow listesi — POLİTİKA KAYNAĞI. */
const DISALLOW_PATHS: readonly string[] = [
  "/maki-admin",
  "/api",
  "/arama",
  "/favoriler",
  "/liste/",
  "/v/",
  "/rezervasyon/",
];

/** `/maki-admin` ve `/api` locale-routed DEĞİLDİR → prefix üretilmez. */
const LOCALE_PREFIXED_EXCLUDES: readonly string[] = ["/maki-admin", "/api"];

/**
 * Her TR path'i + (uygulanabilirse) `/en` ve `/de` varyantları.
 * Sıra: önce TÜM TR girdileri (mevcut çıktı BİREBİR korunur), sonra
 * prefix'li varyantlar.
 */
function withLocalePrefixes(paths: readonly string[]): string[] {
  const prefixes = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE);
  const localized = paths
    .filter((p) => !LOCALE_PREFIXED_EXCLUDES.includes(p))
    .flatMap((p) => prefixes.map((l) => `/${l}${p}`));
  return [...paths, ...localized];
}

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""
).replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  if (!SITE_URL) {
    console.warn(
      "[robots] NEXT_PUBLIC_SITE_URL tanımsız — sitemap/host referansı OMIT edildi; prod'da SET EDİLMELİ."
    );
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: withLocalePrefixes(DISALLOW_PATHS),
      },
    ],
    /* Absolute URL yoksa OMIT — relative sitemap referansı geçersizdir. */
    sitemap: SITE_URL ? `${SITE_URL}/sitemap.xml` : undefined,
    host: SITE_URL || undefined,
  };
}
