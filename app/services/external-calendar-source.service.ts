import { externalCalendarSourceRepository } from "@/lib/db/external-calendar-source.repository";
import { externalCalendarEventRepository } from "@/lib/db/external-calendar-event.repository";
import { validateExternalUrlStatic } from "@/lib/security/ssrf";

/* ===============================================================
   🛡️ FAZ 56E — EXTERNAL CALENDAR SOURCE (admin CRUD)
   ===============================================================
   admin UI tarafından çağrılan basit CRUD wrapper'ı. Authenticated
   admin context'ten eski sağlayıcı client üzerinden okur/yazar (RLS
   policy authenticated full CRUD'a izin veriyor — migration 029).

   NOT — events YAZILMAZ:
     external_calendar_events tablosuna admin client'tan write
     YAPILMAZ. Yalnız sync pipeline (service-role) yazabilir.
     Bu service de events tablosuna sadece SELECT okur (event count
     metadata için).

   SOFT DELETE:
     "Sil" UI butonu hard delete DEĞİL — is_active=false set eder.
     Audit ve event geçmişi korunur. Yeniden aktive etmek için
     is_active=true toggle yeterli.
=============================================================== */

export type ExternalCalendarSource = {
  id: string;
  villa_id: string;
  source_name: string;
  source_type: string;
  ical_url: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_event_count: number | null;
  created_at: string;
  updated_at: string | null;
};

export type ExternalCalendarSourceResult =
  | { ok: true; row: ExternalCalendarSource }
  | { ok: false; error: string };

export type ExternalCalendarSourceListResult = {
  sources: ExternalCalendarSource[];
  /* event_count: aynı source_id'ye bağlı aktif event sayısı (UI). */
  eventCounts: Record<string, number>;
};

const MAX_URL_LEN = 2000;
const MAX_NAME_LEN = 80;

function sanitizeUrl(raw: string): string {
  return String(raw || "").trim();
}

function sanitizeName(raw: string): string {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

/* SSRF HARDENING — tek merkezi denylist validator (lib/security/ssrf).
   Mevcut http/https + URL-parse + uzunluk kontrolünü kapsar, üstüne
   internal/private/loopback/link-local hedef reddi ekler. Browser-safe
   sync validator: client form submit'inde anlık feedback. Server side
   fetchIcsBody ayrıca DNS lookup ile ikinci kat guard uygular
   (ssrf.server.ts). */
function isValidIcalUrl(url: string): { ok: boolean; error?: string } {
  if (!url) return { ok: false, error: "URL gerekli" };
  if (url.length > MAX_URL_LEN) return { ok: false, error: "URL çok uzun" };
  const res = validateExternalUrlStatic(url);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

/* ===============================================================
   LIST — villa için tüm source'lar + aktif event count
=============================================================== */
export async function listExternalCalendarSources(
  villaId: string
): Promise<ExternalCalendarSourceListResult> {
  if (!villaId) return { sources: [], eventCounts: {} };

  const { data, error } =
    await externalCalendarSourceRepository.findAllByVilla(villaId);

  if (error) {
    console.error(
      "[external-calendar-source.list] FAILED",
      error.message
    );
    return { sources: [], eventCounts: {} };
  }

  const sources = (data || []) as ExternalCalendarSource[];

  /* Event count per source (yalnız is_active=true) — UI metadata. */
  const eventCounts: Record<string, number> = {};
  if (sources.length > 0) {
    const { data: ev, error: evErr } =
      await externalCalendarEventRepository.findActiveSourceIdsByVilla(
        villaId
      );
    if (!evErr && Array.isArray(ev)) {
      for (const row of ev as Array<{ source_id: string | null }>) {
        if (row?.source_id) {
          eventCounts[row.source_id] = (eventCounts[row.source_id] || 0) + 1;
        }
      }
    }
  }

  return { sources, eventCounts };
}

/* ===============================================================
   CREATE
=============================================================== */
export type CreateExternalCalendarSourceInput = {
  villa_id: string;
  source_name: string;
  ical_url: string;
};

export async function createExternalCalendarSource(
  input: CreateExternalCalendarSourceInput
): Promise<ExternalCalendarSourceResult> {
  const villaId = String(input.villa_id || "").trim();
  if (!villaId) return { ok: false, error: "villa_id gerekli" };

  const name = sanitizeName(input.source_name);
  if (name.length < 1 || name.length > MAX_NAME_LEN) {
    return { ok: false, error: "Platform adı geçersiz" };
  }

  const url = sanitizeUrl(input.ical_url);
  const urlCheck = isValidIcalUrl(url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error || "URL hatası" };

  const { data, error } = await externalCalendarSourceRepository.insert({
    villa_id: villaId,
    source_name: name,
    source_type: "ical",
    ical_url: url,
    is_active: true,
  });

  if (error || !data) {
    /* UNIQUE (villa_id, source_name) constraint → 23505 */
    const msg = error?.message || "Kayıt oluşturulamadı";
    const isDup =
      typeof msg === "string" && /duplicate|unique|23505/i.test(msg);
    return {
      ok: false,
      error: isDup ? "Bu platform adı zaten kayıtlı" : msg,
    };
  }

  return { ok: true, row: data as ExternalCalendarSource };
}

/* ===============================================================
   TOGGLE ACTIVE / "SOFT DELETE"
   Hard delete YOK — is_active=false soft toggle. Yeniden aktive
   etmek için active=true.
=============================================================== */
export async function setExternalCalendarSourceActive(
  id: string,
  active: boolean
): Promise<ExternalCalendarSourceResult> {
  if (!id) return { ok: false, error: "id gerekli" };
  const { data, error } = await externalCalendarSourceRepository.updateById(
    id,
    {
      is_active: !!active,
      updated_at: new Date().toISOString(),
    }
  );
  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Güncelleme başarısız",
    };
  }
  return { ok: true, row: data as ExternalCalendarSource };
}

/* ===============================================================
   UPDATE URL — admin URL'i değiştirmek isterse
   (FAZ 56E baseline'da UI'da yok; placeholder olarak servis seviyesinde
   açıldı, sonraki polish'te kullanılabilir.)
=============================================================== */
export async function updateExternalCalendarSourceUrl(
  id: string,
  icalUrl: string
): Promise<ExternalCalendarSourceResult> {
  if (!id) return { ok: false, error: "id gerekli" };
  const url = sanitizeUrl(icalUrl);
  const check = isValidIcalUrl(url);
  if (!check.ok) return { ok: false, error: check.error || "URL hatası" };
  const { data, error } = await externalCalendarSourceRepository.updateById(
    id,
    {
      ical_url: url,
      updated_at: new Date().toISOString(),
    }
  );
  if (error || !data) {
    return { ok: false, error: error?.message || "Güncelleme başarısız" };
  }
  return { ok: true, row: data as ExternalCalendarSource };
}
