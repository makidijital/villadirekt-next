import { sharedVillaListRepository } from "@/lib/db/shared-villa-list.repository";

import {
  ALLOWED_EXPIRATIONS,
  DEFAULT_EXPIRATION_KEY,
  type ExpirationKey,
} from "./shared-villa-list.constants";
import { getVillasByIds, type VillaDTO } from "./villa.service";

/* ===============================================================
   🛡️ SHARED VILLA LISTS SERVICE — admin curator share
   ===============================================================
   Admin: müşteriye gönderilecek özel villa seçkisi katmanı.
   AKIŞ:
     [Admin /maki-admin/villa-listesi → filtre + curate + "Listeyi Paylaş"]
        → createSharedVillaList({ villaIds, searchParams?, title?, note? })
        → DB INSERT (snapshot + token üretimi)
        → return token
        → admin client URL üret + clipboard.writeText
     [Müşteri /liste/[token]]
        → getSharedVillaListByToken(token)
        → DB SELECT (token=, revoked_at IS NULL, expires_at null veya
          now() < expires_at)
        → villa_ids → getVillasByIds (visibility filter'lı)
        → return { token, created_at, villas, searchParams, title, note }

   ÖZELLİKLER:
     - IMMUTABLE villa subset snapshot — paylaşıldıktan sonra liste
       sabit; orijinal filtre sonucu değişse bile bu URL aynı villaları
       gösterir (admin yanlış villa eklerse: yeni link üretir).
     - search_params snapshot: public sayfa pricing context (date range
       ile total/gece/temizlik) için kullanır. Filter re-execute YAPILMAZ.
     - Soft revoke: admin yanlış link gönderdiyse `revoked_at` set ile
       müşteri 404 görür.
     - Visibility filter REUSE: silinmiş/pasif villa shared list'te de
       görünmez (021 shared_favorite_lists ile parity).
     - Max 50 villa per list (DB constraint + app guard).
     - Token entropy: ~48 bit (12 hex char) — non-sensitive shareable
       content için yeterli; tahmin edilemez.

   DOKUNULMAYAN:
     reservation engine, BookingSidebar, pricing engine (calculateGrandTotal),
     availability, currency conversion, review system, search algorithms
     (mevcut /arama page query'si bağımsız), private URL system,
     favorites share system (021 service ayrı kalır).
   =============================================================== */

const MAX_VILLA_IDS = 50;
const TOKEN_LENGTH = 12;
const TOKEN_RETRY_LIMIT = 2;

/* ---------------------------------------------------------------
   ⏰ LINK EXPIRATION — server-side allow-list
   ---------------------------------------------------------------
   Frontend opaque key gönderir ("1h" | "3h" | "6h" | "24h").
   Backend bu map ile gerçek saate çevirir. Raw saat değerini
   frontend GÖNDERMEZ — adversarial caller arbitrary süre
   yazmasın diye.

   ALLOWED_EXPIRATIONS değiştirilirse `ExpirationKey` type'ı da
   otomatik genişler; client tarafı yalnız bu key'leri kullanır.

   Default: "24h" (admin form initial). pg_cron migration 036
   her saat başı `expires_at < now()` kayıtlarını siler.
--------------------------------------------------------------- */
/* ALLOWED_EXPIRATIONS / ExpirationKey / DEFAULT_EXPIRATION_KEY client-safe
   modüle taşındı (./shared-villa-list.constants) — client bundle bu
   service'i (native repo/server-only) çekmesin diye. Değerler AYNEN;
   burada import edilip kullanılır. */

/* Allow-list aware coerce — bilinmeyen / null / undefined → default.
   Type-narrow değildir (raw string'i de kabul eder); caller
   tarafı zaten ExpirationKey send edebilir ama defansif. */
function resolveExpirationHours(key: unknown): number {
  if (typeof key === "string" && key in ALLOWED_EXPIRATIONS) {
    return ALLOWED_EXPIRATIONS[key as ExpirationKey];
  }
  return ALLOWED_EXPIRATIONS[DEFAULT_EXPIRATION_KEY];
}

/* ---------------------------------------------------------------
   📐 TOKEN GENERATION — shared-favorites ile aynı pattern
--------------------------------------------------------------- */
function generateShareToken(): string {
  return globalThis.crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, TOKEN_LENGTH);
}

/* ---------------------------------------------------------------
   📦 TYPES
--------------------------------------------------------------- */
export type SharedSearchParams = {
  /** Check-in YYYY-MM-DD — pricing context (public sayfa VillaCard
   *  calculateGrandTotal ile total hesaplar). */
  start?: string;
  /** Check-out YYYY-MM-DD. */
  end?: string;
  /** Kişi sayısı (snapshot için; filter re-execute YOK). */
  guests?: number;
  /** Filtre snapshot — UI'da "Antalya · 4 kişi · 11–15 May" özet için. */
  regions?: string[];
  categories?: string[];
};

export type CreateSharedVillaListInput = {
  villaIds: string[];
  searchParams?: SharedSearchParams;
  title?: string;
  note?: string;
  /* Link süresi key — frontend opaque label gönderir, backend
     ALLOWED_EXPIRATIONS map ile saate çevirir. Default "24h". */
  expirationKey?: ExpirationKey;
};

export type CreateSharedVillaListResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export type SharedVillaListData = {
  token: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  title: string | null;
  note: string | null;
  searchParams: SharedSearchParams | null;
  /** Snapshot anındaki villa.id sayısı (görünmez olsa bile). */
  snapshot_count: number;
  /** Şu an görünür (active + not-deleted) villa DTO listesi. */
  villas: VillaDTO[];
};

/* ===============================================================
   🛡️ CREATE — admin curator snapshot
   ===============================================================
   Validation:
     - villaIds array, non-empty, max 50
     - Defansif dedup + string filter
     - searchParams opsiyonel; null/undefined olabilir
     - title / note opsiyonel
   Token collision:
     DB unique constraint (23505) → 2 retry. ~48-bit entropy ile
     collision pratik olarak imkansız; retry yine de safety belt.
=============================================================== */
export async function createSharedVillaList(
  input: CreateSharedVillaListInput
): Promise<CreateSharedVillaListResult> {
  const { villaIds, searchParams, title, note, expirationKey } = input;

  /* Expiration — server-side allow-list enforce. Frontend ne
     gönderirse göndersin, ALLOWED_EXPIRATIONS dışındaki değerler
     default'a düşer (no arbitrary TTL). */
  const expirationHours = resolveExpirationHours(expirationKey);
  const expiresAtIso = new Date(
    Date.now() + expirationHours * 60 * 60 * 1000
  ).toISOString();

  if (!Array.isArray(villaIds) || villaIds.length === 0) {
    return {
      ok: false,
      error: "Liste boş; paylaşmadan önce en az 1 villa seçmelisiniz.",
    };
  }

  /* Defansif sanitize: yalnız string + non-empty entry; dedup. */
  const cleaned = Array.from(
    new Set(
      villaIds.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0
      )
    )
  );

  if (cleaned.length === 0) {
    return { ok: false, error: "Geçerli villa kimlikleri bulunamadı." };
  }
  if (cleaned.length > MAX_VILLA_IDS) {
    return {
      ok: false,
      error: `Liste en fazla ${MAX_VILLA_IDS} villa içerebilir.`,
    };
  }

  /* Search params snapshot — boş object yerine NULL yaz (storage temizliği). */
  const sp: SharedSearchParams | null = (() => {
    if (!searchParams) return null;
    const out: SharedSearchParams = {};
    if (searchParams.start) out.start = searchParams.start;
    if (searchParams.end) out.end = searchParams.end;
    if (typeof searchParams.guests === "number" && searchParams.guests > 0) {
      out.guests = searchParams.guests;
    }
    if (
      Array.isArray(searchParams.regions) &&
      searchParams.regions.length > 0
    ) {
      out.regions = searchParams.regions;
    }
    if (
      Array.isArray(searchParams.categories) &&
      searchParams.categories.length > 0
    ) {
      out.categories = searchParams.categories;
    }
    return Object.keys(out).length > 0 ? out : null;
  })();

  /* Insert + retry on collision. */
  const attempt = async (): Promise<CreateSharedVillaListResult | "COLLISION"> => {
    const token = generateShareToken();
    const { error } = await sharedVillaListRepository.create({
      token,
      villa_ids: cleaned,
      search_params: sp,
      title: title?.trim() || null,
      note: note?.trim() || null,
      expires_at: expiresAtIso,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return "COLLISION";
      console.error("[sharedVillaList.create] FAILED", error.message);
      return {
        ok: false,
        error: "Liste oluşturulamadı. Lütfen tekrar deneyin.",
      };
    }
    return { ok: true, token };
  };

  for (let i = 0; i <= TOKEN_RETRY_LIMIT; i++) {
    const res = await attempt();
    if (res === "COLLISION") continue;
    return res;
  }
  return {
    ok: false,
    error: "Liste oluşturulamadı (token çakışması).",
  };
}

/* ===============================================================
   🛡️ READ — token ile shared list snapshot'ını çek
   ===============================================================
   - Boş/whitespace token → null (defansif)
   - revoked_at IS NOT NULL → null (soft revoke)
   - expires_at varsa now() < expires_at zorunlu
   - villa_ids → getVillasByIds (mevcut visibility filter REUSE):
       is_active=true + deleted_at IS NULL → pasif/silinmiş otomatik düşer
   - villa count snapshot anındaki ID sayısı; villas dizisi şu an
     görünür olan subset (transparency için)
   - Sıralama: villa_ids dizisindeki orijinal order korunur (admin
     curate sırasına göre — UX için anlamlı)
=============================================================== */
export async function getSharedVillaListByToken(
  token: string
): Promise<SharedVillaListData | null> {
  if (typeof token !== "string" || token.trim().length === 0) return null;

  const { data, error } = await sharedVillaListRepository.findByToken(token);

  if (error) {
    console.error("[sharedVillaList.get] FAILED", error.message);
    return null;
  }
  if (!data) return null;

  /* Revoke guard */
  if (data.revoked_at) return null;

  /* Expiration guard */
  if (data.expires_at) {
    const expires = new Date(data.expires_at).getTime();
    if (Number.isFinite(expires) && Date.now() >= expires) {
      return null;
    }
  }

  /* Villa IDs defansif: array + string + non-empty */
  const villaIds = Array.isArray(data.villa_ids)
    ? data.villa_ids.filter(
        (x): x is string => typeof x === "string" && x.length > 0
      )
    : [];

  /* Visibility-filter'lı villa fetch. */
  const villas = villaIds.length > 0 ? await getVillasByIds(villaIds) : [];

  /* Snapshot order preserve. */
  const indexOf = new Map(villaIds.map((id, idx) => [id, idx]));
  const sorted = [...villas].sort((a, b) => {
    const ai = indexOf.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = indexOf.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  /* search_params defansif coerce. */
  const rawSp = data.search_params;
  const searchParams: SharedSearchParams | null =
    rawSp && typeof rawSp === "object" && !Array.isArray(rawSp)
      ? (rawSp as SharedSearchParams)
      : null;

  return {
    token: data.token,
    created_at: data.created_at,
    expires_at: data.expires_at,
    revoked_at: data.revoked_at,
    title: data.title ?? null,
    note: data.note ?? null,
    searchParams,
    snapshot_count: villaIds.length,
    villas: sorted,
  };
}
