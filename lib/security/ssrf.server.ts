/* ===============================================================
   🛡️ SSRF HARDENING — SERVER-SIDE DNS-AWARE VALIDATOR
   ===============================================================
   ssrf.ts'in sync validator'ı string-level kontroller yapar; bu
   dosya ek olarak DNS resolve sonrası IP'leri private range guard'a
   sokar. Defense against DNS rebinding ve "public hostname →
   private IP" trick'leri.

   Bu dosya YALNIZ server tarafında import edilmelidir (route
   handlers, server actions, RSC, server-only services).
   `node:dns` Browser bundle'ında bulunmadığı için client-side
   import build hatası verir → doğal koruma.
=============================================================== */

import dnsCb, { promises as dns, type LookupAddress, type LookupOptions } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import {
  validateExternalUrlStatic,
  isPrivateOrReservedIPv4,
  isBlockedIPv6,
  isBlockedIpAddress,
  isIpLiteralHost,
  stripIpv6Brackets,
  SAFE_REJECT_MESSAGE,
  type SsrfReason,
  type SsrfValidationResult,
} from "@/lib/security/ssrf";

/* validateExternalUrl(url) — full DNS-aware validation.
   1) Static validator (URL parse, protocol, userinfo, hostname/IP
      literal blocklist).
   2) Hostname DNS lookup (all=true) — herhangi bir resolved IP
      private/reserved/link-local ise REJECT.
   Pragmatik DNS rebinding defense: lookup ↔ fetch arasındaki TTL
   window'unda IP değişebilir; bu helper bunu mutlak garanti
   etmez ama % 99 saldırı vektörünü kapatır. Mutlak garanti için
   resolved IP'ye pinning + Host header rewrite gerekir (kapsam dışı). */
export async function validateExternalUrl(
  rawUrl: unknown
): Promise<SsrfValidationResult> {
  const staticRes = validateExternalUrlStatic(rawUrl);
  if (!staticRes.ok) return staticRes;

  const parsed = staticRes.url;
  const host = stripIpv6Brackets(parsed.hostname);

  /* Host IP literal ise static kontrol onu (parantezli IPv6 dahil) zaten
     doğruladı → DNS gereksiz. ⚠️ Eskiden ":" içeren HER host burada
     KONTROLSÜZ kabul ediliyordu ("[::1]" bypass'ı — M-01); artık
     yalnız gerçekten parse edilebilen IP literal'ler atlanır ve
     isBlockedIpAddress ile İKİNCİ kez kontrol edilir. */
  if (isIpLiteralHost(host)) {
    return isBlockedIpAddress(host)
      ? { ok: false, error: SAFE_REJECT_MESSAGE, reason: "private-ipv6" }
      : { ok: true, url: parsed };
  }

  /* DNS resolve — tüm adresleri al, herhangi biri private ise REJECT. */
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return {
      ok: false,
      error: "Bu URL çözümlenemedi (DNS hatası)",
      reason: "dns-fail",
    };
  }
  if (!addrs || addrs.length === 0) {
    return {
      ok: false,
      error: "Bu URL çözümlenemedi (DNS hatası)",
      reason: "dns-empty",
    };
  }
  for (const a of addrs) {
    if (a.family === 4) {
      if (isPrivateOrReservedIPv4(a.address)) {
        return {
          ok: false,
          error: SAFE_REJECT_MESSAGE,
          reason: "dns-private-ipv4",
        };
      }
    } else if (a.family === 6) {
      if (isBlockedIPv6(a.address)) {
        return {
          ok: false,
          error: SAFE_REJECT_MESSAGE,
          reason: "dns-private-ipv6",
        };
      }
    }
  }

  return { ok: true, url: parsed };
}

/* assertSafeExternalUrl — convenience throw variant.
   Servis katmanı catch'i mesajı kullanıcıya iletebilir. */
export async function assertSafeExternalUrl(rawUrl: unknown): Promise<URL> {
  const res = await validateExternalUrl(rawUrl);
  if (!res.ok) {
    const err = new Error(res.error) as Error & { ssrfReason?: string };
    err.ssrfReason = res.reason;
    throw err;
  }
  return res.url;
}

/* ===============================================================
   🛡️ H-03 — BAĞLANTI ANINDA IP DOĞRULAMALI (DNS-pinned) GET
   ===============================================================
   `validateExternalUrl` DNS'i isteğin ÖNCESİNDE çözer; asıl bağlantı
   ayrı bir çözümleme yapar → TTL penceresinde IP değişirse (DNS
   rebinding) iç ağa bağlanılabilir. Buradaki istek Node `http(s)`
   ile yapılır ve soket, `lookup` kancasında DOĞRULANMIŞ IP'ye bağlanır
   (çözümlenen adreslerden BİRİ bile engelliyse bağlantı kurulmaz).
   IP literal host'lar lookup'a hiç girmez; onlar static guard'da
   (parantezli IPv6 dahil) reddedilir.

   Redirect: otomatik takip YOK. Her hop'ta hedef yeniden doğrulanır
   (protokol + allowHost + static + DNS + bağlantı anı IP'si).
   Proxy env'leri kullanılmaz (doğrudan bağlantı). */

/** net/http `lookup` kancası: çözümlenen TÜM adresler güvenli olmalı. */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number
  ) => void
): void {
  dnsCb.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = (addresses || []) as LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedIpAddress(a.address))) {
      const e = new Error(SAFE_REJECT_MESSAGE) as NodeJS.ErrnoException & {
        ssrfReason?: SsrfReason;
      };
      e.code = "ESSRFBLOCKED";
      const bad = list.find((a) => isBlockedIpAddress(a.address));
      e.ssrfReason = !bad ? "dns-empty" : bad.family === 6 ? "dns-private-ipv6" : "dns-private-ipv4";
      return callback(e, "", 0);
    }
    const wanted = options?.family === 4 || options?.family === 6 ? options.family : 0;
    const usable = wanted ? list.filter((a) => a.family === wanted) : list;
    if (usable.length === 0) {
      const e = new Error("DNS: uygun adres yok") as NodeJS.ErrnoException;
      e.code = "ENOTFOUND";
      return callback(e, "", 0);
    }
    if (options?.all) return callback(null, usable);
    return callback(null, usable[0].address, usable[0].family);
  });
}

export type SafeGetResult =
  | { ok: true; res: IncomingMessage; url: URL }
  | { ok: false; reason: SsrfReason | "http-status" | "network" | "timeout"; status?: number; error: string };

export type SafeGetOptions = {
  /** Her hop'ta çağrılır — false → istek atılmaz ("host-not-allowed"). */
  allowUrl?: (url: URL) => boolean;
  maxRedirects?: number;
  /** Bağlantı + yanıt başlıkları için süre sınırı (gövde akışı hariç). */
  headersTimeoutMs?: number;
  userAgent?: string;
};

function requestOnce(url: URL, opts: Required<Pick<SafeGetOptions, "headersTimeoutMs" | "userAgent">>) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        agent: false, // bağlantı havuzu yok → her istek kendi lookup'ı ile
        lookup: guardedLookup as unknown as http.RequestOptions["lookup"],
        headers: { "User-Agent": opts.userAgent, Accept: "image/*,*/*;q=0.5" },
      },
      (res) => {
        clearTimeout(timer);
        resolve(res);
      }
    );
    const timer = setTimeout(() => {
      const e = new Error("timeout") as NodeJS.ErrnoException;
      e.code = "ETIMEDOUT";
      req.destroy(e);
    }, opts.headersTimeoutMs);
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

/**
 * SSRF-güvenli GET: başarılıysa gövdesi OKUNMAMIŞ yanıt akışı döner
 * (çağıran tüketir/`destroy` eder). Hata/engel durumunda asla throw etmez.
 */
export async function safeGetStream(
  rawUrl: string,
  options: SafeGetOptions = {}
): Promise<SafeGetResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  const reqOpts = {
    headersTimeoutMs: options.headersTimeoutMs ?? 15_000,
    userAgent: options.userAgent ?? "TatilinYeri-Server/1.0",
  };
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const v = await validateExternalUrl(current);
    if (!v.ok) return { ok: false, reason: v.reason, error: v.error };
    if (options.allowUrl && !options.allowUrl(v.url)) {
      return { ok: false, reason: "host-not-allowed", error: SAFE_REJECT_MESSAGE };
    }

    let res: IncomingMessage;
    try {
      res = await requestOnce(v.url, reqOpts);
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { ssrfReason?: SsrfReason };
      if (e?.code === "ESSRFBLOCKED") {
        return { ok: false, reason: e.ssrfReason || "dns-private-ipv4", error: SAFE_REJECT_MESSAGE };
      }
      if (e?.code === "ETIMEDOUT") return { ok: false, reason: "timeout", error: "Zaman aşımı" };
      return { ok: false, reason: "network", error: e?.message || "Ağ hatası" };
    }

    const status = res.statusCode || 0;
    if (status >= 300 && status < 400) {
      const loc = res.headers.location;
      res.resume(); // gövdeyi at, soketi kapat
      if (!loc) return { ok: false, reason: "redirect-missing-location", error: `HTTP ${status}` };
      if (hop >= maxRedirects) {
        return { ok: false, reason: "too-many-redirects", error: "Çok fazla yönlendirme" };
      }
      try {
        current = new URL(loc, v.url).toString();
      } catch {
        return { ok: false, reason: "parse", error: "Yönlendirme adresi geçersiz" };
      }
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      return { ok: false, reason: "http-status", status, error: `HTTP ${status}` };
    }
    return { ok: true, res, url: v.url };
  }
  return { ok: false, reason: "too-many-redirects", error: "Çok fazla yönlendirme" };
}
