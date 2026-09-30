import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 2 — anon repo) — importer zinciri KANITLI
   client-safe (ShortGapsSection RSC + public sayfalar; hiçbir "use
   client" yok). rpc get_short_gap_counts → rpc-metadata "table" (satır
   dizisi, eski sağlayıcı parity) + düz okuma; write/embed/jsonb yok →
   provider değişmedi. `server-only` defansif sınır. Dönüş şekli aynen. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ SHORT GAPS REPOSITORY (anon / public)
   ===============================================================
   Kısa süreli tarih fırsatları (short-gap) domain'inin read-side
   I/O'su. Anasayfa `ShortGapsSection` (server component) ve
   `/kisa-sureli-tarihler` sayfası bu repo üzerinden okur.

   ⚠️ AUTH PATH:
     `db` = dbNative (anon). `get_short_gap_counts` public
     homepage aggregate RPC'sidir (villa count DISTINCT; PII yok,
     user-scope yok) → anon `db.rpc` ile çağrılır. Service-role GEREKMEZ.
     Refresh (`refresh_villa_short_gaps`, cron) service-role'dür ve
     `.server` sibling'ında yaşar (bu dosya değil).

   DAVRANIŞ:
     - Native eski sağlayıcı `{ data, error }` döner; repo sessiz. Grouping /
       null-fallback caller'da (component). RPC adı + arg'lar BİREBİR.
   =============================================================== */

export const shortGapsRepository = {
  /** Anasayfa kısa-gap sayıları — `get_short_gap_counts` (arg YOK).
   *  DISTINCT villa count per bucket_month × gap_nights. */
  async getShortGapCounts() {
    return await db.rpc("get_short_gap_counts");
  },

  /** Boşluk seti — bucket_month + gap_nights filtreli, gap_start ASC.
   *  /kisa-sureli-tarihler/[ay]/[gece] sayfası (villa_short_gaps precompute
   *  tablosu; anon public_read). Select + filters + order BİREBİR. */
  async findGapsByMonthNights(bucketMonth: string, nights: number) {
    return await db
      .from("villa_short_gaps")
      .select("villa_id, gap_start, gap_end")
      .eq("bucket_month", bucketMonth)
      .eq("gap_nights", nights)
      .order("gap_start", { ascending: true });
  },
};
