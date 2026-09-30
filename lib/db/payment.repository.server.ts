import "server-only";

/* ===============================================================
   🛡️ PAYMENT REPOSITORY — SERVER-ONLY (NATIVE, Migration P2)
   ===============================================================
   Anon `lib/db/payment.repository.ts` (dbNative) yerine native
   PostgreSQL karşılığı. Provider `dbAdminNative` (native pg, tek app rolü;
   RLS native'de yok, yetki app-katmanında — villa/settings/reservation
   server repo konvansiyonuyla aynı).

   ⚠️ `import "server-only"`: `pg` yalnız server. Client bundle'a sızarsa
     BUILD HATA.

   ⚠️ Payment domain 3 tablo: payment_methods / payment_accounts /
     western_union_accounts. Method'lar anon repo ile BYTE-IDENTICAL
     (SELECT/WHERE/ORDER/single/neq chain aynen); tek fark `db` → `dbAdmin`.
     Repository sessiz (throw/console YOK — anon paralel); Result envelope
     `{ data, error }` ham döner. Single-active toggle ORCHESTRATION
     (deactivateOther + setActive sırası) service tarafında kalır.

   ⚠️ RPC / embed / upsert / maybeSingle YOK (payment domain flat query).
   =============================================================== */

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

export const paymentServerRepository = {
  /* ===============================================================
     PAYMENT METHODS — READ (NATIVE twin, Migration P2)
     ===============================================================
     Anon `paymentRepository.findPaymentMethods` ile BYTE-IDENTICAL:
       SELECT * FROM payment_methods ORDER BY created_at DESC
     WHERE yok, LIMIT yok, embed yok. Return HAM `{ data, error }`
     (unwrap YOK; service throw-style handle eder). Row-tip generic
     (villa deseni) → consumer tip zinciri kırılmaz. Tek fark
     `db` (anon) → `dbAdmin` (native).
  =============================================================== */
  async findPaymentMethods() {
    return await dbAdmin
      .from<Record<string, unknown>>("payment_methods")
      .select("*")
      .order("created_at", { ascending: false });
  },

  /* ===============================================================
     PAYMENT METHODS — PUBLIC READ (NATIVE twin, Migration P16.5)
     ===============================================================
     Anon `paymentRepository.findPaymentMethodsPublic` ile BYTE-IDENTICAL:
       SELECT * FROM payment_methods
     ⚠️ ORDER YOK, WHERE YOK, LIMIT YOK, single YOK — admin varyantı
     `findPaymentMethods`'tan (order created_at desc VAR) FARKLI query;
     bu public varyant sırasız ham liste döndürür (public route
     `/api/public/payment-methods` GET → `{ ok, payment_methods }`).
     RLS: `payment_methods` read policy `using(true)` (migration 037)
     → koşulsuz; anon RLS-scoped okuma ile native RLS-free okuma AYNI
     satır/kolon → veri paritesi korunur. Return HAM `{ data, error }`.
     Row-tip generic (payment_method twin deseni). Tek fark
     `db` (anon) → `dbAdmin` (native).
  =============================================================== */
  async findPaymentMethodsPublic() {
    return await dbAdmin
      .from<Record<string, unknown>>("payment_methods")
      .select("*");
  },

  /* ===============================================================
     PAYMENT METHODS — INSERT (NATIVE twin, Migration P3)
     ===============================================================
     Anon `paymentRepository.insertPaymentMethod` ile BYTE-IDENTICAL:
       INSERT INTO payment_methods (payload)
     `.select()`/`.single()` chain YOK (service void; yalnız `error`
     okunur). Return HAM `{ data, error }`. Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async insertPaymentMethod(payload: Record<string, unknown>) {
    return await dbAdmin.from("payment_methods").insert(payload);
  },

  /* ===============================================================
     PAYMENT METHODS — UPDATE BY ID (NATIVE twin, Migration P3)
     ===============================================================
     Anon `paymentRepository.updatePaymentMethodById` ile BYTE-IDENTICAL:
       UPDATE payment_methods SET (payload) WHERE id = $1
     Predicate `.eq("id", id)` aynen; `.select()` chain YOK. Return HAM
     `{ data, error }`. Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async updatePaymentMethodById(
    id: string,
    payload: Record<string, unknown>
  ) {
    return await dbAdmin
      .from("payment_methods")
      .update(payload)
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT METHODS — DELETE BY ID (NATIVE twin, Migration P3)
     ===============================================================
     Anon `paymentRepository.deletePaymentMethodById` ile BYTE-IDENTICAL:
       DELETE FROM payment_methods WHERE id = $1
     Predicate aynen; cascade DB FK'ya bağlı. Return HAM `{ data, error }`.
     Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async deletePaymentMethodById(id: string) {
    return await dbAdmin
      .from("payment_methods")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — READ (NATIVE twin, Migration P5)
     ===============================================================
     Anon `paymentRepository.findPaymentAccounts` ile BYTE-IDENTICAL:
       SELECT * FROM payment_accounts
       ORDER BY is_active DESC, created_at DESC
     Order CHAIN aynen — primary `is_active` desc + secondary
     `created_at` desc. WHERE yok, LIMIT yok, embed yok. Return HAM
     `{ data, error, status }` (unwrap YOK). Service `status` field
     okuma + RLS silent-fail detection (count=0 → warn) service'te.
     Row-tip generic (payment_method twin deseni). Tek fark
     `db` (anon) → `dbAdmin` (native).
  =============================================================== */
  async findPaymentAccounts() {
    return await dbAdmin
      .from<Record<string, unknown>>("payment_accounts")
      .select("*")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — INSERT (NATIVE twin, Migration P5)
     ===============================================================
     Anon `paymentRepository.insertPaymentAccount` ile BYTE-IDENTICAL:
       INSERT INTO payment_accounts (payload)
       RETURNING * → single row
     `.select().single()` chain KORUNDU — service `createPaymentAccount`
     `data?.id` okur. Payload shape service'te (trim/IBAN/currency
     normalize) belirlenir; repository müdahil olmaz. Return HAM
     `{ data, error }`. Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async insertPaymentAccount(payload: Record<string, unknown>) {
    return await dbAdmin
      .from("payment_accounts")
      .insert(payload)
      .select()
      .single();
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — UPDATE BY ID (NATIVE twin, Migration P5)
     ===============================================================
     Anon `paymentRepository.updatePaymentAccountById` ile BYTE-IDENTICAL:
       UPDATE payment_accounts SET (payload) WHERE id = $1
     Predicate `.eq("id", id)` aynen; `.select()` chain YOK (service
     updated row beklemez — sadece error). Conditional payload build +
     single-active toggle ORCHESTRATION service'te. Return HAM
     `{ data, error }`. Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async updatePaymentAccountById(
    id: string,
    payload: Record<string, unknown>
  ) {
    return await dbAdmin
      .from("payment_accounts")
      .update(payload)
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — DELETE BY ID (NATIVE twin, Migration P5)
     ===============================================================
     Anon `paymentRepository.deletePaymentAccountById` ile BYTE-IDENTICAL:
       DELETE FROM payment_accounts WHERE id = $1
     Predicate aynen; hard delete, cascade YOK. Return HAM
     `{ data, error }`. Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async deletePaymentAccountById(id: string) {
    return await dbAdmin
      .from("payment_accounts")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — SET ACTIVE (NATIVE twin, Migration P5)
     ===============================================================
     Anon `paymentRepository.setPaymentAccountActive` ile BYTE-IDENTICAL:
       UPDATE payment_accounts SET is_active = true WHERE id = $1
     INLINE payload `{ is_active: true }` aynen; predicate `.eq("id", id)`
     aynen. Single-active orchestration step 1 — step 2
     (`deactivateOtherPaymentAccounts`) ayrı DB call; atomicity
     DEĞİŞTİRİLMEZ (race window orijinal). Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async setPaymentAccountActive(id: string) {
    return await dbAdmin
      .from("payment_accounts")
      .update({ is_active: true })
      .eq("id", id);
  },

  /* ===============================================================
     PAYMENT ACCOUNTS — DEACTIVATE OTHERS (NATIVE twin, Migration P5)
     ===============================================================
     Anon `paymentRepository.deactivateOtherPaymentAccounts` ile
     BYTE-IDENTICAL:
       UPDATE payment_accounts SET is_active = false WHERE id <> $1
     ⚠️ `.neq("id", keepId)` predicate AYNEN — "kendisi hariç tüm
     satırlar"ı pasifleştir (`<>` / NOT eq). INLINE payload
     `{ is_active: false }` aynen. Single-active orchestration step 2;
     AYRI QUERY (merge/transaction YOK — kullanıcı kuralı); atomicity
     yok (intentional, orijinal davranış). Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async deactivateOtherPaymentAccounts(keepId: string) {
    return await dbAdmin
      .from("payment_accounts")
      .update({ is_active: false })
      .neq("id", keepId);
  },

  /* ===============================================================
     WESTERN UNION ACCOUNTS — READ (NATIVE twin, Migration WU-P5)
     ===============================================================
     Anon `paymentRepository.findWesternUnionAccounts` ile BYTE-IDENTICAL:
       SELECT * FROM western_union_accounts
       ORDER BY is_active DESC, created_at DESC
     Order CHAIN aynen — primary `is_active` desc + secondary
     `created_at` desc. WHERE yok, LIMIT yok, embed yok. Return HAM
     `{ data, error }` (unwrap YOK; service error → `[]`). Row-tip
     generic (payment_account twin deseni). Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async findWesternUnionAccounts() {
    return await dbAdmin
      .from<Record<string, unknown>>("western_union_accounts")
      .select("*")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });
  },

  /* ===============================================================
     WESTERN UNION ACCOUNTS — INSERT (NATIVE twin, Migration WU-P5)
     ===============================================================
     Anon `paymentRepository.insertWesternUnionAccount` ile BYTE-IDENTICAL:
       INSERT INTO western_union_accounts (payload)
       RETURNING * → single row
     `.select().single()` chain KORUNDU — service `createWesternUnionAccount`
     `data?.id` okur. Payload shape service'te (trim normalize) belirlenir;
     repository müdahil olmaz. Return HAM `{ data, error }`. Tek fark
     `db` → `dbAdmin`.
  =============================================================== */
  async insertWesternUnionAccount(payload: Record<string, unknown>) {
    return await dbAdmin
      .from("western_union_accounts")
      .insert(payload)
      .select()
      .single();
  },

  /* ===============================================================
     WESTERN UNION ACCOUNTS — UPDATE BY ID (NATIVE twin, Migration WU-P5)
     ===============================================================
     Anon `paymentRepository.updateWesternUnionAccountById` ile
     BYTE-IDENTICAL:
       UPDATE western_union_accounts SET (payload) WHERE id = $1
     Predicate `.eq("id", id)` aynen; `.select()` chain YOK (service
     updated row beklemez — sadece error). Conditional payload build +
     single-active toggle ORCHESTRATION service'te. Return HAM
     `{ data, error }`. Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async updateWesternUnionAccountById(
    id: string,
    payload: Record<string, unknown>
  ) {
    return await dbAdmin
      .from("western_union_accounts")
      .update(payload)
      .eq("id", id);
  },

  /* ===============================================================
     WESTERN UNION ACCOUNTS — DELETE BY ID (NATIVE twin, Migration WU-P5)
     ===============================================================
     Anon `paymentRepository.deleteWesternUnionAccountById` ile
     BYTE-IDENTICAL:
       DELETE FROM western_union_accounts WHERE id = $1
     Predicate aynen; hard delete, cascade YOK. Return HAM
     `{ data, error }`. Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async deleteWesternUnionAccountById(id: string) {
    return await dbAdmin
      .from("western_union_accounts")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     WESTERN UNION ACCOUNTS — SET ACTIVE (NATIVE twin, Migration WU-P5)
     ===============================================================
     Anon `paymentRepository.setWesternUnionAccountActive` ile
     BYTE-IDENTICAL:
       UPDATE western_union_accounts SET is_active = true WHERE id = $1
     INLINE payload `{ is_active: true }` aynen; predicate `.eq("id", id)`
     aynen. Single-active orchestration step 1 — step 2
     (`deactivateOtherWesternUnionAccounts`) ayrı DB call; atomicity
     DEĞİŞTİRİLMEZ (race window orijinal). Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async setWesternUnionAccountActive(id: string) {
    return await dbAdmin
      .from("western_union_accounts")
      .update({ is_active: true })
      .eq("id", id);
  },

  /* ===============================================================
     WESTERN UNION ACCOUNTS — DEACTIVATE OTHERS (NATIVE twin, Migration WU-P5)
     ===============================================================
     Anon `paymentRepository.deactivateOtherWesternUnionAccounts` ile
     BYTE-IDENTICAL:
       UPDATE western_union_accounts SET is_active = false WHERE id <> $1
     ⚠️ `.neq("id", keepId)` predicate AYNEN — "kendisi hariç tüm
     satırlar"ı pasifleştir (`<>` / NOT eq). INLINE payload
     `{ is_active: false }` aynen. Single-active orchestration step 2;
     AYRI QUERY (merge/transaction YOK — kullanıcı kuralı); atomicity
     yok (intentional, orijinal davranış). Tek fark `db` → `dbAdmin`.
  =============================================================== */
  async deactivateOtherWesternUnionAccounts(keepId: string) {
    return await dbAdmin
      .from("western_union_accounts")
      .update({ is_active: false })
      .neq("id", keepId);
  },
};
