import { NextResponse } from "next/server";

/* ===============================================================
   🛡️ HEALTH / BUILD DIAGNOSTIC ENDPOINT
   ===============================================================
   Read-only. UI'a yansımaz. Sadece operasyonel doğrulama için.

   AMAÇ:
   - Production deploy sonrası "hangi bundle çalışıyor?" sorusunu
     anında cevaplamak.
   - Stale .next bundle ↔ fresh source drift'ini diagnose etmek
     (timezone bug history'sinin tekrar yaşanmasını engellemek).

   ÇIKTI ÖRNEĞİ:
     {
       "ok": true,
       "serverStartTime": "2026-05-11T17:44:06.000Z",
       "nodeVersion": "v22.22.0",
       "nextVersion": "16.2.4",
       "now": "2026-05-11T18:01:15.234Z"
     }

   YORUM:
   - serverStartTime: bu Node process'in başladığı an (module load
     zamanı); Coolify'da `next start` çağrı anı. Deploy sonrası bu
     değerin değişmesi beklenir → eğer aynı kalıyorsa stale runtime.
   - now: current request time. serverStartTime ile farkı uptime
     verir.
   - nodeVersion: pin doğrulama (.nvmrc ile uyumlu mu).

   KÜLLENME:
   - Hiçbir DB query yapmaz; eski sağlayıcı/external service'a bağlanmaz.
   - PII içermez; brand-agnostic.
   - Sadece GET; mutation yok.
   - Public erişilebilir ama hiçbir sensitive bilgi sızdırmaz.

   USAGE:
     curl https://your-domain/api/health
   =============================================================== */

/* Module-load anında dondurulan timestamp. Server-process lifecycle'ı
   boyunca aynı kalır; her request'te aynı string döner. */
const SERVER_START_TIME = new Date().toISOString();

export async function GET() {
  return NextResponse.json({
    ok: true,
    serverStartTime: SERVER_START_TIME,
    nodeVersion: process.version,
    nextVersion: process.env.npm_package_dependencies_next ?? null,
    now: new Date().toISOString(),
  });
}
