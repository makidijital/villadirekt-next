/* ===============================================================
   🛡️ FAZ 55 — ACTIVITY LOG HELPER (pure, no IO)
   ===============================================================
   Audit trail için saf yardımcılar:
     • sanitizeForAudit(value)         — sensitive key masking
     • computeDiffSummary(before,after) — human-readable text[] diff
     • boundJsonSize(value, maxBytes)  — payload size cap

   Tüm fonksiyonlar deterministik + IO-free; test edilebilir.
   Caller (service-layer wrapper veya admin client) bu fonksiyonları
   data'yı DB'ye yazmadan ÖNCE çalıştırır.
=============================================================== */

/* ─────── MASKING ─────── */

/**
 * Sensitive key pattern — substring (case-insensitive) match.
 * Yeni bir credential field type eklenirse buraya eklenmeli.
 */
const SENSITIVE_KEY_PATTERN =
  /password|api[_-]?key|resend|secret|token|iban|payment_link|service_role/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 10;
const MAX_ARRAY_PREVIEW = 50;

/**
 * Recursive sanitizer: walks the value tree, replaces values of
 * sensitive keys with [REDACTED]. Hem object key'leri hem nested
 * dizi içindeki object key'leri tarar. Primitive valueleri olduğu
 * gibi bırakır. Depth limit + array limit ile patolojik input'tan
 * korunur.
 *
 * Davranış:
 *   - Plain object: key sensitive ise value [REDACTED], yoksa recurse
 *   - Array: ilk MAX_ARRAY_PREVIEW eleman maskelenip alınır; geri kalan
 *     "[+N more]" özetlenir
 *   - Date/Buffer/RegExp gibi non-plain object: toString() ile geçer
 *   - depth > MAX_DEPTH: "[depth-limit]"
 */
export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "bigint") return String(value);
  if (Array.isArray(value)) {
    const preview = value
      .slice(0, MAX_ARRAY_PREVIEW)
      .map((v) => sanitizeForAudit(v, depth + 1));
    if (value.length > MAX_ARRAY_PREVIEW) {
      preview.push(`[+${value.length - MAX_ARRAY_PREVIEW} more]`);
    }
    return preview;
  }
  if (t === "object") {
    /* Non-plain object guard (Date / RegExp / Buffer / Set / Map). */
    const proto = Object.getPrototypeOf(value as object);
    if (proto !== Object.prototype && proto !== null) {
      if (value instanceof Date) return value.toISOString();
      return String(value);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = v === null || v === undefined ? v : REDACTED;
      } else {
        out[k] = sanitizeForAudit(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

/* ─────── SIZE CAP ─────── */

/**
 * UTF-8 byte length yaklaşık (TextEncoder fallback) ile total JSON
 * boyutunu sınırla. Limit aşılırsa özet placeholder döner. 64 KB
 * default — Postgres jsonb için sağlıklı sınır.
 */
export function boundJsonSize(
  value: unknown,
  maxBytes = 64 * 1024
): unknown {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { __error: "stringify-failed" };
  }
  const encoder =
    typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const bytes = encoder
    ? encoder.encode(serialized).length
    : serialized.length; /* fallback: char count (lower bound) */
  if (bytes <= maxBytes) return value;
  /* Truncated özet — orijinal value JSON'a sığmıyor. */
  return {
    __truncated: true,
    __original_bytes: bytes,
    __max_bytes: maxBytes,
    __preview: serialized.slice(0, 2048) + "…",
  };
}

/* ─────── DIFF SUMMARY ─────── */

const SHOW_VALUE_MAX_LEN = 60;

function showValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") {
    const s = v.length > SHOW_VALUE_MAX_LEN
      ? v.slice(0, SHOW_VALUE_MAX_LEN) + "…"
      : v;
    return `"${s}"`;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length} öğe]`;
  if (typeof v === "object") return `{${Object.keys(v as object).length} alan}`;
  return String(v);
}

function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return false;
  }
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Top-level key karşılaştırma. Caller, sanitize edilmiş before/after
 * geçirir → SENSITIVE field'lar otomatik "[REDACTED] → [REDACTED]"
 * olarak görünür (değişip değişmediği bilinmez ama leak olmaz).
 *
 * Array değişiklikleri: "N öğe → M öğe" özetlenir.
 * Nested object: shallow equals → top-level key'de "değişti" not.
 *
 * Çıktı: text[] satırlar — DB direkt insert için hazır.
 */
export function computeDiffSummary(
  before: unknown,
  after: unknown
): string[] {
  const summary: string[] = [];

  /* CREATE: before yok → after'ı özetle */
  if (before === null || before === undefined) {
    if (after && typeof after === "object" && !Array.isArray(after)) {
      const keys = Object.keys(after as object);
      summary.push(`yeni kayıt (${keys.length} alan)`);
    } else {
      summary.push("yeni kayıt");
    }
    return summary;
  }

  /* DELETE: after yok → before'u özetle */
  if (after === null || after === undefined) {
    summary.push("kayıt silindi");
    return summary;
  }

  /* Tip uyuşmazlığı (beklenmez ama defansif) */
  if (typeof before !== "object" || typeof after !== "object") {
    summary.push(`${showValue(before)} → ${showValue(after)}`);
    return summary;
  }

  const beforeObj = before as Record<string, unknown>;
  const afterObj = after as Record<string, unknown>;
  const allKeys = new Set<string>([
    ...Object.keys(beforeObj),
    ...Object.keys(afterObj),
  ]);

  for (const key of allKeys) {
    /* Audit-internal alanları skip */
    if (key === "created_at" || key === "updated_at" || key === "modified_at") {
      continue;
    }
    const bv = beforeObj[key];
    const av = afterObj[key];
    if (jsonEquals(bv, av)) continue;
    summary.push(`${key}: ${showValue(bv)} → ${showValue(av)}`);
  }

  if (summary.length === 0) summary.push("değişiklik yok");
  return summary;
}

/* ─────── PUBLIC TYPES ─────── */

export type ActivityEntityType =
  | "villa"
  | "reservation"
  | "manual_reservation"
  | "review"
  | "page"
  | "settings"
  | "admin_user"
  | "exchange_rates"
  | "mail_logs"
  | "homepage_collection"
  | "menu"
  | "faq"
  | "offer_request"
  | "contact_message"
  /* FAZ 56B — external iCal sync entity (Airbnb/Booking/VRBO sync events) */
  | "external_calendar";

export type ActivityLogPayload = {
  action: string; // dot.case: "villa.update", "reservation.status_change"
  entity_type?: ActivityEntityType | null;
  entity_id?: string | null;
  entity_title?: string | null;
  before_data?: unknown;
  after_data?: unknown;
  /** Caller manuel diff geçmek isterse override; yoksa computeDiffSummary çağrılır. */
  diff_summary?: string[] | null;
  /** Operation triggered olan client route — opsiyonel. */
  route?: string | null;
};
