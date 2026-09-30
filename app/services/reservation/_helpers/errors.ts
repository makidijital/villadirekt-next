/* ===============================================================
   🛡️ FAZ 2 — RESERVATION ESKİ SAĞLAYICI ERROR MAPPING
   ===============================================================
   Eski `createReservation` INSERT catch bloğu (line 365-378)
   pattern'inin BYTE-IDENTICAL kopyası.

   EXCLUDE constraint violation (SQLSTATE 23P01) DB-level atomik
   garanti; concurrent iki INSERT'ten ikincisi bunu alır.
   DB client error.code olarak yansıtır; bazen `code` undefined
   gelir → message regex fallback.

   ⚠️ KESIN KURAL:
     - SQLSTATE "23P01" aynen.
     - Regex `/reservations_no_overlap/i` aynen.
     - throw new Error("Bu tarihler artık müsait değil") aynen.
     - Generic fallback: throw new Error(error.message) aynen.

   PATTERN:
     try {
       const { error } = await repository.insert(...);
       if (error) {
         console.error("❌ Create error:", error.message);
         mapInsertError(error);  // throws if known SQLSTATE
         throw new Error(error.message);
       }
     } ...
=============================================================== */

/** repository insert error → human-friendly TR throw. EXCLUDE
 *  constraint (23P01) durumunda "Bu tarihler artık müsait değil"
 *  throw eder. Diğer durumlarda caller generic throw'a düşer. */
export function mapInsertError(
  error: { code?: string; message?: string }
): void {
  if (
    error.code === "23P01" ||
    /reservations_no_overlap/i.test(error.message || "")
  ) {
    throw new Error("Bu tarihler artık müsait değil");
  }
}
