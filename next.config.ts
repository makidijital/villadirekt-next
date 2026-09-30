import type { NextConfig } from "next";

/* ===============================================================
   🛡️ NEXT.JS CONFIG — next/image remote patterns
   ===============================================================
   Görseller Cloudflare R2'den, CDN host'ları üzerinden servis edilir.
   Host'lar YALNIZ env'den (`NEXT_PUBLIC_CDN_BASE_*`) türetilir. Env
   yoksa/geçersizse o CDN host'u remotePatterns'a EKLENMEZ (eski/sabit
   bir domain'e sessizce dönülmez) ve build/start sırasında uyarı
   yazılır. `lib/storage/cdn.config.ts` ve CSP de aynı kuralı izler.
   =============================================================== */
function hostFromBase(base: string | undefined, envName: string): string | null {
  try {
    if (base) return new URL(base).hostname || null;
  } catch {
    /* geçersiz URL → aşağıda uyarı */
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(
      `[next.config] ${envName} tanımsız/geçersiz — bu CDN host'u next/image remotePatterns'a eklenmedi.`
    );
  }
  return null;
}
const villaImagesCdnHost = hostFromBase(
  process.env.NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES,
  "NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES"
);
const siteAssetsCdnHost = hostFromBase(
  process.env.NEXT_PUBLIC_CDN_BASE_SITE_ASSETS,
  "NEXT_PUBLIC_CDN_BASE_SITE_ASSETS"
);

const cdnHosts = Array.from(
  new Set([villaImagesCdnHost, siteAssetsCdnHost])
).filter((h): h is string => !!h);

/* ⚠️ LEGACY ASSET HOST — GEÇİCİ, VERİ TEMİZLİĞİ BEKLİYOR
   Veritabanındaki bazı asset alanları (villa_images.image_url,
   settings.site_logo/favicon/default_og_image/watermark_logo,
   pages.cover_image, villa_types/villa_locations.cover_image) hâlâ
   ESKİ SAĞLAYICININ tam URL'ini tutuyor olabilir; `resolveAssetUrl`
   ve `parseVillaStorageUrl` bu değerleri bilinçli olarak pass-through
   eder (bkz. lib/storage.helpers.ts, lib/villa-image.helpers.ts).
   Bu pattern kaldırılırsa `next/image` o satırlar için HARD ERROR verir.

   KALDIRMA KOŞULU: DB'deki tüm asset alanları R2 bucket-relative
   path'e normalize edildikten SONRA bu blok silinebilir.
   Bu blok hiçbir environment variable OKUMAZ; yalnız statik bir
   wildcard host'tur. */
const LEGACY_ASSET_HOST = "**.supabase.co";


/* ===============================================================
   🛡️ SEC-05 — CONTENT SECURITY POLICY (REPORT-ONLY)
   ===============================================================
   YALNIZ `Content-Security-Policy-Report-Only` gönderilir → tarayıcı
   HİÇBİR kaynağı ENGELLEMEZ; yalnız ihlali console'a yazar ve
   `/api/csp-report`'a raporlar. Enforce eden `Content-Security-Policy`
   header'ı BİLEREK YOK (önce production rapor verisi toplanacak).

   - Nonce YOK: nonce tüm sayfaları dinamik render'a zorlar (Next CSP
     dokümanı) → ISR/static bozulurdu. Statik header ISR ile uyumlu.
   - CDN host'ları HARDCODE DEĞİL: yukarıdaki remotePatterns ile AYNI
     env'lerden (`NEXT_PUBLIC_CDN_BASE_*`) türetilir; env yoksa CDN
     kaynağı policy'ye eklenmez (fallback domain YOK).
   - 'unsafe-inline' (script): Next App Router her sayfaya inline flight
     script'leri (`self.__next_f.push`) basar; GTM bootstrap'i
     (`next/script` inline), arama sıralama script'i ve admin'in
     `custom_head_scripts`/`analytics_script` alanları da inline'dır.
     Nonce'suz (ISR korunarak) başka yol yok.
   - 'unsafe-inline' (style): React `style={}` attribute'ları (ana
     sayfada ~1400) nonce/hash ile yetkilendirilemez.
   - 'unsafe-eval' YOK: production'da gerektiğine dair kanıt yok
     (runtime testte eval ihlali görülmedi); gerekirse raporlarda çıkar.
   - `frame-ancestors`, `upgrade-insecure-requests`: Report-Only'de
     tarayıcı tarafından YOK SAYILIR (console uyarısı üretir) → eklenmedi.
   =============================================================== */
type CspKind = "public" | "admin";
type CspEnv = Record<string, string | undefined>;

function originFromBase(base: string | undefined): string | null {
  if (!base) return null;
  try {
    const u = new URL(base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/* Google Tag Manager + GA4 (GTM üzerinden) — Google Tag Platform CSP
   rehberindeki temel alan adları. Yalnız PUBLIC policy'de (SEC-05
   Phase 2 sonrası GTM admin panelinde yüklenmez). */
const GTM_GA4_SCRIPT = ["https://*.googletagmanager.com"];
const GTM_GA4_IMG = [
  "https://*.googletagmanager.com",
  "https://*.google-analytics.com",
];
const GTM_GA4_CONNECT = [
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
];
/* Harita (lib/map-embed.helper.ts ALLOWED_MAP_HOSTS + koordinat/iletişim
   iframe'leri) ve YouTube (lib/youtube.helper.ts → youtube-nocookie). */
const FRAME_HOSTS = [
  "https://www.google.com",
  "https://google.com",
  "https://maps.google.com",
  "https://www.youtube-nocookie.com",
];

export function buildCspReportOnly(
  kind: CspKind,
  env: CspEnv = process.env
): string {
  const cdnOrigins = Array.from(
    new Set(
      [
        originFromBase(env.NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES),
        originFromBase(env.NEXT_PUBLIC_CDN_BASE_SITE_ASSETS),
      ].filter((o): o is string => !!o)
    )
  );
  const isPublic = kind === "public";
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      ["'self'", "'unsafe-inline'", ...(isPublic ? GTM_GA4_SCRIPT : [])],
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    [
      "img-src",
      [
        "'self'",
        "data:",
        "blob:",
        ...cdnOrigins,
        /* LEGACY_ASSET_HOST ile aynı (yukarıdaki remotePatterns) — DB'de
           hâlâ eski sağlayıcı URL'i tutan görseller için. */
        "https://*.supabase.co",
        /* YouTube video kapak görselleri (lib/youtube.helper.ts). */
        "https://i.ytimg.com",
        ...(isPublic
          ? GTM_GA4_IMG
          : /* Admin harita seçici (MapPicker): leaflet marker + OSM tile. */
            ["https://unpkg.com", "https://*.tile.openstreetmap.org"]),
      ],
    ],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...(isPublic ? GTM_GA4_CONNECT : [])]],
    ["frame-src", [...(isPublic ? [] : ["'self'"]), ...FRAME_HOSTS]],
    ["media-src", ["'self'", "blob:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["report-uri", ["/api/csp-report"]],
  ];
  return directives.map(([d, v]) => `${d} ${v.join(" ")}`).join("; ");
}

const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: LEGACY_ASSET_HOST,
        pathname: "/storage/v1/object/public/**",
      },
      /* CDN host'ları — bucket kökü doğrudan serve edilir (path: /**). */
      ...cdnHosts.map((hostname) => ({
        protocol: "https" as const,
        hostname,
        pathname: "/**",
      })),
    ],
  },
  /* 🛡️ SEC-05 — CSP Report-Only (yukarıdaki açıklamaya bkz.). Public ve
     admin için ayrı policy; `/api`, `/_next/static`, `/_next/image` ve
     favicon hariç (Next CSP dokümanı önerisi). */
  async headers() {
    return [
      {
        source: "/((?!api|_next/static|_next/image|favicon.ico|maki-admin).*)",
        headers: [
          { key: CSP_REPORT_ONLY_HEADER, value: buildCspReportOnly("public") },
        ],
      },
      {
        source: "/maki-admin/:path*",
        headers: [
          { key: CSP_REPORT_ONLY_HEADER, value: buildCspReportOnly("admin") },
        ],
      },
    ];
  },
};

export default nextConfig;
