/* ===============================================================
   🛡️ SSRF HARDENING — DENYLIST APPROACH
   ===============================================================
   "Trusted domain allowlist" DEĞİL — küçük yerel firmalar, custom
   agency domain'leri, branded calendar servisleri çalışmaya devam
   etmeli. Bunun yerine "unsafe/internal network denylist":
     • Public domain'ler / public IP'ler  → KABUL
     • Internal/private/loopback/link-local hedefler → REDDET

   Bu dosya BROWSER-SAFE (no Node API). Sync string-level kontrol
   yapar; DNS resolve'lu tam guard server tarafında ssrf.server.ts
   içindedir. İki helper aynı internal ip-range logic'ini paylaşır
   → tek source-of-truth.

   Integration:
     • createExternalCalendarSource (client) → validateExternalUrlStatic
     • syncExternalCalendarSource fetchIcsBody (server) → assertSafeExternalUrl
=============================================================== */

export type SsrfReason =
  | "empty"
  | "too-long"
  | "parse"
  | "protocol"
  | "userinfo"
  | "no-host"
  | "blocked-hostname"
  | "blocked-suffix"
  | "private-ipv4"
  | "private-ipv6"
  | "dns-fail"
  | "dns-empty"
  | "dns-private-ipv4"
  | "dns-private-ipv6"
  | "too-many-redirects"
  | "redirect-missing-location"
  | "host-not-allowed";

export type SsrfValidationResult =
  | { ok: true; url: URL }
  | { ok: false; error: string; reason: SsrfReason };

/* User-facing mesaj: internal IP raw gösterilmez. */
const SAFE_REJECT_MESSAGE = "Bu URL güvenlik nedeniyle kabul edilmiyor";

const MAX_URL_LEN = 2000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/* Tam-hostname blocklist (case-insensitive). */
const BLOCKED_HOSTNAMES = new Set<string>([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
  "0",
  "0.0.0.0",
]);

/* Suffix blocklist — `.local` (mDNS), `.internal`, `.intranet`,
   `.intra`, `.corp`, `.home.arpa` (RFC 8375), `.lan`, `.private`. */
const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".localhost",
  ".lan",
  ".internal",
  ".intranet",
  ".intra",
  ".corp",
  ".private",
  ".home.arpa",
];

/* ---------------------------------------------------------------
   IPv4 — parse + private range check
   --------------------------------------------------------------
   WHATWG URL.hostname already normalizes weird literal forms
   (decimal, octal, hex, short form) → standard dotted-decimal.
   Buraya geldiğinde `host` standart "a.b.c.d" beklenir. */
function parseIPv4(host: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const v = Number(m[i]);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    if (String(v) !== m[i]) return null; // leading zero gibi non-canonical reject
    n = (n << 8) | v;
  }
  return n >>> 0;
}

export function isPrivateOrReservedIPv4(host: string): boolean {
  const n = parseIPv4(host);
  if (n === null) return false;
  /* ⚠️ `>>> 0` ZORUNLU: JS bitwise `&` işaretli 32-bit döner; ilk okteti
     ≥128 olan adreslerde (169.254/16, 172.16/12, 192.168/16, 224/4, …)
     maske sonucu NEGATİF olur ve pozitif hex sabitle `===` ASLA eşleşmez.
     Eski kodda bu yüzden 169.254.169.254 (metadata), 172.16/12 ve
     192.168/16 hiç ENGELLENMİYORDU (H-03 incelemesinde doğrulandı). */
  // 0.0.0.0/8 — "this" network
  if (((n & 0xff000000) >>> 0) === 0x00000000) return true;
  // 10.0.0.0/8
  if (((n & 0xff000000) >>> 0) === 0x0a000000) return true;
  // 100.64.0.0/10 — CGNAT
  if (((n & 0xffc00000) >>> 0) === 0x64400000) return true;
  // 127.0.0.0/8 — loopback
  if (((n & 0xff000000) >>> 0) === 0x7f000000) return true;
  // 169.254.0.0/16 — link-local
  if (((n & 0xffff0000) >>> 0) === 0xa9fe0000) return true;
  // 172.16.0.0/12
  if (((n & 0xfff00000) >>> 0) === 0xac100000) return true;
  // 192.0.0.0/24 — IETF protocol assignments
  if (((n & 0xffffff00) >>> 0) === 0xc0000000) return true;
  // 192.168.0.0/16
  if (((n & 0xffff0000) >>> 0) === 0xc0a80000) return true;
  // 198.18.0.0/15 — benchmarking
  if (((n & 0xfffe0000) >>> 0) === 0xc6120000) return true;
  // 224.0.0.0/4 — multicast
  if (((n & 0xf0000000) >>> 0) === 0xe0000000) return true;
  // 240.0.0.0/4 — reserved (255.255.255.255 dahil)
  if (((n & 0xf0000000) >>> 0) === 0xf0000000) return true;
  return false;
}

/* ---------------------------------------------------------------
   IPv6 — TAM PARSE + range check (H-03 / M-01 düzeltmesi)
   --------------------------------------------------------------
   ⚠️ ESKİ HATA (doğrulandı): WHATWG `URL.hostname` IPv6 literal'in
   köşeli parantezini KORUR (`new URL("http://[::1]/").hostname ===
   "[::1]"`). Eski `isV6Literal` yalnız `[0-9a-f:.]` kabul ettiği için
   "[::1]" IPv6 sayılmıyor → bloklanmıyordu; server tarafı da ":" içeren
   host'ta DNS'i atlayıp KABUL ediyordu. Ayrıca `[::ffff:127.0.0.1]`
   parser tarafından `[::ffff:7f00:1]` (hex) biçimine çevrildiği için
   eski "::ffff:a.b.c.d" regex'i de ıskalıyordu.

   ŞİMDİ: parantez soyulur, adres 8 × 16-bit gruba TAM parse edilir
   (:: kısaltması, gömülü IPv4 kuyruğu, zone-id) ve aralık kontrolü
   sayısal yapılır. Yalnız global unicast (2000::/3) izinli; onun
   içindeki özel/tünel/dokümantasyon blokları da reddedilir. IPv4
   gömen biçimlerde (mapped/compat/NAT64/6to4) gömülü IPv4, IPv4
   kurallarıyla kontrol edilir. */

/** "[::1]" → "::1"; diğerleri aynen. */
export function stripIpv6Brackets(host: string): string {
  return host.length > 1 && host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
}

function parseIPv6(input: string): number[] | null {
  let v = stripIpv6Brackets(input).toLowerCase();
  const zone = v.indexOf("%");
  if (zone !== -1) v = v.slice(0, zone); // fe80::1%eth0 → fe80::1
  if (!v.includes(":") || !/^[0-9a-f:.]+$/.test(v)) return null;

  let tail: number[] = [];
  const lastColon = v.lastIndexOf(":");
  const maybeV4 = v.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const n = parseIPv4(maybeV4);
    if (n === null) return null;
    tail = [(n >>> 16) & 0xffff, n & 0xffff];
    v = v.slice(0, lastColon + 1) + "0"; // yer tutucu; aşağıda kırpılır
  }

  const parts = v.split("::");
  if (parts.length > 2) return null;
  const toGroups = (seg: string): number[] | null => {
    if (seg === "") return [];
    const out: number[] = [];
    for (const g of seg.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  let head = toGroups(parts[0]);
  let rest = parts.length === 2 ? toGroups(parts[1]) : [];
  if (!head || !rest) return null;
  if (tail.length) {
    // yer tutucu "0" son grubu IPv4 kuyruğuyla değiştir
    if (parts.length === 2 && rest.length) rest = [...rest.slice(0, -1), ...tail];
    else if (parts.length === 2) return null;
    else head = [...head.slice(0, -1), ...tail];
  }
  const total = head.length + rest.length;
  if (parts.length === 2) {
    if (total > 7) return null;
    return [...head, ...new Array(8 - total).fill(0), ...rest];
  }
  return total === 8 ? head : null;
}

function embeddedV4(g: number[], hi: number): string {
  const a = g[hi], b = g[hi + 1];
  return `${a >>> 8}.${a & 0xff}.${b >>> 8}.${b & 0xff}`;
}

export function isBlockedIPv6(host: string): boolean {
  const g = parseIPv6(host);
  if (!g) return false; // IPv6 literal değil → bu kontrolün kapsamı dışında
  // ::/96 — unspecified (::), loopback (::1), eski IPv4-compatible
  if (g.slice(0, 6).every((x) => x === 0)) return true;
  // ::ffff:0:0/96 — IPv4-mapped → gömülü IPv4 kuralları
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isPrivateOrReservedIPv4(embeddedV4(g, 6));
  }
  // ::ffff:0:0:0/96 — IPv4-translated (SIIT) → reddet
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) return true;
  // 64:ff9b::/96 — NAT64 well-known → gömülü IPv4 kuralları
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateOrReservedIPv4(embeddedV4(g, 6));
  }
  // 64:ff9b:1::/48 — NAT64 local-use
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true;
  // 100::/64 — discard-only
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;
  // 2000::/3 DIŞINDAKİ her şey (fc00::/7 ULA, fe80::/10 link-local,
  // fec0::/10 site-local, ff00::/8 multicast, rezerve bloklar) → reddet
  if ((g[0] & 0xe000) !== 0x2000) return true;
  // 2001::/32 Teredo (tünel), 2001:db8::/32 dokümantasyon,
  // 2001:10::/28 ORCHID, 2001:20::/28 ORCHIDv2
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true;
  if (g[0] === 0x2001 && (g[1] & 0xfff0) === 0x10) return true;
  if (g[0] === 0x2001 && (g[1] & 0xfff0) === 0x20) return true;
  // 2002::/16 — 6to4 → gömülü IPv4 kuralları
  if (g[0] === 0x2002) return isPrivateOrReservedIPv4(embeddedV4(g, 1));
  return false;
}

/** IPv4 veya IPv6 (parantezli/parantezsiz) adres engelli mi? IP değilse false. */
export function isBlockedIpAddress(address: string): boolean {
  const a = stripIpv6Brackets(address.trim());
  if (parseIPv4(a) !== null) return isPrivateOrReservedIPv4(a);
  return isBlockedIPv6(a);
}

/** Host bir IP literal mı (IPv4 dotted veya IPv6, parantezli olabilir)? */
export function isIpLiteralHost(host: string): boolean {
  const h = stripIpv6Brackets(host);
  return parseIPv4(h) !== null || parseIPv6(h) !== null;
}

/* ---------------------------------------------------------------
   Public sync validator — browser-safe.
   Yalnız string-level kontroller (URL parse, protocol, userinfo,
   hostname blocklist, IP literal). DNS resolve YAPMAZ — admin form
   submit'inde anlık feedback için. Server-side syncExternal* tarafı
   ek olarak DNS guard ekler (ssrf.server.ts). */
export function validateExternalUrlStatic(
  rawUrl: unknown
): SsrfValidationResult {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { ok: false, error: "URL boş olamaz", reason: "empty" };
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > MAX_URL_LEN) {
    return { ok: false, error: "URL çok uzun", reason: "too-long" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Geçersiz URL formatı", reason: "parse" };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      error: "Yalnız http:// ve https:// adresleri kabul edilir",
      reason: "protocol",
    };
  }

  /* userinfo (user:pass@host) — SSRF bypass vektörü; iCal feed'lerde
     gerekli değil → reject. */
  if (parsed.username !== "" || parsed.password !== "") {
    return {
      ok: false,
      error: SAFE_REJECT_MESSAGE,
      reason: "userinfo",
    };
  }

  /* WHATWG URL hostname'i küçük harfe çevirir ama IPv6 köşeli parantezini
     KORUR ("[::1]") → soyulur. Sondaki nokta ("localhost.") FQDN yazımıdır;
     blocklist'i atlatmasın diye kontrol için kırpılır. */
  const host = stripIpv6Brackets(parsed.hostname).replace(/\.+$/, "");
  if (!host) {
    return {
      ok: false,
      error: "URL host bilgisi içermiyor",
      reason: "no-host",
    };
  }

  if (BLOCKED_HOSTNAMES.has(host)) {
    return {
      ok: false,
      error: SAFE_REJECT_MESSAGE,
      reason: "blocked-hostname",
    };
  }
  for (const sfx of BLOCKED_HOSTNAME_SUFFIXES) {
    if (host.endsWith(sfx)) {
      return {
        ok: false,
        error: SAFE_REJECT_MESSAGE,
        reason: "blocked-suffix",
      };
    }
  }

  if (isPrivateOrReservedIPv4(host)) {
    return {
      ok: false,
      error: SAFE_REJECT_MESSAGE,
      reason: "private-ipv4",
    };
  }
  if (isBlockedIPv6(host)) {
    return {
      ok: false,
      error: SAFE_REJECT_MESSAGE,
      reason: "private-ipv6",
    };
  }

  return { ok: true, url: parsed };
}

/* Sadece string-level reject mesajı — server-side helper de aynı
   mesajı paylaşır. Internal IP raw gösterilmez. */
export { SAFE_REJECT_MESSAGE };
