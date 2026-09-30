/* ===============================================================
   🛡️ SEC-05 — CSP rapor ayrıştırma / maskeleme yardımcıları
   ===============================================================
   `app/api/csp-report/route.ts` tarafından kullanılır (route dosyası
   yalnız Next'in izin verdiği export'ları içerebildiği için ayrı).
   =============================================================== */
export const MAX_BODY_BYTES = 16 * 1024;
const DEDUPE_MS = 10 * 60 * 1000;
const MAX_KEYS = 500;
const LOCALES = new Set(["tr", "en", "de"]);
const seen = new Map<string, number>();

export type CspViolation = {
  directive: string;
  blocked: string;
  page: string;
};

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Engellenecek kaynağı origin'e indirger; URL değilse anahtar kelime. */
export function summarizeBlocked(raw: string): string {
  const v = raw.trim();
  if (!v) return "unknown";
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    return u.protocol.replace(/:$/, ""); // data / blob / chrome-extension …
  } catch {
    return v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "unknown";
  }
}

/** Sayfa yolunu maskeler: locale öneki + ilk segment, geri kalanı `*`. */
export function summarizePage(raw: string): string {
  let pathname = "";
  try {
    pathname = new URL(raw, "http://x").pathname;
  } catch {
    return "/";
  }
  const segs = pathname.split("/").filter(Boolean);
  const out: string[] = [];
  if (segs[0] && LOCALES.has(segs[0])) out.push(segs.shift() as string);
  if (segs.length) out.push(segs.shift() as string);
  if (segs.length) out.push("*");
  return (
    "/" +
    out
      .map((s) =>
        s === "*" ? s : s.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40)
      )
      .join("/")
  );
}

/** Hem `application/csp-report` hem Reporting API (`reports+json`) formatı. */
export function extractViolations(payload: unknown): CspViolation[] {
  const items: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    for (const r of payload.slice(0, 20)) {
      const body = (r as { body?: unknown })?.body;
      if (body && typeof body === "object") items.push(body as Record<string, unknown>);
    }
  } else if (payload && typeof payload === "object") {
    const rep = (payload as Record<string, unknown>)["csp-report"];
    if (rep && typeof rep === "object") items.push(rep as Record<string, unknown>);
  }
  return items.map((b) => ({
    directive:
      str(b["effective-directive"] ?? b["effectiveDirective"], 40) ||
      str(b["violated-directive"], 40).split(" ")[0] ||
      "unknown",
    blocked: summarizeBlocked(str(b["blocked-uri"] ?? b["blockedURL"], 500)),
    page: summarizePage(str(b["document-uri"] ?? b["documentURL"], 500)),
  }));
}

export function shouldLogCspViolation(key: string, now: number): boolean {
  const last = seen.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) return false;
  if (seen.size >= MAX_KEYS) seen.clear();
  seen.set(key, now);
  return true;
}

/** Yalnız testler için: dedupe belleğini sıfırlar. */
export function __resetCspReportDedupeForTests(): void {
  seen.clear();
}
