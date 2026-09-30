// @vitest-environment node
/* ===============================================================
   🛡️ H-03 / M-01 — SSRF guard testleri
   ===============================================================
   • Static guard: IPv4/IPv6 (parantezli dahil), loopback, private,
     link-local, multicast, metadata, IPv4-mapped/NAT64/6to4.
   • DNS-aware guard: private IP'ye çözülen hostname.
   • safeGetStream: GERÇEK HTTP(S) sunucularıyla redirect, redirect
     zinciri, farklı port, HTTP→HTTPS, bağlantı-anı DNS rebinding.

   "Public" test hedefi: konteynerin eth0 adresi (os.networkInterfaces
   ile bulunur; loopback/private değilse). DNS çözümlemesi test
   hostname'leri için mock'lanır, geri kalanı gerçek.
   =============================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { AddressInfo } from "node:net";

/* ---------------- DNS mock (yalnız test hostname'leri) ---------------- */
type Addr = { address: string; family: 4 | 6 };
const promiseMap = new Map<string, Addr[]>(); // validateExternalUrl (ön kontrol)
const connectMap = new Map<string, Addr[]>(); // guardedLookup (bağlantı anı)

vi.mock("node:dns", async () => {
  const actual = await vi.importActual<typeof import("node:dns")>("node:dns");
  const lookup = ((host: string, opts: unknown, cb: (...a: unknown[]) => void) => {
    const hit = connectMap.get(host) ?? promiseMap.get(host);
    if (hit) return process.nextTick(() => cb(null, hit));
    return (actual.lookup as unknown as (...a: unknown[]) => void)(host, opts, cb);
  }) as unknown as typeof actual.lookup;
  const promises = {
    ...actual.promises,
    lookup: async (host: string, opts: unknown) => {
      const hit = promiseMap.get(host);
      if (hit) return hit;
      return actual.promises.lookup(host, opts as never);
    },
  };
  return { ...actual, default: { ...actual, lookup, promises }, lookup, promises };
});

import {
  validateExternalUrlStatic,
  isBlockedIPv6,
  isBlockedIpAddress,
  isPrivateOrReservedIPv4,
} from "@/lib/security/ssrf";
import { validateExternalUrl, safeGetStream } from "@/lib/security/ssrf.server";

/* ================================================================ */
describe("static guard — engellenen adresler", () => {
  const BLOCKED = [
    "http://127.0.0.1/",
    "http://127.10.20.30:8080/x",
    "http://localhost/",
    "http://LOCALHOST:3000/",
    "http://localhost./",
    "http://app.localhost/",
    "http://0.0.0.0/",
    "http://0/",
    "http://2130706433/", // 127.0.0.1 ondalık
    "http://0x7f000001/", // 127.0.0.1 hex
    "http://127.1/",
    "http://10.0.0.1/",
    "http://10.255.255.255/",
    "http://172.16.0.1/",
    "http://172.31.255.254/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.100.100.200/", // CGNAT (Alibaba metadata)
    "http://224.0.0.1/",
    "http://255.255.255.255/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://redis.internal:6379/",
    "http://db.local/",
    // IPv6 — köşeli parantezli (eski bypass: M-01)
    "http://[::1]/",
    "http://[::1]:3000/secret",
    "http://[0:0:0:0:0:0:0:1]/",
    "http://[::]/",
    "http://[::ffff:127.0.0.1]/", // → [::ffff:7f00:1]
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:a9fe:a9fe]/", // mapped 169.254.169.254
    "http://[::ffff:10.0.0.1]/",
    "http://[64:ff9b::7f00:1]/", // NAT64 → 127.0.0.1
    "http://[64:ff9b::a9fe:a9fe]/", // NAT64 → metadata
    "http://[2002:7f00:1::]/", // 6to4 → 127.0.0.1
    "http://[2002:c0a8:101::1]/", // 6to4 → 192.168.1.1
    "http://[fe80::1]/",
    "http://[fe80::1%25eth0]/",
    "http://[febf::1]/",
    "http://[fec0::1]/",
    "http://[fc00::1]/",
    "http://[fd12:3456:789a::1]/",
    "http://[fd00:ec2::254]/", // AWS IPv6 metadata
    "http://[ff02::1]/",
    "http://[2001:db8::1]/",
    "http://[2001:0:4136:e378::1]/", // Teredo
    "http://[100::1]/",
  ];
  it.each(BLOCKED)("%s → RED", (u) => {
    const r = validateExternalUrlStatic(u);
    expect(r.ok, u).toBe(false);
  });

  it("protokol / userinfo / boş host → RED", () => {
    for (const u of ["file:///etc/passwd", "gopher://x/", "ftp://example.com/", "http://user:pw@example.com/", "javascript:alert(1)"]) {
      expect(validateExternalUrlStatic(u).ok, u).toBe(false);
    }
  });
});

describe("static guard — izin verilen adresler", () => {
  const ALLOWED = [
    "https://example.com/a.jpg",
    "https://cdn.tatilinyeri.example/villas/x/1.webp",
    "https://abc.supabase.co/storage/v1/object/public/villa-images/x.jpg",
    "http://93.184.216.34/",
    "https://8.8.8.8:8443/x",
    "https://[2606:4700:4700::1111]/", // global unicast (Cloudflare DNS)
    "https://[2a00:1450:4001:82a::200e]/",
    "http://[::ffff:8.8.8.8]/", // mapped PUBLIC IPv4
  ];
  it.each(ALLOWED)("%s → KABUL", (u) => {
    expect(validateExternalUrlStatic(u).ok, u).toBe(true);
  });
});

describe("IP yardımcıları", () => {
  it("isBlockedIPv6: parantezli / parantezsiz aynı sonuç", () => {
    for (const v of ["::1", "[::1]", "fe80::abcd", "[fd00::1]", "::ffff:7f00:1", "::ffff:127.0.0.1"]) {
      expect(isBlockedIPv6(v), v).toBe(true);
    }
    for (const v of ["2606:4700:4700::1111", "[2a00:1450:4001:82a::200e]"]) {
      expect(isBlockedIPv6(v), v).toBe(false);
    }
    // IPv6 değil → bu fonksiyonun kapsamı dışında
    expect(isBlockedIPv6("example.com")).toBe(false);
    expect(isBlockedIPv6("[zz::1]")).toBe(false);
  });

  it("isBlockedIpAddress: IPv4 + IPv6", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("172.20.0.5")).toBe(true); // Docker bridge
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateOrReservedIPv4("172.32.0.1")).toBe(false); // 172.16/12 dışı
  });
});

/* ================================================================ */
describe("DNS-aware guard (validateExternalUrl)", () => {
  beforeAll(() => {
    promiseMap.set("rebind-a.test", [{ address: "127.0.0.1", family: 4 }]);
    promiseMap.set("meta.test", [{ address: "169.254.169.254", family: 4 }]);
    promiseMap.set("v6private.test", [{ address: "fd00::1", family: 6 }]);
    promiseMap.set("v6loop.test", [{ address: "::1", family: 6 }]);
    promiseMap.set("mixed.test", [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    promiseMap.set("public.test", [{ address: "93.184.216.34", family: 4 }]);
  });

  it("private IP'ye çözülen hostname → RED (IPv4, IPv6, karışık)", async () => {
    for (const h of ["rebind-a.test", "meta.test", "v6private.test", "v6loop.test", "mixed.test"]) {
      const r = await validateExternalUrl(`http://${h}/x`);
      expect(r.ok, h).toBe(false);
    }
  });

  it("public'e çözülen hostname → KABUL", async () => {
    expect((await validateExternalUrl("https://public.test/a.webp")).ok).toBe(true);
  });

  it("M-01: parantezli IPv6 literal artık DNS adımında da kabul edilmez", async () => {
    for (const u of ["http://[::1]/", "http://[::ffff:7f00:1]/", "http://[fe80::1]/"]) {
      expect((await validateExternalUrl(u)).ok, u).toBe(false);
    }
    expect((await validateExternalUrl("https://[2606:4700:4700::1111]/")).ok).toBe(true);
  });
});

/* ================================================================
   safeGetStream — GERÇEK HTTP(S) istekleri
   ================================================================ */
const PUBLIC_IP = Object.values(os.networkInterfaces())
  .flat()
  .find(
    (a) => a && a.family === "IPv4" && !a.internal && !isBlockedIpAddress(a.address)
  )?.address;

const d = PUBLIC_IP ? describe : describe.skip;

d("safeGetStream (gerçek HTTP sunucuları)", () => {
  const servers: Array<http.Server | https.Server> = [];
  let pA = 0; // "CDN" (izinli)
  let pB = 0; // aynı IP, farklı port (izinsiz)
  let pTls = 0; // HTTPS
  let pInternal = 0; // 127.0.0.1 — iç servis (SECRET)
  let pInternal6 = 0; // ::1 — iç servis (SECRET)
  let internalHits = 0;
  const TLS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ssrf-tls-"));
  let prevTls: string | undefined;

  const listen = (srv: http.Server | https.Server, host: string) =>
    new Promise<number>((res, rej) => {
      srv.once("error", rej);
      srv.listen(0, host, () => res((srv.address() as AddressInfo).port));
    });

  beforeAll(async () => {
    const internal = http.createServer((_q, r) => {
      internalHits += 1;
      r.end("SECRET");
    });
    servers.push(internal);
    pInternal = await listen(internal, "127.0.0.1");
    const internal6 = http.createServer((_q, r) => {
      internalHits += 1;
      r.end("SECRET6");
    });
    /* Ortamda IPv6 yoksa (EAFNOSUPPORT) [::1] testleri 127.0.0.1 portunu
       hedefler — guard her iki durumda da bağlantıdan ÖNCE reddeder. */
    pInternal6 = await listen(internal6, "::1").catch(() => 0);
    if (pInternal6) servers.push(internal6);

    const cdn = http.createServer((q, r) => {
      const u = q.url || "/";
      const go = (loc: string) => {
        r.statusCode = 302;
        r.setHeader("Location", loc);
        r.end();
      };
      if (u === "/img.webp") {
        r.setHeader("Content-Type", "image/webp");
        return r.end("IMAGE-BYTES");
      }
      if (u === "/r-internal") return go(`http://127.0.0.1:${pInternal}/secret`);
      if (u === "/r-v6") return go(`http://[::1]:${pInternal6 || pInternal}/secret`);
      if (u === "/r-meta") return go("http://169.254.169.254/latest/meta-data/");
      if (u === "/r-rebind") return go(`http://rebind-b.test:${pInternal}/secret`);
      if (u === "/r-chain1") return go("/r-chain2");
      if (u === "/r-chain2") return go(`http://cdn.public.test:${pA}/img.webp`);
      if (u === "/r-loop") return go("/r-loop");
      if (u === "/r-port") return go(`http://cdn.public.test:${pB}/img.webp`);
      if (u === "/r-https") return go(`https://cdn.public.test:${pTls}/img.webp`);
      if (u === "/r-nolocation") {
        r.statusCode = 302;
        return r.end();
      }
      r.statusCode = 404;
      r.end("nope");
    });
    servers.push(cdn);
    pA = await listen(cdn, PUBLIC_IP!);
    const other = http.createServer((_q, r) => r.end("OTHER-PORT"));
    servers.push(other);
    pB = await listen(other, PUBLIC_IP!);

    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout ${TLS_DIR}/k.pem -out ${TLS_DIR}/c.pem -days 1 -subj /CN=cdn.public.test 2>/dev/null`
    );
    const tls = https.createServer(
      { key: fs.readFileSync(`${TLS_DIR}/k.pem`), cert: fs.readFileSync(`${TLS_DIR}/c.pem`) },
      (q, r) => {
        if (q.url === "/img.webp") return r.end("TLS-IMAGE");
        if (q.url === "/r-internal") {
          r.statusCode = 301;
          r.setHeader("Location", `http://127.0.0.1:${pInternal}/secret`);
          return r.end();
        }
        r.statusCode = 404;
        r.end();
      }
    );
    servers.push(tls);
    pTls = await listen(tls, PUBLIC_IP!);
    /* Kendinden imzalı test sertifikası — yalnız bu describe süresince. */
    prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    promiseMap.set("cdn.public.test", [{ address: PUBLIC_IP!, family: 4 }]);
    // DNS rebinding: ön kontrolde public, bağlantı anında 127.0.0.1
    promiseMap.set("rebind-b.test", [{ address: PUBLIC_IP!, family: 4 }]);
    connectMap.set("rebind-b.test", [{ address: "127.0.0.1", family: 4 }]);
  });

  afterAll(() => {
    if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    for (const s of servers) s.close();
    fs.rmSync(TLS_DIR, { recursive: true, force: true });
  });

  const read = (res: http.IncomingMessage) =>
    new Promise<string>((ok) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => ok(b));
    });
  const allowA = (u: URL) => u.host === `cdn.public.test:${pA}` || u.host === `cdn.public.test:${pTls}`;

  it("güvenli public host → gövde okunur", async () => {
    const r = await safeGetStream(`http://cdn.public.test:${pA}/img.webp`, { allowUrl: allowA });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await read(r.res)).toBe("IMAGE-BYTES");
  });

  it("iç adres doğrudan → RED, iç servise HİÇ istek gitmez", async () => {
    const before = internalHits;
    for (const u of [
      `http://127.0.0.1:${pInternal}/secret`,
      `http://localhost:${pInternal}/secret`,
      `http://[::1]:${pInternal6 || pInternal}/secret`,
      `http://0.0.0.0:${pInternal}/secret`,
    ]) {
      const r = await safeGetStream(u);
      expect(r.ok, u).toBe(false);
    }
    expect(internalHits).toBe(before);
  });

  it("redirect → iç adres / [::1] / metadata → RED", async () => {
    const before = internalHits;
    for (const p of ["/r-internal", "/r-v6", "/r-meta"]) {
      const r = await safeGetStream(`http://cdn.public.test:${pA}${p}`, { allowUrl: allowA });
      expect(r.ok, p).toBe(false);
    }
    expect(internalHits).toBe(before);
  });

  it("redirect zinciri (göreli + mutlak, aynı izinli host) → takip edilir", async () => {
    const r = await safeGetStream(`http://cdn.public.test:${pA}/r-chain1`, { allowUrl: allowA });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await read(r.res)).toBe("IMAGE-BYTES");
  });

  it("redirect döngüsü → too-many-redirects; Location yok → RED", async () => {
    const loop = await safeGetStream(`http://cdn.public.test:${pA}/r-loop`, { allowUrl: allowA, maxRedirects: 3 });
    expect(loop.ok === false && loop.reason).toBe("too-many-redirects");
    const noLoc = await safeGetStream(`http://cdn.public.test:${pA}/r-nolocation`, { allowUrl: allowA });
    expect(noLoc.ok === false && noLoc.reason).toBe("redirect-missing-location");
  });

  it("farklı port: aynı host farklı porta redirect / doğrudan → allowlist RED", async () => {
    const viaRedirect = await safeGetStream(`http://cdn.public.test:${pA}/r-port`, { allowUrl: allowA });
    expect(viaRedirect.ok === false && viaRedirect.reason).toBe("host-not-allowed");
    const direct = await safeGetStream(`http://cdn.public.test:${pB}/img.webp`, { allowUrl: allowA });
    expect(direct.ok === false && direct.reason).toBe("host-not-allowed");
    // allowlist verilmezse (genel kullanım) public port'a izin var
    const open = await safeGetStream(`http://cdn.public.test:${pB}/img.webp`);
    expect(open.ok).toBe(true);
    if (open.ok) open.res.resume();
  });

  it("HTTP → HTTPS redirect → takip edilir; HTTPS → iç adres redirect → RED", async () => {
    const up = await safeGetStream(`http://cdn.public.test:${pA}/r-https`, { allowUrl: allowA });
    expect(up.ok).toBe(true);
    if (up.ok) {
      expect(up.url.protocol).toBe("https:");
      expect(await read(up.res)).toBe("TLS-IMAGE");
    }
    const before = internalHits;
    const down = await safeGetStream(`https://cdn.public.test:${pTls}/r-internal`, { allowUrl: allowA });
    expect(down.ok).toBe(false);
    expect(internalHits).toBe(before);
  });

  it("DNS rebinding: ön kontrolde public, bağlantı anında 127.0.0.1 → bağlantı kurulmaz", async () => {
    const before = internalHits;
    const direct = await safeGetStream(`http://rebind-b.test:${pInternal}/secret`);
    expect(direct.ok === false && direct.reason).toBe("dns-private-ipv4");
    const viaRedirect = await safeGetStream(`http://cdn.public.test:${pA}/r-rebind`);
    expect(viaRedirect.ok).toBe(false);
    expect(internalHits).toBe(before);
  });

  it("DNS private'a çözülüyor (ön kontrol) → RED", async () => {
    const r = await safeGetStream(`http://rebind-a.test:${pInternal}/secret`);
    expect(r.ok === false && r.reason).toBe("dns-private-ipv4");
  });

  it("HTTP hata durumu → http-status (gövde okunmaz)", async () => {
    const r = await safeGetStream(`http://cdn.public.test:${pA}/missing`, { allowUrl: allowA });
    expect(r.ok === false && r.reason).toBe("http-status");
    expect(r.ok === false && r.status).toBe(404);
  });
});
