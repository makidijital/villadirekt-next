import type { MetadataRoute } from "next";

/* 🛡️ EXIT HARDENING — sitemap'in inline `db.from()` çağrıları
   repository'ye taşındı (Katman A). Davranış AYNEN: villa
   (is_active=true & deleted_at IS NULL, slug+created_at) ve pages
   (is_active=true) aynı filtre + fail-soft. session-aware DB client
   artık gerekmez (RLS anon context repository `db` üzerinden aynen). */
/* 🛡️ Villa Migration S8H — listPublicSlugs native twin'e (S8G, byte-
   identical chunked-loop, unwrapped {slug,created_at}[]) repoint. sitemap
   server → server-only native repo import'u güvenli. villaRepository yalnız
   listPublicSlugs için; call-site aynı (villaAdminRepository → villaRepository alias). */
import { villaAdminRepository as villaRepository } from "@/lib/db/villa.repository.server";
import { pagesRepository } from "@/lib/db/pages.repository";
/* 🛡️ Blog (FAZ 3) — yayında olan blog yazıları sitemap'e dahil. */
import { blogRepository } from "@/lib/db/blog.repository";
/* 🛡️ PHASE 7D — yalnız villa entry'lerine locale hreflang alternates
   eklemek için. Mevcut cache/settings altyapısı REUSE edilir (yeni
   bir cache sistemi YOK); Phase 7B'nin `buildLocaleAlternates`'i TEK
   URL kaynağı (elle string birleştirme YOK). */
import { getCachedSettings } from "@/lib/cache.helpers";
/* 🛡️ SEO landing — kategori + bölge GRUBU kökü giriş sayfaları. */
import { getTaxonomyLandingSitemapPaths } from "@/lib/taxonomy-landing.server";
import { isMultilingualEnabled } from "@/lib/i18n/config";
import {
  resolvePublicHome,
  type PublicHomeResolution,
} from "@/lib/i18n/public-home";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";

/* ===============================================================
   🛡️ SITEMAP — Next.js App Router (production-grade, dynamic)
   ===============================================================
   GERÇEK PUBLIC URL MİMARİSİ (analiz sonucu):
     INDEXLENEN:
       /                       (anasayfa)
       /kiralik-villalar       (villa listesi)
       /iletisim               (statik)
       /teklif-al              (lead-gen landing)
       /kiralik-villa/[slug]   (DYNAMIC — aktif villalar)
       /p/[slug]               (DYNAMIC — aktif CMS sayfaları)
     HARİÇ (sitemap'e ASLA girmez):
       /arama                  (query-based, force-dynamic, duplicate)
       /favoriler              (kullanıcı state)
       /favoriler/paylas/[token], /liste/[token], /v/[token]  (token, per-user)
       /rezervasyon/[slug]     (transactional, villa detay duplicate'i)
       /maki-admin/*, /api/*   ((public) dışı — zaten kapsam dışı)

   VERİ KAYNAKLARI (public-read, anon server-side OK — sitemap public
   görünürlüğü yansıtmalı; RLS ile gizli satır sitemap'e GİRMEZ):
     - villa  : slug + created_at, is_active=true & deleted_at IS NULL
     - pages  : slug + created_at, is_active=true
   Minimal projeksiyon (slug, created_at) → 1000+ villa'da hafif sorgu.

   ⚠️ NOT — `updated_at` schema'da YOK (sadece `created_at` mevcut).
   Eski sitemap implementasyonu `updated_at` istiyordu, runtime error
   veriyordu ("column ... does not exist"). `created_at` ile
   değiştirildi — lastModified semantiği "kayıt yaratıldığı an" oldu
   (Google bunu yine kabul eder; gerçek update timestamp ileride
   trigger ile eklenebilir).

   ⚠️ ÖN KOŞUL — ABSOLUTE URL:
     Sitemap spec absolute URL ister. SITE_URL boşsa URL'ler relative
     kalır → geçersiz sitemap. NEXT_PUBLIC_SITE_URL prod'da SET
     EDİLMELİ. StructuredData ile aynı kaynak.

   SCALING:
     - Tek sitemap.ts → 50.000 URL / 50MB limitine kadar (1000+ villa
       rahatça kapsanır). 50k+ için Next `generateSitemaps()` ile
       sitemap-index'e geçilir (gelecek; yorum altta).

   CACHE: ISR — `revalidate = 3600` (saatlik). Villa/sayfa CRUD sonrası
     en geç 1 saatte yansır; istenirse `revalidatePath("/sitemap.xml")`
     ile anında invalidate edilebilir (gelecek hook).
   =============================================================== */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""
).replace(/\/+$/, "");

/* ISR: saatlik yeniden üretim. Sitemap her istekte DB'ye gitmez;
   pencere içinde cache'ten servis edilir → cache-friendly + ölçeklenir. */
export const revalidate = 3600;

function url(path: string): string {
  if (!SITE_URL) {
    /* Prod'da olmamalı; build/preview'de relative kalmasın diye uyarı. */
    console.warn(
      "[sitemap] NEXT_PUBLIC_SITE_URL tanımsız — sitemap URL'leri relative; prod'da SET EDİLMELİ."
    );
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}

function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/* 🛡️ PHASE 7D — YALNIZ villa detay entry'leri için hreflang alternates.
   EN/DE için AYRI bir sitemap URL entry'si BİLİNÇLİ OLARAK EKLENMİYOR
   (bkz. dosya başındaki Phase 7D notu / Phase 7A audit §12): EN/DE
   villa detay sayfaları bugün — `multilingual_enabled` ne olursa
   olsun — hâlâ `robots:{index:false,follow:false}` VE ComingSoon
   placeholder (Phase 6B/7C, robots'un flag'e bağlanması AYRI bir faz,
   Phase 7E). Bir sitemap'e noindex sayfa URL'i EKLEMEK Google'ın
   kendi rehberliğine göre yanlış sinyal (Search Console'da "Excluded
   by noindex tag" + hreflang/sitemap mismatch riski). Bunun yerine
   yalnızca TR entry'sinin `alternates.languages`'ı dolduruluyor —
   TR'nin KENDİ `url` alanı DEĞİŞMİYOR, yalnız ek bir hreflang-ilişki
   alanı EKLENİYOR. Path'ler Phase 7B'nin `buildLocaleAlternates`'inden
   (tek kaynak); absolute'a bu dosyanın MEVCUT `url()` helper'ıyla
   çözülüyor (yeni bir absolute-URL mekanizması İCAT EDİLMEDİ). */
function languageAlternates(trPath: string): Record<string, string> {
  const { languages } = buildLocaleAlternates(trPath, "tr");
  return {
    tr: url(languages.tr),
    en: url(languages.en),
    de: url(languages.de),
    "x-default": url(languages["x-default"]),
  };
}

/* 🔄 ANA SAYFAYA ÖZEL hreflang SETİ
   ------------------------------------------------------------
   Varsayılan dil EN/DE olduğunda (`redirectsFromRoot`) `/` bir
   YÖNLENDİRİCİDİR; TR ana sayfa `/tr`'de yaşar. Sitemap'e veya
   hreflang'e redirect eden bir URL koymak Search Console'da
   "Page with redirect" + hreflang mismatch üretir. Bu yüzden bu
   modda TR hedefi `/tr`, `x-default` ise varsayılan dilin ana
   sayfası olur. Varsayılan "tr" iken (bugünkü production) çıktı
   `languageAlternates("/")` ile BYTE-IDENTICAL kalır. */
function homeLanguageAlternates(
  home: PublicHomeResolution
): Record<string, string> {
  const base = languageAlternates("/");
  if (!home.redirectsFromRoot) return base;
  return {
    ...base,
    tr: url(home.trHomeHref),
    "x-default": url(`/${home.defaultLocale}`),
  };
}

/** Villa detay — mevcut çağıranın imzası DEĞİŞMEDİ. */
function villaLanguageAlternates(slug: string): Record<string, string> {
  return languageAlternates(`/kiralik-villa/${slug}`);
}

type SlugRow = { slug: string | null; created_at: string | null };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /* 🛡️ EXIT HARDENING — villa + pages query'leri repository'den.
     SSR client init kaldırıldı (artık kullanılmıyor). */

  /* 🛡️ PHASE 7D — yalnız villa entry'lerinin `alternates.languages`
     alanı için. `multilingual_enabled=false` iken (bugün production)
     bu flag hiç okunmasa da davranış AYNI olurdu (villaEntries.map
     aşağıda koşullu) — okunuyor çünkü flag açıldığında YENİ BİR
     DEPLOY GEREKMEDEN sitemap otomatik doğru davranışa geçsin diye.
     `getCachedSettings()` sayfa/route'larda zaten kullanılan AYNI
     cache'lenmiş fonksiyon (Phase 4A/6B/7C ile aynı desen) — yeni bir
     cache mekanizması KURULMADI. Sitemap'in kendi `revalidate = 3600`
     penceresi DEĞİŞMEDİ. */
  const seoSettings = await getCachedSettings().catch(() => null);
  const multilingualEnabled = isMultilingualEnabled(seoSettings);
  /* Ana sayfanın kanonik TR URL'i ("/" veya "/tr") — ek okuma YOK,
     yukarıdaki `seoSettings`'ten saf şekilde türetilir. */
  const home = resolvePublicHome(seoSettings);

  /* ---------- STATIK INDEXLENEN ROUTE'LAR ---------- */
  const now = new Date();
  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — `/`, `/kiralik-villalar`,
     `/iletisim` ve `/teklif-al` artık GERÇEK `/en` + `/de` route
     dosyalarına sahip (ortak gövde + locale prop) ve kendi
     `generateMetadata`'larında hreflang üretiyorlar. Sitemap de AYNI
     `buildLocaleAlternates` kaynağından `alternates.languages` alanını
     alır — TR entry'lerinin `url` alanı DEĞİŞMEZ, yalnız ek bir
     hreflang-ilişki alanı EKLENİR (villa detayda uygulanan AYNI desen).
     `multilingual_enabled=false` iken alan HİÇ eklenmez. */
  const staticEntries: MetadataRoute.Sitemap = [
    {
      /* MOD A → "/" (bugünkü davranış). MOD B → "/tr": `/` artık
         yönlendirici olduğu için sitemap'e indexlenebilir olan
         TR ana sayfa URL'i yazılır. */
      url: url(home.trHomeHref),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
      ...(multilingualEnabled
        ? { alternates: { languages: homeLanguageAlternates(home) } }
        : {}),
    },
    {
      url: url("/kiralik-villalar"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
      ...(multilingualEnabled
        ? {
            alternates: {
              languages: languageAlternates("/kiralik-villalar"),
            },
          }
        : {}),
    },
    {
      url: url("/iletisim"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
      ...(multilingualEnabled
        ? { alternates: { languages: languageAlternates("/iletisim") } }
        : {}),
    },
    {
      url: url("/teklif-al"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
      ...(multilingualEnabled
        ? { alternates: { languages: languageAlternates("/teklif-al") } }
        : {}),
    },
  ];

  /* ---------- DİNAMİK: AKTİF VİLLALAR ---------- */
  let villaEntries: MetadataRoute.Sitemap = [];
  try {
    /* 🛡️ EXIT HARDENING — repository slim read. Fail-soft repo
       içinde ([] on error); davranış AYNEN. */
    const data = await villaRepository.listPublicSlugs();
    villaEntries = ((data as SlugRow[] | null) || [])
      .filter((v) => !!v.slug)
      .map((v) => ({
        url: url(`/kiralik-villa/${v.slug}`),
        lastModified: toDate(v.created_at),
        changeFrequency: "weekly",
        priority: 0.8,
        /* 🛡️ PHASE 7D — yalnız flag açıkken; EN/DE'ye AYRI URL entry'si
           YOK (yukarıdaki `villaLanguageAlternates` yorumuna bkz.). */
        ...(multilingualEnabled
          ? { alternates: { languages: villaLanguageAlternates(v.slug as string) } }
          : {}),
      }));
  } catch (err) {
    /* Fail-soft: villa fetch patlarsa statik + sayfa entry'leri yine döner. */
    console.error(
      "[sitemap] villa fetch EXCEPTION:",
      err instanceof Error ? err.message : err
    );
  }

  /* ---------- DİNAMİK: SEO LANDING (/villa-turleri, /bolgeler) ----------
     Yalnız slug'lı + en az 1 aktif villalı kategori ve bölge GRUP
     KÖKLERİ (alt bölgeler ASLA). Kaynak: mevcut taxonomy/villa sayaç
     cache'leri (tag "taxonomy"/"villas" → admin CRUD sonrası tazelenir);
     sitemap'in kendi `revalidate` penceresi DEĞİŞMEDİ. Fail-soft: hata
     olursa diğer entry'ler yine döner. */
  let landingEntries: MetadataRoute.Sitemap = [];
  try {
    const { categories, regions } = await getTaxonomyLandingSitemapPaths();
    landingEntries = [...categories, ...regions].map((path) => ({
      url: url(path),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
      ...(multilingualEnabled
        ? { alternates: { languages: languageAlternates(path) } }
        : {}),
    }));
  } catch (err) {
    console.error(
      "[sitemap] taxonomy landing EXCEPTION:",
      err instanceof Error ? err.message : err
    );
  }

  /* ---------- DİNAMİK: AKTİF CMS SAYFALARI (/p/[slug]) ---------- */
  let pageEntries: MetadataRoute.Sitemap = [];
  try {
    /* 🛡️ EXIT HARDENING — mevcut `pagesRepository.findActivePages()`
       (is_active=true). Superset SELECT (slug+created_at dahil);
       sitemap yalnız slug+created_at okur → davranış AYNEN. */
    const { data, error } = await pagesRepository.findActivePages();

    if (error) {
      console.error("[sitemap] pages fetch error:", error.message);
    } else {
      pageEntries = ((data as SlugRow[] | null) || [])
        .filter((p) => !!p.slug)
        .map((p) => ({
          url: url(`/p/${p.slug}`),
          lastModified: toDate(p.created_at),
          changeFrequency: "monthly",
          priority: 0.6,
          /* 🛡️ CMS sayfaları `/en|de/p/[slug]` ile gerçek içerik
             render ediyor (`page_translations`). */
          ...(multilingualEnabled
            ? {
                alternates: {
                  languages: languageAlternates(`/p/${p.slug}`),
                },
              }
            : {}),
        }));
    }
  } catch (err) {
    console.error(
      "[sitemap] pages fetch EXCEPTION:",
      err instanceof Error ? err.message : err
    );
  }

  /* ---------- DİNAMİK: YAYINDA BLOG YAZILARI (/blog/[slug]) ---------- */
  let blogEntries: MetadataRoute.Sitemap = [];
  try {
    const { data, error } = await blogRepository.findActiveSlugs();
    if (error) {
      console.error("[sitemap] blog fetch error:", error.message);
    } else {
      blogEntries = (
        (data as
          | { slug: string | null; published_at: string | null; updated_at: string | null }[]
          | null) || []
      )
        .filter((b) => !!b.slug)
        .map((b) => ({
          url: url(`/blog/${b.slug}`),
          lastModified: toDate(b.updated_at || b.published_at),
          changeFrequency: "weekly",
          priority: 0.7,
          /* 🛡️ hreflang — `/en|de/blog/[slug]` GERÇEK route'ları var.
             `multilingual_enabled` kapalıyken çıktı eskisiyle AYNI. */
          ...(multilingualEnabled
            ? {
                alternates: {
                  languages: languageAlternates(`/blog/${b.slug}`),
                },
              }
            : {}),
        }));
    }
  } catch (err) {
    console.error(
      "[sitemap] blog fetch EXCEPTION:",
      err instanceof Error ? err.message : err
    );
  }

  /* Blog index sayfası (statik route). */
  const blogIndexEntry: MetadataRoute.Sitemap = [
    {
      url: url("/blog"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
      ...(multilingualEnabled
        ? { alternates: { languages: languageAlternates("/blog") } }
        : {}),
    },
  ];

  return [
    ...staticEntries,
    ...landingEntries,
    ...villaEntries,
    ...pageEntries,
    ...blogIndexEntry,
    ...blogEntries,
  ];
}

/* ===============================================================
   🔭 GELECEK — 50.000+ URL (sitemap index)
   ===============================================================
   Villa sayısı 50k'yı aşarsa Next.js `generateSitemaps()` ile
   chunk'lara böl (her chunk ≤ 50k URL); Next otomatik sitemap-index
   üretir:
     export async function generateSitemaps() {
       // toplam villa / 45000 → [{id:0},{id:1},...]
     }
     export default async function sitemap({ id }: { id: number }) {
       // id*45000 .. (id+1)*45000 arası villa slice
     }
   Şu anki tek-dosya yaklaşımı 1000+ villa için fazlasıyla yeterli.
   =============================================================== */
