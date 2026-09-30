import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). rpc scalar
   (consume_villa_zip_token → uuid; rpc-metadata "scalar" → data=uuid|null,
   route `villaId as string` birebir) + single/insert + .or() (ISO
   timestamp + not.is.null) + uuid/timestamptz parity hazır. `consumeToken`
   temiz rpc çağrısı (manuel unwrap YOK — registry çözer). Method yüzeyi +
   dönüş şekli aynen. Runtime testi yeşil olmadan production'a deploy
   edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ VILLA ZIP LINKS — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `villa_zip_links` tablosu admin-only RLS (migration 043). Bu repo
   YALNIZ server (admin route'ları + public download route) tarafından
   service_role ile çağrılır → RLS bypass. `import "server-only"` ile
   client bundle'a sızması build-time engellenir.

   - create / listByVilla / revoke → admin route'ları (authorizeAdminCaller
     ile yetkilendirilmiş çağırır).
   - consumeToken → public download route; `consume_villa_zip_token` RPC'si
     (SECURITY DEFINER) ile token doğrula + atomik download_count++ +
     villa_id döndür (geçersiz/expired/revoked → null).
   =============================================================== */

export type VillaZipLinkRow = {
  id: string;
  villa_id: string;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  download_count: number;
  created_at: string;
  created_by: string | null;
};

export const villaZipRepository = {
  /** Yeni ZIP link satırı oluştur (admin). Token + expires_at caller'da
   *  hazırlanır (crypto random + süre). Inserted row döner. */
  async create(input: {
    villa_id: string;
    token: string;
    expires_at: string;
    created_by: string | null;
  }) {
    return await dbAdmin
      .from("villa_zip_links")
      .insert({
        villa_id: input.villa_id,
        token: input.token,
        expires_at: input.expires_at,
        created_by: input.created_by,
      })
      .select(
        "id, villa_id, token, expires_at, revoked_at, download_count, created_at, created_by"
      )
      .single();
  },

  /** Bir villanın AKTİF ZIP linkleri (admin listeleme; yeni→eski).
   *  🛡️ Yalnız aktif: revoked_at IS NULL + expires_at > now(). Expired
   *  ve revoked linkler listede GÖRÜNMEZ (hiçbir expired bilgi sızmaz).
   *  Fiziksel silme create anında cleanupStale ile yapılır; bu filtre
   *  görünürlük garantisi (lazy-delete ile aradaki ölü satırları gizler). */
  async listByVilla(villaId: string) {
    return await dbAdmin
      .from("villa_zip_links")
      .select(
        "id, villa_id, token, expires_at, revoked_at, download_count, created_at, created_by"
      )
      .eq("villa_id", villaId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
  },

  /** 🛡️ OPPORTUNISTIC PHYSICAL CLEANUP — bir villanın EXPIRED (expires_at
   *  <= now) VEYA REVOKED (revoked_at IS NOT NULL) linklerini DB'den
   *  FİZİKSEL SİLER. create anında tetiklenir (cron/worker YOK). Taze
   *  (aktif) satır filtreye GİRMEZ → asla silinmez. Yalnız villa_id
   *  scope'u (villa_id index'li); başka villayı etkilemez. Best-effort:
   *  caller hata durumunda link oluşturmayı bloklamaz. */
  async cleanupStale(villaId: string) {
    return await dbAdmin
      .from("villa_zip_links")
      .delete()
      .eq("villa_id", villaId)
      .or(
        `expires_at.lte.${new Date().toISOString()},revoked_at.not.is.null`
      );
  },

  /** 🛡️ GLOBAL OPPORTUNISTIC PHYSICAL CLEANUP — bounded.
   *  ===============================================================
   *  TÜM villa_zip_links tablosunda EXPIRED (expires_at <= now) VEYA
   *  REVOKED (revoked_at IS NOT NULL) satırları FİZİKSEL SİLER. AKTİF
   *  satırlar (revoked_at IS NULL AND expires_at > now) ASLA filtreye
   *  girmez → silinmez. Bounded LIMIT (default 200) → her çağrı küçük
   *  batch.
   *
   *  PATTERN — Postgres'in DELETE ... LIMIT yokluğunu güvenli emüle:
   *    1) SELECT id FROM villa_zip_links
   *         WHERE expires_at <= now() OR revoked_at IS NOT NULL
   *         LIMIT <limit>             ← expires_at indeksli (046)
   *    2) DELETE FROM villa_zip_links WHERE id IN (<ids>)  ← PK
   *
   *  RACE-SAFETY:
   *    • expires_at IMMUTABLE (insert sonrası değişmez).
   *    • revoked_at sadece NULL → NOT NULL geçişi (geri dönüş yok).
   *    Yani bir id "stale" olduktan sonra TEKRAR "active" olamaz →
   *    DELETE arası id zinciri yarış kaybedemez. Concurrent CREATE
   *    yeni id yaratır; o id ilk SELECT batch'inde olmadığından
   *    silinemez. Concurrent CONSUME (download) aktif satırı
   *    eşleştirir (revoked_at IS NULL AND expires_at > now), ki o
   *    satır zaten stale ID listesinde DEĞİL.
   *
   *  CALLER PATTERN — fire-and-forget, .catch(() => {}):
   *    villaZipRepository.purgeStaleGlobal(200).catch(() => {});
   *  Caller request lifecycle'ını bloklamaz.
   *  =============================================================== */
  async purgeStaleGlobal(
    limit = 200
  ): Promise<{ error: { message: string } | null; count: number }> {
    const admin = dbAdmin;
    const nowIso = new Date().toISOString();

    /* 1) Stale id'leri bounded olarak topla (expires_at indeksi destekler). */
    const { data, error: selErr } = await admin
      .from("villa_zip_links")
      .select("id")
      .or(`expires_at.lte.${nowIso},revoked_at.not.is.null`)
      .limit(limit);

    if (selErr) {
      return { error: selErr, count: 0 };
    }
    const rows = (data as Array<{ id: string }> | null) || [];
    if (rows.length === 0) {
      return { error: null, count: 0 };
    }
    const ids = rows.map((r) => r.id);

    /* 2) PK ile DELETE — id IN (...) → O(N) but N <= limit, indeks-supported. */
    const { error: delErr } = await admin
      .from("villa_zip_links")
      .delete()
      .in("id", ids);

    return { error: delErr ?? null, count: ids.length };
  },

  /** Soft revoke (admin) — revoked_at = now(). */
  async revoke(id: string) {
    return await dbAdmin
      .from("villa_zip_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
  },

  /** Token doğrula + atomik download_count++ → villa_id | null.
   *  Geçersiz/revoked/expired token → null (RPC içinde WHERE filtreli). */
  async consumeToken(token: string) {
    return await dbAdmin.rpc("consume_villa_zip_token", {
      p_token: token,
    });
  },
};
