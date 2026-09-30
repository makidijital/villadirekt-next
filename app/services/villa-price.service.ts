/* 🛡️ Villa Migration S7C3 — anon villa.repository yerine native
   villa.repository.server. findVillaPrices (S7C2b byte-identical twin) +
   rpcReplaceVillaPrices (S7C2 imza-uyumlu, client? opsiyonel/ignore) ikisi
   de native. Bu service yalnız server (public detay RSC + pricing/villa-edit
   action) → server-only native repo import'u güvenli. Method isimleri aynı. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";

// 🔥 DATE FORMAT
const formatDate = (date: Date) => {
  return date.toLocaleDateString("sv-SE");
};

// 📦 GET
export async function getVillaPrices(
  villaId: string
) {

  /* FAZ 37: DB I/O villaAdminRepository.findVillaPrices delege.
     SELECT + order chain repo içinde aynen. */
  const { data, error } =
    await villaAdminRepository.findVillaPrices(villaId);

  if (error) {
    console.error(
      "getVillaPrices:",
      error.message
    );

    return [];
  }

  return data || [];
}

// 💾 SET
// 🛡️ ATOMIC REPLACE-ALL: db/migrations/002_atomic_replace_helpers.sql
// içindeki replace_villa_prices(uuid, jsonb) fonksiyonu DELETE+INSERT'i
// tek transaction'da çalıştırır. INSERT fail olursa DELETE rollback olur,
// villa_prices boş kalmaz → reservation pricing fallback path tetiklenmez.
// Aynı villa için concurrent admin replace operasyonları
// pg_advisory_xact_lock ile serileştirilir.
// Replace-all semantic'i (eski rows silinir, yeni payload yazılır) AYNEN.
export async function setVillaPrices(
  villaId: string,

  prices: {
    start_date: string | Date;
    end_date: string | Date;

    price: number;

    currency?: string;
  }[]
) {

  // RPC payload'ı hazırla — villa_id RPC parametresi olarak ayrı geçer.
  const payload = prices.map((p) => ({
    start_date:
      p.start_date instanceof Date
        ? formatDate(p.start_date)
        : p.start_date,

    end_date:
      p.end_date instanceof Date
        ? formatDate(p.end_date)
        : p.end_date,

    price: p.price,

    currency:
      p.currency || "TRY",
  }));

  /* FAZ 37: RPC delegation; parameter shape ({ p_villa_id, p_prices })
     AYNEN repo içinde. pg_advisory_xact_lock DB-level concurrent
     admin replace serileştirir — değiştirilmez. Date format
     ("sv-SE") + currency fallback ("TRY") service edge'de aynen. */
  const { error } = await villaAdminRepository.rpcReplaceVillaPrices(
    villaId,
    payload
  );

  if (error) {
    console.error(
      "setVillaPrices:",
      error.message
    );
  }
}