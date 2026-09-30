import { Readable } from "node:stream";
import archiver from "archiver";

import { villaZipRepository } from "@/lib/db/villa-zip.repository.server";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { settingsServerRepository } from "@/lib/db/settings.repository.server";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import { getCdnBaseForBucket } from "@/lib/storage/cdn.config";
import { STORAGE_BUCKETS } from "@/lib/storage/storage.constants";
import { safeGetStream } from "@/lib/security/ssrf.server";

/* ===============================================================
   🛡️ GET /api/villa-zip/[token] — STREAMING ZIP DOWNLOAD
   ===============================================================
   FİZİKSEL ZIP YOK · disk write YOK · tmp YOK · storage upload YOK ·
   tüm görselleri RAM'e ALMAZ. ZIP request anında SEQUENTIAL STREAM
   olarak üretilir; response biter bitmez hiçbir şey kalmaz.

   AKIŞ:
     1. rate-limit ("zip" — 10/dk/IP; egress koruması)
     2. consume_villa_zip_token RPC (service_role): token doğrula
        (revoked/expired hariç) + atomik download_count++ → villa_id.
        Geçersiz → 404 (sayfa AÇILMAZ; direkt status).
     3. villa.slug + firma adı (settings) → filename: firma-villa.zip
     4. villa_images (sort_order) → her görseli fetch().body STREAM
        olarak archiver'a APPEND (store mode = deflate YOK; görseller
        zaten webp/jpg). RAM ~bounded (stream backpressure; her görsel
        sırayla drain edilir, hepsi belleğe alınmaz).
     5. archiver (Node Readable) → Web ReadableStream → Response;
        browser direkt download (Content-Disposition: attachment).

   RUNTIME: nodejs ZORUNLU (archiver + Node stream; edge'de çalışmaz).
   Self-host (Hetzner/Coolify, `next start`) → serverless timeout YOK,
   uzun stream güvenli.

   ⚠️ DEPENDENCY: `npm install archiver @types/archiver` (Faz 0).
   ⚠️ SEO: /api/* robots disallow kapsamında; sitemap dışı; sayfa değil.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ===============================================================
   🛡️ H-03 — ZIP GÖRSEL İNDİRME: HOST ALLOWLIST + SSRF GUARD
   ===============================================================
   `villa_images.image_url` admin girdisidir; tam URL kayıtları
   (legacy) `resolveVillaImageUrl` tarafından AYNEN geçirilir. Eskiden
   bu URL doğrulamasız `fetch()` ile (redirect takipli, timeout'suz)
   çekilip ZIP'e konuyordu → iç ağ/metadata yanıtı okunabiliyordu.

   Artık yalnız uygulamanın gerçekten kullandığı görsel host'larına
   istek atılır — next.config.ts `images.remotePatterns` ile AYNI küme:
     • NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES / _SITE_ASSETS host'ları (R2)
     • LEGACY: https://*.supabase.co (DB'de kalmış eski tam URL'ler)
   Üstüne `safeGetStream`: static + DNS + bağlantı-anı IP doğrulaması,
   redirect'ler elle ve her hop'ta aynı allowlist ile.
   Allowlist dışı / engellenen görsel ZIP'e EKLENMEZ (mevcut "skip"
   davranışı); diğer görseller normal iner. */
const LEGACY_ASSET_HOST_SUFFIX = ".supabase.co";

function zipAllowedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const bucket of [STORAGE_BUCKETS.VILLA_IMAGES, STORAGE_BUCKETS.SITE_ASSETS]) {
    const base = getCdnBaseForBucket(bucket);
    if (!base) continue;
    try {
      hosts.add(new URL(base).host.toLowerCase()); // host:port (varsa)
    } catch {
      /* geçersiz base → allowlist'e girmez */
    }
  }
  return hosts;
}

function isAllowedZipImageUrl(url: URL, cdnHosts: Set<string>): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (cdnHosts.has(url.host.toLowerCase())) return true;
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.hostname.toLowerCase().endsWith(LEGACY_ASSET_HOST_SUFFIX)
  );
}

function slugifyForFile(input: string | null | undefined): string {
  return (input || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diakritik kaldır
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
): Promise<Response> {
  /* 1) RATE LIMIT — egress-pahalı endpoint. */
  const limited = await applyRateLimit(req, "zip");
  if (limited) return limited;

  const { token } = await ctx.params;
  if (!token || typeof token !== "string") {
    return new Response("Not found", { status: 404 });
  }

  /* 2) TOKEN CONSUME — doğrula + atomik download_count++ → villa_id. */
  const { data: villaId, error: consumeErr } =
    await villaZipRepository.consumeToken(token);
  if (consumeErr) {
    console.error("[villa-zip.download] consume FAILED", consumeErr.message);
    return new Response("Hata", { status: 500 });
  }
  if (!villaId) {
    /* Geçersiz / expired / revoked → 404 (sayfa yok, direkt status). */
    return new Response("Not found", { status: 404 });
  }

  /* 🛡️ OPPORTUNISTIC GLOBAL CLEANUP (fire-and-forget) — download akışı
     yüksek trafikli; her geçerli indirme bounded LIMIT 200 batch ile
     EXPIRED/REVOKED satırları DB'den fiziksel siler. AKTİF satır WHERE'e
     girmez. Stream başlamadan ÖNCE tetiklenir ama AWAIT EDİLMEZ — DB
     temizliği response stream'iyle paralel arka planda işler. Hata
     yutulur (.catch): download akışını ASLA bloklamaz. expires_at
     indeksli (046) → sub-ms select; PK ile delete. */
  villaZipRepository.purgeStaleGlobal(200).catch(() => {});

  /* 3) FILENAME parçaları — villa.slug + firma adı. */
  const [{ data: villaRow }, { data: settingsRow }, { data: images }] =
    await Promise.all([
      villaAdminRepository.findSlugTitleById(villaId as string),
      settingsServerRepository.findZipNameFields(),
      villaAdminRepository.findImagesForZip(villaId as string),
    ]);

  const imageRows = (images as Array<{ image_url: string | null }> | null) || [];
  if (imageRows.length === 0) {
    return new Response("Görsel bulunamadı", { status: 404 });
  }

  const villaSlug =
    slugifyForFile(
      (villaRow as { slug?: string; title?: string } | null)?.slug ||
        (villaRow as { title?: string } | null)?.title
    ) || "villa";
  const firmaSlug =
    slugifyForFile(
      (settingsRow as { site_name?: string; company_legal_name?: string } | null)
        ?.site_name ||
        (settingsRow as { company_legal_name?: string } | null)
          ?.company_legal_name
    ) || "villa-kiralama";
  const zipName = `${firmaSlug}-${villaSlug}.zip`;

  /* 4) ARCHIVER — store mode (deflate YOK). */
  const archive = archiver("zip", { store: true });

  archive.on("error", (err: unknown) => {
    /* Stream başladıysa header gönderilmiştir; burada yalnız loglanır,
       response stream archiver tarafından sonlandırılır. */
    console.error(
      "[villa-zip.download] archive error:",
      err instanceof Error ? err.message : err
    );
  });
  archive.on("warning", (warn: unknown) => {
    console.warn(
      "[villa-zip.download] archive warning:",
      warn instanceof Error ? warn.message : warn
    );
  });

  /* SEQUENTIAL APPEND — her görsel fetch().body STREAM olarak eklenir.
     archiver kuyruğu sırayla drain eder (store mode); okunmayan stream'ler
     kaynakta backpressure ile DURUR → tüm görseller aynı anda RAM'e
     ALINMAZ. Buffer array / Promise.all(tüm görseller) YOK. */
  const cdnHosts = zipAllowedHosts();
  void (async () => {
    let index = 0;
    for (const row of imageRows) {
      index += 1;
      /* 🛡️ FAZ B — relative path → absolute URL (CDN veya eski sağlayıcı).
         image_url artık relative tutuluyor; ham fetch şemasız → geçersiz.
         resolveVillaImageUrl driver'a göre CDN/eski sağlayıcı absolute URL üretir;
         FULL URL kayıtları (legacy) pass-through. */
      const rawPath = (row.image_url || "").trim();
      if (!rawPath) continue;
      const urlStr = resolveVillaImageUrl(rawPath);
      if (!urlStr) continue;
      try {
        const got = await safeGetStream(urlStr, {
          allowUrl: (u) => isAllowedZipImageUrl(u, cdnHosts),
          maxRedirects: 3,
          headersTimeoutMs: 15_000,
        });
        if (!got.ok) {
          /* Engellenen hedefin ham adresi loglanmaz (iç ağ bilgisi). */
          console.warn(
            "[villa-zip.download] image skip:",
            got.reason,
            got.status ?? ""
          );
          continue;
        }
        /* Dosya adı: orijinal uzantıyı koru, sıralı + benzersiz isim. */
        const extMatch = urlStr.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
        const entryName = `${String(index).padStart(3, "0")}-${villaSlug}.${ext}`;
        /* Node IncomingMessage (Readable); archiver consume edene
           kadar kaynakta paused (RAM-safe). */
        archive.append(got.res, {
          name: entryName,
        });
      } catch (err) {
        console.warn(
          "[villa-zip.download] image skip (exception):",
          err instanceof Error ? err.message : err
        );
      }
    }
    /* Tüm entry'ler kuyruğa alındı; archiver sırayla yazıp bitirir. */
    await archive.finalize();
  })();

  /* 5) Node Readable → Web stream → Response (browser direkt download). */
  const webStream = Readable.toWeb(archive) as unknown as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
      /* Token URL'i SEO'ya/crawler'a girmesin. */
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
