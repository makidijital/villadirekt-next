import "server-only";

import { createHash } from "node:crypto";

import {
  KTB_LICENSE_QUERY_HOST,
  buildKtbLicenseUrl,
} from "./ktb-document-number";

/* ===============================================================
   🛡️ KTB SORGU İSTEMCİSİ (server-only)
   ===============================================================
   Tek görev: normalize edilmiş belge numarası için resmi KTB sorgu
   sayfasını GÜVENLİ şekilde çekmek. Ayrıştırma YAPMAZ.

   GÜVENLİK:
     • URL sabit host + `URLSearchParams` ile kurulur (string birleştirme
       YOK); çağrıdan önce protokol/host tekrar doğrulanır.
     • `redirect: "manual"` — KTB dışına (veya herhangi bir yere)
       yönlendirme takip EDİLMEZ → CHECK_FAILED/redirect.
     • Yanıt boyutu sınırlı; yalnız HTML kabul edilir.
   DESEN: mevcut dış istekler (lib/exchange-rate.tcmb.ts,
     external-calendar.service.ts) — AbortController timeout,
     açık User-Agent, `cache: "no-store"`.

   SINIFLANDIRMA (asla INVALID/NOT_FOUND üretmez):
     timeout / ağ hatası / 5xx → retryable
     403 / 429               → tarama durdurulur (stopRun)
     diğer 4xx / 3xx / tür / boyut → yapısal hata
=============================================================== */

export const KTB_FETCH_TIMEOUT_MS = 15_000;
export const KTB_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "Mozilla/5.0 tatilinyeri-belge-kontrol/1.0";

export type KtbFetchOutcome =
  | { ok: true; httpStatus: number; body: string; sha256: string }
  | {
      ok: false;
      reason: string;
      httpStatus: number | null;
      retryable: boolean;
      stopRun: boolean;
      structural: boolean;
    };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function failure(
  reason: string,
  httpStatus: number | null,
  flags: { retryable?: boolean; stopRun?: boolean; structural?: boolean } = {}
): KtbFetchOutcome {
  return {
    ok: false,
    reason,
    httpStatus,
    retryable: !!flags.retryable,
    stopRun: !!flags.stopRun,
    structural: !!flags.structural,
  };
}

export async function fetchKtbLicensePage(
  normalizedDocumentNumber: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
): Promise<KtbFetchOutcome> {
  const url = buildKtbLicenseUrl(normalizedDocumentNumber);
  if (url.protocol !== "https:" || url.hostname !== KTB_LICENSE_QUERY_HOST) {
    return failure("invalid_target", null, { stopRun: true });
  }

  const fetchImpl: FetchLike = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? KTB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
      cache: "no-store",
      signal: ctrl.signal,
    });

    const status = res.status;
    if (status === 403) return failure("http_403", status, { stopRun: true });
    if (status === 429) return failure("http_429", status, { stopRun: true });
    if (status >= 500) return failure("http_5xx", status, { retryable: true });
    if (status >= 300 && status < 400) return failure("redirect", status, { structural: true });
    if (status !== 200) return failure(`http_${status}`, status, { structural: true });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) {
      return failure("unexpected_content_type", status, { structural: true });
    }
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > KTB_MAX_RESPONSE_BYTES) {
      return failure("response_too_large", status, { structural: true });
    }
    const body = await res.text();
    if (Buffer.byteLength(body, "utf8") > KTB_MAX_RESPONSE_BYTES) {
      return failure("response_too_large", status, { structural: true });
    }
    const sha256 = createHash("sha256").update(body).digest("hex");
    return { ok: true, httpStatus: status, body, sha256 };
  } catch (err) {
    const aborted =
      ctrl.signal.aborted ||
      (err instanceof Error && err.name === "AbortError");
    return failure(aborted ? "timeout" : "network_error", null, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}
