import { sharedFavoritesRepository } from "@/lib/db/shared-favorites.repository";

import { getVillasByIds, type VillaDTO } from "./villa.service";

/* ===============================================================
   🛡️ FAZ 37 — SHARED FAVORITES SERVICE
   ===============================================================
   Guest favorites sistemine "paylaşılabilir liste" katmanı.
   Mevcut localStorage-based favorites sistemi DOKUNULMADI — bu
   ek bir katman.

   AKIŞ:
     [User /favoriler → "Listeyi Paylaş"]
        → createSharedFavoritesList(localStorageIds)
        → DB INSERT (snapshot + token üretimi)
        → return token
        → client URL üret + clipboard.writeText
     [Receiver /favoriler/paylas/[token]]
        → getSharedFavoritesList(token)
        → DB SELECT (token=, expires_at null veya now()<expires_at)
        → villa_ids → getVillasByIds (visibility filter'lı)
        → return { token, created_at, villas }

   ÖZELLİKLER:
     - IMMUTABLE snapshot: paylaşıldıktan sonra orijinal localStorage
       değişse bile bu URL aynı listeyi gösterir
     - SEO yok: shared sayfalar noindex/nofollow
     - Realtime sync YOK: tek DB read (cache yok; her ziyaret fresh)
     - Visibility filter REUSE: silinmiş/pasif villa shared list'te de
       görünmez (mevcut public visibility kontratı ile parity)
     - Max 50 villa per list (DB constraint + app guard)
     - Token entropy: ~48 bit (12 hex char) — non-sensitive shareable
       content için yeterli; tahmin edilemez

   DOKUNULMAYAN:
     localStorage favorites hook (use-favorites), VillaCard,
     reservation engine, BookingSidebar, pricing, review system,
     AggregateRating, availability, private URL system, gallery,
     cache architecture (yeni cache wrapper yok; per-paylaşım veri),
     search algorithms, admin panel, sidebar permissions.
   =============================================================== */

const MAX_VILLA_IDS = 50;
const TOKEN_LENGTH = 12;
const TOKEN_RETRY_LIMIT = 2;

/* ---------------------------------------------------------------
   📐 TOKEN GENERATION
   ---------------------------------------------------------------
   crypto.randomUUID() → 32 hex char → ilk 12 alınır (~48 bit entropi).
   URL-safe alphanumeric (0-9a-f). FAZ 31 private_access_token ile
   aynı pattern — sadece uzunluk farklı (private 20, share 12).
*/
function generateShareToken(): string {
  return globalThis.crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, TOKEN_LENGTH);
}

/* ---------------------------------------------------------------
   📦 RESULT SHAPES (mevcut Result<T> pattern parity)
   --------------------------------------------------------------- */
export type CreateSharedListResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export type SharedListData = {
  token: string;
  created_at: string;
  expires_at: string | null;
  /** Snapshot anındaki villa.id sayısı (görünmez olsa bile). */
  snapshot_count: number;
  /** Şu an görünür (active + not-deleted) villa DTO listesi. */
  villas: VillaDTO[];
};

/* ===============================================================
   🛡️ CREATE — guest paylaşım snapshot'ı
   ===============================================================
   Validation:
     - villaIds array, non-empty, max 50
     - Defansif dedup + UUID-like string filter (tip narrowing zaten
       var ama trash injection korumalı)
   Token collision:
     DB unique constraint (23505) → 2 retry. ~48 bit entropi ile
     collision pratik olarak imkansız; retry yine de safety belt.
=============================================================== */
export async function createSharedFavoritesList(
  villaIds: string[]
): Promise<CreateSharedListResult> {
  if (!Array.isArray(villaIds) || villaIds.length === 0) {
    return { ok: false, error: "Listeniz boş; en az 1 villa seçmelisiniz." };
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

  /* Insert + retry on collision. */
  const attempt = async (): Promise<CreateSharedListResult | "COLLISION"> => {
    const token = generateShareToken();
    /* 🛡️ TTL — favori paylaşım linkleri geçici veridir: 7 gün sonra
       geçersiz (now() < expires_at getter'ı) + pg_cron cleanup (mig 057)
       satırı siler. shared_villa_lists (insert-time expires_at) deseniyle
       birebir aynı; created_at = now() olduğundan expires = created_at + 7g. */
    const expiresAtIso = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { error } = await sharedFavoritesRepository.create({
      token,
      villa_ids: cleaned,
      expires_at: expiresAtIso,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return "COLLISION";
      console.error("[sharedFavorites.create] FAILED", error.message);
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
   - expires_at varsa now() < expires_at zorunlu
   - villa_ids → getVillasByIds (mevcut visibility filter REUSE):
       is_active=true + deleted_at IS NULL → pasif/silinmiş otomatik düşer
   - villa count snapshot anındaki ID sayısı; villas dizisi şu an
     görünür olan subset (kullanıcıya transparency için)
=============================================================== */
export async function getSharedFavoritesList(
  token: string
): Promise<SharedListData | null> {
  if (typeof token !== "string" || token.trim().length === 0) return null;

  const { data, error } = await sharedFavoritesRepository.findByToken(token);

  if (error) {
    console.error("[sharedFavorites.get] FAILED", error.message);
    return null;
  }
  if (!data) return null;

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

  /* Visibility-filter'lı villa fetch. Yeni servis YOK; mevcut
     getVillasByIds (FAZ 36) reuse. */
  const villas = villaIds.length > 0 ? await getVillasByIds(villaIds) : [];

  /* Snapshot order preserve: getVillasByIds visibility filter +
     created_at DESC döner; share için ID dizisindeki orijinal sıra
     kullanıcı deneyimi için daha okunabilir. */
  const indexOf = new Map(villaIds.map((id, idx) => [id, idx]));
  const sorted = [...villas].sort((a, b) => {
    const ai = indexOf.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = indexOf.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  return {
    token: data.token,
    created_at: data.created_at,
    expires_at: data.expires_at,
    snapshot_count: villaIds.length,
    villas: sorted,
  };
}
