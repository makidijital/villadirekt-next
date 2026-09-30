/* 🛡️ Payment Migration PB2 — anon payment.repository yerine native
   payment.repository.server (P2+P3 twin'leri: findPaymentMethods + insert/
   update/delete). Service PB1 sonrası hiçbir client tarafından runtime import
   edilmiyor → server-only native repo güvenli. PB1.5 tip köprüsü (`?? []`)
   native `Record[]|null` dönüşünü non-null array'e daraltır. Call-site'lar
   aynı (paymentServerRepository → paymentRepository alias). */
import { paymentServerRepository as paymentRepository } from "@/lib/db/payment.repository.server";
import type { PaymentMethodRow } from "@/types/database";

/* ===============================================================
   🛡️ FAZ 9 TS HARDENING — typed payloads
   ===============================================================
   `payload: any` → `Partial<PaymentMethodRow>` (insert için name
   zorunlu — caller'da var). DB tablo şeması types/database.ts'te
   hazır; runtime davranışı identical.

   FAZ 35 (repository extraction):
     Service artık eski sağlayıcıyı doğrudan tüketmez; DB I/O
     `paymentRepository.*` üzerinden delege edilir. Davranış
     BYTE-IDENTICAL — throw-style asimetrisi (payment-account
     ile fark) AYNEN korunur.
   =============================================================== */

/** Insert için minimum gerekli alan: name. Diğerleri opsiyonel. */
export type PaymentMethodInsert = Partial<PaymentMethodRow> & {
  name: string;
};

/** Update payload — tüm alanlar opsiyonel. */
export type PaymentMethodUpdate = Partial<PaymentMethodRow>;

// GET
export async function getPaymentMethods() {
  const { data, error } = await paymentRepository.findPaymentMethods();

  if (error) throw error;
  /* 🛡️ Migration PB1.5 — tip köprüsü: error-throw sonrası `data` daima
     array (list select: boş tablo → [], null yalnız error → yukarıda
     throw). `?? []` runtime-EŞDEĞER (null'a ulaşılmaz); return tipini
     non-null array'e daraltır → native repo `{data: Row[] | null}` PB2'de
     repoint edilince consumer `setState<any[]>` tip uyumsuzluğu olmaz. */
  return data ?? [];
}

// CREATE
export async function createPaymentMethod(
  payload: PaymentMethodInsert
): Promise<void> {
  const { error } = await paymentRepository.insertPaymentMethod(payload);

  if (error) throw error;
}

// UPDATE
export async function updatePaymentMethod(
  id: string,
  payload: PaymentMethodUpdate
): Promise<void> {
  const { error } = await paymentRepository.updatePaymentMethodById(
    id,
    payload
  );

  if (error) throw error;
}

// DELETE
export async function deletePaymentMethod(id: string) {
  const { error } = await paymentRepository.deletePaymentMethodById(id);

  if (error) throw error;
}