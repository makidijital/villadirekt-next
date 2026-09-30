/* 🛡️ Payment Migration P5A — anon `payment.repository` (dbNative)
   yerine native `payment.repository.server` (P5 twin'leri: 6 payment_account
   metodu). Service PA-B1 sonrası hiçbir client tarafından runtime import
   edilmiyor (yalnız server action + type-only) → server-only native repo
   güvenli. Call-site'lar aynı (paymentServerRepository → paymentRepository
   alias). Return contract / exception flow / single-active orchestration
   AYNEN. */
import { paymentServerRepository as paymentRepository } from "@/lib/db/payment.repository.server";
import type { PaymentAccount } from "@/lib/payment-account.helper";

/* ===============================================================
   🔥 PAYMENT ACCOUNT SERVICE — CRUD + active toggle (FAZ 35 delege)
   ===============================================================
   Tablo: payment_accounts
   Aktif hesap mantığı:
     - Aynı anda yalnızca BİR hesap is_active = true olur.
     - Bir hesap aktif edildiğinde diğerleri otomatik pasifleşir.

   FAZ 35 (repository extraction):
     Service artık eski sağlayıcıyı doğrudan tüketmez; DB I/O
     `paymentRepository.*` üzerinden delege edilir. Davranış
     BYTE-IDENTICAL:
       - `[payment_account.*]` log tag asimetrisi (payment-method
         ile fark) AYNEN.
       - Result envelope (`{ ok, id?, error? }`) AYNEN.
       - RLS silent-fail detection (count=0 → warn + hint) AYNEN.
       - Single-active toggle ORCHESTRATION service'te kalır
         (post-insert/update conditional `deactivateOthers`).
       - Atomicity DEĞIŞTİRİLMEZ (2-step race window orijinal).
       - Repository return shape native `{ data, error, status? }`;
         service `status`'u ham geçirerek RLS detection sürdürür.
   =============================================================== */

export type PaymentAccountInput = {
  bank_name: string;
  account_holder: string;
  iban: string;
  branch_name?: string | null;
  branch_code?: string | null;
  swift_code?: string | null;
  currency?: string | null;
  is_active?: boolean;
};

const trim = (v: unknown): string =>
  (v ?? "").toString().trim();

const cleanIban = (v: unknown): string =>
  trim(v).replace(/\s+/g, "").toUpperCase();

/* ----- LIST ----- */
export async function getPaymentAccounts(): Promise<PaymentAccount[]> {
  const { data, error, status } =
    await paymentRepository.findPaymentAccounts();

  if (error) {
    // 🔥 Structured error — code/details/hint birlikte
    console.error("[payment_account.list] FAILED", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      status,
    });
    return [];
  }

  // Boş sonuç teşhisi — hata yok ama kayıt da yok.
  if (!data || data.length === 0) {
    console.warn("[payment_account.list] EMPTY", {
      status,
      hint: "payment_accounts tablosunda kayıt bulunamadı.",
    });
  } else {
    console.info("[payment_account.list] OK", {
      count: data.length,
      status,
    });
  }

  return (data || []) as PaymentAccount[];
}

/* ----- CREATE ----- */
export async function createPaymentAccount(
  input: PaymentAccountInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const payload = {
    bank_name: trim(input.bank_name),
    account_holder: trim(input.account_holder),
    iban: cleanIban(input.iban),
    branch_name: trim(input.branch_name) || null,
    branch_code: trim(input.branch_code) || null,
    swift_code: trim(input.swift_code).toUpperCase() || null,
    currency: trim(input.currency).toUpperCase() || null,
    is_active: !!input.is_active,
  };

  const { data, error } =
    await paymentRepository.insertPaymentAccount(payload);

  if (error) {
    console.error("[payment_account.create] FAILED", error.message);
    return { ok: false, error: error.message };
  }

  // 🔥 SINGLE-ACTIVE: yeni kayıt aktifse diğerleri pasif olur
  if (payload.is_active && data?.id) {
    await deactivateOthers(data.id as string);
  }

  return { ok: true, id: data?.id as string };
}

/* ----- UPDATE ----- */
export async function updatePaymentAccount(
  id: string,
  input: Partial<PaymentAccountInput>
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };

  const payload: Record<string, unknown> = {};
  if (input.bank_name !== undefined)
    payload.bank_name = trim(input.bank_name);
  if (input.account_holder !== undefined)
    payload.account_holder = trim(input.account_holder);
  if (input.iban !== undefined) payload.iban = cleanIban(input.iban);
  if (input.branch_name !== undefined)
    payload.branch_name = trim(input.branch_name) || null;
  if (input.branch_code !== undefined)
    payload.branch_code = trim(input.branch_code) || null;
  if (input.swift_code !== undefined)
    payload.swift_code = trim(input.swift_code).toUpperCase() || null;
  if (input.currency !== undefined)
    payload.currency = trim(input.currency).toUpperCase() || null;
  if (input.is_active !== undefined)
    payload.is_active = !!input.is_active;

  const { error } = await paymentRepository.updatePaymentAccountById(
    id,
    payload
  );

  if (error) {
    console.error("[payment_account.update] FAILED", error.message);
    return { ok: false, error: error.message };
  }

  // 🔥 SINGLE-ACTIVE: aktif edildiyse diğerleri pasifleşir
  if (input.is_active === true) {
    await deactivateOthers(id);
  }

  return { ok: true };
}

/* ----- DELETE ----- */
export async function deletePaymentAccount(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };

  const { error } = await paymentRepository.deletePaymentAccountById(id);

  if (error) {
    console.error("[payment_account.delete] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* ----- SET ACTIVE ----- */
export async function setActivePaymentAccount(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };

  const { error: e1 } = await paymentRepository.setPaymentAccountActive(id);

  if (e1) {
    console.error("[payment_account.setActive] FAILED", e1.message);
    return { ok: false, error: e1.message };
  }

  const res = await deactivateOthers(id);
  if (res.error) {
    return { ok: false, error: res.error };
  }
  return { ok: true };
}

/* ----- INTERNAL: diğer hesapları pasifleştir -----
   FAZ 35: DB I/O `paymentRepository.deactivateOtherPaymentAccounts`
   üzerinden delege. Tag `[payment_account.deactivateOthers] FAILED`
   + Result envelope `{ error? }` AYNEN; ayrı query (transaction
   YOK) — atomicity orijinal davranış. */
async function deactivateOthers(
  keepId: string
): Promise<{ error?: string }> {
  const { error } =
    await paymentRepository.deactivateOtherPaymentAccounts(keepId);

  if (error) {
    console.error(
      "[payment_account.deactivateOthers] FAILED",
      error.message
    );
    return { error: error.message };
  }
  return {};
}
