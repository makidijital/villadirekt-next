/* ===============================================================
   🛡️ FAZ 38 — STORAGE PROVIDER TYPES
   ===============================================================
   Provider-agnostic shape'ler. R2 storage'a özgü hiçbir
   field yok; gelecekteki adapter'lar (R2/S3/Bunny) aynı kontratı
   uygular.
   =============================================================== */

/** Provider-agnostic upload options. native shape ile
 *  yapısal uyumlu: contentType + upsert + cacheControl.
 *  Yeni provider eklenirken alanlar geriye uyumlu genişletilir
 *  (örn. metadata, acl). */
export type StorageUploadOptions = {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
};

/** Bulk remove sonuç envelope'u. Mevcut StorageRemoveResult ile
 *  birebir aynı shape (re-export bağlamak yerine local tanım —
 *  cycle bağımlılığını minimal tutar). */
export type StorageRemoveResult = {
  /** En az 1 path başarısız olsa bile false. */
  ok: boolean;
  /** Hangi path'ler kalıcı fail oldu (orphan). */
  failed: string[];
  attempts: number;
};

/** Single upload sonuç envelope. Hatayı opaque message olarak
 *  yüzeye taşır; provider implementation kendi error objesini
 *  bu shape'e map eder. */
export type StorageUploadResult =
  | { ok: true }
  | { ok: false; error: string };
