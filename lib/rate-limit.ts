import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/* ===============================================================
   🛡️ RATE LIMIT — Upstash Redis + sliding window
   ===============================================================
   AMAÇ:
     Public API endpoint'leri için IP-bazlı abuse koruması.
     Çağrı: `applyRateLimit(req, "mail" | "availability" | ...)`.
     Limit aşılırsa 429 + `{ error: "Too many requests" }` döner.

   GÜVENLİK SINIRI:
     • `import "server-only"` — bu modül CLIENT bundle'a sızarsa
       Next.js BUILD HATA verir.
     • Upstash credentials `process.env.UPSTASH_REDIS_REST_URL` +
       `UPSTASH_REDIS_REST_TOKEN` (NEXT_PUBLIC_ YOK) — client'ta
       expose YOK.

   ENV:
     UPSTASH_REDIS_REST_URL    — Upstash dashboard'tan REST URL
     UPSTASH_REDIS_REST_TOKEN  — Upstash dashboard'tan REST token

     İkisi de TANIMLI değilse (örn. local dev `.env.local` yok):
       → "open" mode: tüm istekler geçer, limit uygulanmaz.
       → Developer experience bozulmaz, console.warn ile uyarır.
       → Production'da bu env'ler set EDİLMELİ.

   IP RESOLUTION (graceful fallback chain):
     1) `x-forwarded-for` (reverse proxy chain ilk IP)
     2) `x-real-ip` (bazı reverse proxy'ler)
     3) `cf-connecting-ip` (Cloudflare)
     4) → "unknown" (rate-limit yine uygulanır, bucket "unknown"
        olur — tüm anonim trafik aynı bucket'ı paylaşır;
        production'da reverse proxy (Coolify/Traefik) `x-forwarded-for`'u set
        edildiği için pratik bir sorun yok)

   KEY NAMESPACE:
     `rl:<group>:<ip>` — namespace isolation; farklı limit gruplarının
     bucket'ları çakışmaz.

   PERFORMANCE:
     - Redis instance singleton (modül-level cache)
     - Her grup için Ratelimit instance singleton (modül-level cache)
     - Sliding window: daha gerçekçi davranış (sabit pencere edge'lerinde
       burst patlamaz)
     - ~3-10ms typical Upstash latency (Europe edge); pratikte
       trivial

   GROUP LIMITS:
     mail              → 5  req/dakika/IP   (spam koruması)
     availability      → 30 req/dakika/IP   (modal lazy mount + nadir reload)
     geocode           → 20 req/dakika/IP   (Nominatim quota koruması)
     exchange          → 30 req/dakika/IP   (TCMB quota koruması)
     reservation       → 3  req/10dk/IP     (public booking CREATE — abuse)
     reservation_check → 10 req/10dk/IP     (public durum sorgulama — brute-force)
     contact           → 5  req/10dk/IP     (public iletişim formu — spam)
     offer             → 5  req/10dk/IP     (public teklif formu — spam)
     totp-disable                → 5  req/10dk/IP  (2FA disable re-auth brute-force)
     totp-recovery-regenerate    → 5  req/10dk/IP  (kurtarma kodu yenileme re-auth brute-force)

   GERIYE UYUMLULUK:
     - Limit altındaysa: `null` döner → route handler eski davranış aynen
     - Limit aşıldıysa: `NextResponse` 429 döner → caller bu response'u
       return etmeli (erken-return pattern)
     - Env eksikse: `null` döner (open mode)
   =============================================================== */

/* ---------------------------------------------------------------
   Group config — endpoint sınıfı başına limit
   --------------------------------------------------------------- */
export type RateLimitGroup =
  | "mail"
  | "availability"
  | "geocode"
  | "exchange"
  | "zip"
  | "reservation"
  | "reservation_check"
  | "contact"
  | "offer"
  | "totp"
  | "totp-disable"
  | "totp-recovery-regenerate";

const GROUP_CONFIG: Record<
  RateLimitGroup,
  { requests: number; window: `${number} ${"s" | "m" | "h"}` }
> = {
  mail: { requests: 5, window: "1 m" },
  availability: { requests: 30, window: "1 m" },
  geocode: { requests: 20, window: "1 m" },
  exchange: { requests: 30, window: "1 m" },
  /* 🛡️ ZIP download — egress-pahalı (villanın tüm görselleri stream).
     Sıkı limit: 10/dk/IP. ⚠️ fail-open uyarısı: Upstash env yoksa
     limitsiz çalışır; bu endpoint için env prod'da ZORUNLU. */
  zip: { requests: 10, window: "1 m" },
  /* 🛡️ PUBLIC BOOKING CREATE — düşük frekanslı submit; bot/abuse
     koruması. 10 dk pencere ile burst engellenir (availability
     modal okumaları AYRI bucket'ta — bu yalnız final POST). */
  reservation: { requests: 3, window: "10 m" },
  /* 🛡️ PUBLIC REZERVASYON DURUM SORGULAMA — kod+email eşleşmesi;
     brute-force/enumeration koruması (availability'den izole). */
  reservation_check: { requests: 10, window: "10 m" },
  /* 🛡️ PUBLIC İLETİŞİM FORMU — anon insert artık server route'ta;
     spam/flood koruması. */
  contact: { requests: 5, window: "10 m" },
  /* 🛡️ PUBLIC TEKLİF FORMU — anon insert artık server route'ta;
     spam/flood koruması. */
  offer: { requests: 5, window: "10 m" },
  /* 🛡️ TOTP 2FA — /api/auth/2fa/verify brute-force koruması (IP-bazlı;
     hesap-bazlı totp_failed_attempts/totp_locked_until AYRI katman,
     bkz. totp-verify.service.ts). Login'deki 5 deneme/15dk desenine
     yakın ama ayrı IP-bucket — bir IP'den TÜM adminlere karşı deneme
     de sınırlanır. */
  totp: { requests: 10, window: "10 m" },
  /* 🛡️ M-1 SECURITY FIX — `/api/admin/2fa/disable` ve
     `/api/admin/2fa/recovery-codes/regenerate` re-auth kontrolü
     (password/TOTP kodu) ÖNCEDEN hiçbir rate-limit'e tabi değildi.
     Bu iki endpoint yalnız GEÇERLİ bir admin session ile
     ulaşılabilir (authorizeAdminSession()) — ama ele geçirilmiş bir
     session (ör. XSS ile ambient httpOnly cookie taşıyan fetch)
     üzerinden şifre/TOTP kodu sınırsız denenip login endpoint'inin
     kilit mekanizması bypass edilerek 2FA kalıcı olarak kapatılabilir/
     kurtarma kodları yenilenebiliyordu. IP-bazlı, "totp" grubuyla
     aynı ölçekte ama AYRI bucket — normal TOTP-verify trafiğiyle
     paylaşılmaz. */
  "totp-disable": { requests: 5, window: "10 m" },
  "totp-recovery-regenerate": { requests: 5, window: "10 m" },
};

/* ---------------------------------------------------------------
   Lazy singleton: Redis client + per-group Ratelimit instances
   --------------------------------------------------------------- */
let redisInstance: Redis | null = null;
let envChecked = false;
let envAvailable = false;

function getRedis(): Redis | null {
  if (envChecked) return redisInstance;
  envChecked = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    /* Open mode — dev env'de credentials yok; production'da bu uyarı
       deploy hatasına işaret eder. */
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN MISSING — rate limiting DISABLED in production!"
      );
    } else {
      console.info(
        "[rate-limit] Upstash env not set; running in open mode (dev)."
      );
    }
    envAvailable = false;
    return null;
  }

  envAvailable = true;
  redisInstance = new Redis({ url, token });
  return redisInstance;
}

const ratelimitCache = new Map<RateLimitGroup, Ratelimit>();

function getRatelimit(group: RateLimitGroup): Ratelimit | null {
  const redis = getRedis();
  if (!redis || !envAvailable) return null;

  const cached = ratelimitCache.get(group);
  if (cached) return cached;

  const cfg = GROUP_CONFIG[group];
  const instance = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.requests, cfg.window),
    analytics: false,
    prefix: `rl:${group}`,
  });
  ratelimitCache.set(group, instance);
  return instance;
}

/* ---------------------------------------------------------------
   IP resolution — reverse proxy chain fallback
   --------------------------------------------------------------- */
function resolveClientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    /* X-Forwarded-For "client, proxy1, proxy2" — ilk eleman = client */
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "unknown";
}

/* ---------------------------------------------------------------
   PUBLIC API — applyRateLimit
   ---------------------------------------------------------------
   Kullanım (her route handler başında):
     const limited = await applyRateLimit(req, "mail");
     if (limited) return limited;
     // ... mevcut handler logic ...

   Dönen değer:
     - `null` → istek geçti, devam et
     - `Response` (429) → erken-return, caller direkt return etmeli
--------------------------------------------------------------- */
export async function applyRateLimit(
  req: Request,
  group: RateLimitGroup
): Promise<Response | null> {
  const rl = getRatelimit(group);
  if (!rl) {
    /* Env yok veya open mode → her istek geçer. */
    return null;
  }

  const ip = resolveClientIp(req);

  try {
    const { success, limit, remaining, reset } = await rl.limit(ip);

    if (!success) {
      /* Stable JSON shape; client/admin tarafında parse edilebilir. */
      return new Response(
        JSON.stringify({ error: "Too many requests" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(reset),
            "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
          },
        }
      );
    }

    return null;
  } catch (err) {
    /* Upstash bağlantı hatası → fail-open (istek geçer). Production
       monitoring (Sentry) bu console.error'ı yakalar. */
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[rate-limit] Upstash error, fail-open:", msg);
    return null;
  }
}
