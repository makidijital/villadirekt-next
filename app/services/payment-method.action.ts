"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
} from "@/app/services/payment-method.service";

/* ===============================================================
   🛡️ PAYMENT METHOD — SERVER ACTIONS (thin wrapper, Migration PB1)
   ===============================================================
   Client boundary temizliği: `payment-method.service` (ileride native
   `server-only` repo'ya geçecek) client bundle'ına SIZMASIN. Tek client
   tüketicisi (payment-methods/page.tsx) bu action'lara repoint edilir.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service'ten türetilir (Parameters/ReturnType → cast/any
     YOK, birebir). throw-style davranış (error → throw) service'te AYNEN;
     server action sınırında Next hata serialize eder (client catch aynen).
     Provider/repository/DB DEĞİŞMEDİ — yalnız çağrı sınırı server action'a
     taşındı (native repoint bu sprintte YOK).
   =============================================================== */

export async function getPaymentMethodsAction(
  ...args: Parameters<typeof getPaymentMethods>
): ReturnType<typeof getPaymentMethods> {
  await requirePermission("payment_methods");
  return getPaymentMethods(...args);
}

export async function createPaymentMethodAction(
  ...args: Parameters<typeof createPaymentMethod>
): ReturnType<typeof createPaymentMethod> {
  await requirePermission("payment_methods");
  return createPaymentMethod(...args);
}

export async function deletePaymentMethodAction(
  ...args: Parameters<typeof deletePaymentMethod>
): ReturnType<typeof deletePaymentMethod> {
  await requirePermission("payment_methods");
  return deletePaymentMethod(...args);
}
