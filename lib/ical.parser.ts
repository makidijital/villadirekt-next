/* ===============================================================
   🛡️ FAZ 56B — iCal PARSER (pure, no IO)
   ===============================================================
   RFC 5545 VEVENT bloklarını normalize array'e çevirir.
   Bu modül NETWORK, DB, ENV'e DOKUNMAZ — saf string parsing.
   Test edilebilir + deterministik.

   KAPSAM:
     • Line unfolding (RFC 5545: leading space/tab = continuation)
     • CRLF / LF tolerans
     • VEVENT bloklarını yakala
     • Property: UID, DTSTART, DTEND, SUMMARY, DESCRIPTION, STATUS
     • Property parameter'ları (VALUE=DATE, TZID=...) ignore — değer
       kısmından date-only extract eder.
     • X-VILLAKIRALAMA-SOURCE: local → SKIP (sync loop koruması)
     • Escape sequence unescape: \\n, \\,, \\;, \\\\

   DATE NORMALİZE:
     Tüm tarihler "YYYY-MM-DD" string-safe extract. UTC drift YOK
     (Date.toISOString hiç çağrılmaz). VEVENT formatları:
       DTSTART:20260701              → "2026-07-01"
       DTSTART;VALUE=DATE:20260701   → "2026-07-01"
       DTSTART:20260701T100000Z      → "2026-07-01"  (T öncesi date)
       DTSTART;TZID=Europe/...:20260701T100000 → "2026-07-01"

   DTEND KURALI:
     EXCLUSIVE. Aynen end_date'e yazılır. Inclusive çevirme YOK.
     Sisteminizin half-open [start, end) semantiği ile birebir.

   ÇIKTI:
     ParseResult = {
       events: ParsedEvent[],
       skipped: number,   // local-source skip + invalid event sayısı
       totalSeen: number, // ham VEVENT sayısı
     }
=============================================================== */

export type ParsedEvent = {
  uid: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD (exclusive)
  summary: string | null;
  description: string | null;
  status: string | null;
  raw_ical: string;   // ham VEVENT (debug + audit)
};

export type ParseResult = {
  events: ParsedEvent[];
  skipped: number;
  totalSeen: number;
};

/* Sync loop marker — export endpoint (FAZ 56D) her VEVENT'e bunu
   ekleyecek; parser bu property'yi gören eventleri SKIP eder. */
const LOOP_MARKER_KEY = "X-VILLAKIRALAMA-SOURCE";
const LOOP_MARKER_VALUE = "local";

/* ---------- LINE UNFOLD ----------
   RFC 5545: bir satır başında boşluk veya tab varsa, önceki satırın
   devamıdır. Önce normalize CRLF → LF, sonra fold-merge. */
function unfoldLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/* ---------- PROPERTY SPLIT ----------
   "DTSTART;VALUE=DATE:20260701" → { name: "DTSTART", params: "VALUE=DATE",
                                     value: "20260701" }
   Property name case-insensitive; uppercase normalize. */
type RawProp = { name: string; params: string; value: string };

function splitProperty(line: string): RawProp | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx < 0) return null;
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const semiIdx = head.indexOf(";");
  if (semiIdx < 0) {
    return { name: head.toUpperCase(), params: "", value };
  }
  return {
    name: head.slice(0, semiIdx).toUpperCase(),
    params: head.slice(semiIdx + 1),
    value,
  };
}

/* ---------- DATE NORMALIZE ----------
   String-safe; herhangi bir Date() / toISOString çağrısı YOK. */
function normalizeIcalDate(value: string): string | null {
  if (!value) return null;
  /* T öncesi tarih kısmı; saatleri yok say (date-only normalize). */
  const datePart = value.split("T")[0].trim();
  /* Beklenen format: YYYYMMDD (8 char) veya YYYY-MM-DD. */
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(datePart);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;
  return null;
}

/* ---------- UNESCAPE ----------
   RFC 5545 SUMMARY/DESCRIPTION: \\n \\, \\; \\\\ */
function unescapeIcalText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/* ---------- VEVENT BLOCK EXTRACT ---------- */
function extractVEvents(unfolded: string[]): string[][] {
  const blocks: string[][] = [];
  let inEvent = false;
  let current: string[] = [];
  for (const line of unfolded) {
    const upper = line.toUpperCase().trim();
    if (upper === "BEGIN:VEVENT") {
      inEvent = true;
      current = [];
      continue;
    }
    if (upper === "END:VEVENT") {
      if (inEvent) blocks.push(current);
      inEvent = false;
      current = [];
      continue;
    }
    if (inEvent && line.length > 0) current.push(line);
  }
  return blocks;
}

/* ---------- PARSE SINGLE VEVENT ---------- */
function parseVEvent(block: string[]): {
  event: ParsedEvent | null;
  skip: "local-marker" | "missing-required" | "invalid-date" | null;
} {
  const props: Record<string, RawProp[]> = {};
  for (const line of block) {
    const p = splitProperty(line);
    if (!p) continue;
    if (!props[p.name]) props[p.name] = [];
    props[p.name].push(p);
  }

  /* Sync loop marker → SKIP. */
  const localMarker = props[LOOP_MARKER_KEY];
  if (
    Array.isArray(localMarker) &&
    localMarker.some(
      (p) => p.value.trim().toLowerCase() === LOOP_MARKER_VALUE
    )
  ) {
    return { event: null, skip: "local-marker" };
  }

  const uid = props.UID?.[0]?.value?.trim();
  const dtStart = props.DTSTART?.[0]?.value;
  const dtEnd = props.DTEND?.[0]?.value;
  if (!uid || !dtStart || !dtEnd) {
    return { event: null, skip: "missing-required" };
  }

  const start = normalizeIcalDate(dtStart);
  const end = normalizeIcalDate(dtEnd);
  if (!start || !end || start >= end) {
    /* half-open kuralı: start < end zorunlu (zero-night reddi). */
    return { event: null, skip: "invalid-date" };
  }

  const summary = props.SUMMARY?.[0]?.value;
  const description = props.DESCRIPTION?.[0]?.value;
  const status = props.STATUS?.[0]?.value;

  return {
    event: {
      uid,
      start_date: start,
      end_date: end,
      summary: summary ? unescapeIcalText(summary).trim() : null,
      description: description ? unescapeIcalText(description).trim() : null,
      status: status ? status.trim().toUpperCase() : null,
      raw_ical: "BEGIN:VEVENT\n" + block.join("\n") + "\nEND:VEVENT",
    },
    skip: null,
  };
}

/* ---------- PUBLIC API ---------- */
export function parseICS(raw: string): ParseResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return { events: [], skipped: 0, totalSeen: 0 };
  }
  const unfolded = unfoldLines(raw);
  const blocks = extractVEvents(unfolded);
  const events: ParsedEvent[] = [];
  let skipped = 0;
  for (const block of blocks) {
    const { event, skip } = parseVEvent(block);
    if (event) {
      events.push(event);
    } else if (skip) {
      skipped += 1;
    }
  }
  /* UID-bazlı dedupe — feed bazen aynı UID'yi tekrar gönderir.
     İlk görülen kayıt korunur (RFC 5545 idempotent guarantee). */
  const seen = new Set<string>();
  const deduped: ParsedEvent[] = [];
  for (const e of events) {
    if (seen.has(e.uid)) {
      skipped += 1;
      continue;
    }
    seen.add(e.uid);
    deduped.push(e);
  }
  return { events: deduped, skipped, totalSeen: blocks.length };
}
