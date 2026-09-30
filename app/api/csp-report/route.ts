import { NextResponse } from "next/server";

/* ===============================================================
   🛡️ SEC-05 — CSP REPORT-ONLY İHLAL RAPOR UÇ NOKTASI
   ===============================================================
   `next.config.ts` içindeki `Content-Security-Policy-Report-Only`
   header'ının `report-uri /api/csp-report` hedefi. Tarayıcılar ihlal
   raporlarını buraya POST eder (hiçbir şey ENGELLENMEZ).

   GÜVENLİK / GİZLİLİK:
     - Yalnız POST; gövde en fazla 16 KB (fazlası okunmaz, loglanmaz).
     - DB YOK, dış servis YOK — yalnız sunucu log'una tek satır.
     - Loglanan alanlar KÜÇÜLTÜLÜR: yalnız direktif, engellenecek
       kaynağın ORIGIN'i (path/query atılır → olası kişisel veri/token
       loglanmaz) ve sayfa yolunun ilk segmenti (`/v/<token>` gibi
       token'lı yollar `/v/*` olarak maskelenir). Script örneği
       (`script-sample`) LOGLANMAZ.
     - Aynı (direktif, kaynak, sayfa) üçlüsü 10 dakikada bir kez
       loglanır (log taşmasını önler); bellek en fazla 500 anahtar.
     - Yanıt her durumda 204 (istemciye bilgi dönmez).
   =============================================================== */
import {
  MAX_BODY_BYTES,
  extractViolations,
  shouldLogCspViolation,
} from "@/lib/security/csp-report";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const len = Number(req.headers.get("content-length") || "0");
    if (len > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });
    const text = await req.text();
    if (!text || text.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }
    const violations = extractViolations(JSON.parse(text));
    const now = Date.now();
    for (const v of violations) {
      const key = `${v.directive}|${v.blocked}|${v.page}`;
      if (shouldLogCspViolation(key, now)) {
        console.warn(`[csp-report] ${JSON.stringify(v)}`);
      }
    }
  } catch {
    /* Bozuk/JSON olmayan gövde → sessizce yok say. */
  }
  return new NextResponse(null, { status: 204 });
}
