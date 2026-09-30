"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  setActivePaymentAccount,
} from "@/app/services/payment-account.service";

/* ===============================================================
   🛡️ PAYMENT ACCOUNT — SERVER ACTIONS (thin wrapper, Migration PA-B1)
   ===============================================================
   Client boundary temizliği: `payment-account.service` (ileride native
   `server-only` repo'ya geçecek) client bundle'ına SIZMASIN. İki client
   tüketicisi (settings/odeme/page.tsx + payment-accounts/page.tsx) bu
   action'lara repoint edilir.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service'ten türetilir (Parameters/ReturnType → cast/any
     YOK, birebir). Single-active toggle ORCHESTRATION + Result envelope
     davranışı service'te AYNEN. Provider/repository/DB DEĞİŞMEDİ — yalnız
     çağrı sınırı server action'a taşındı (native repoint bu sprintte YOK).
   =============================================================== */

export async function getPaymentAccountsAction(
  ...args: Parameters<typeof getPaymentAccounts>
): ReturnType<typeof getPaymentAccounts> {
  await requirePermission(["payment_accounts", "settings"]);
  return getPaymentAccounts(...args);
}

export async function createPaymentAccountAction(
  ...args: Parameters<typeof createPaymentAccount>
): ReturnType<typeof createPaymentAccount> {
  await requirePermission(["payment_accounts", "settings"]);
  return createPaymentAccount(...args);
}

export async function updatePaymentAccountAction(
  ...args: Parameters<typeof updatePaymentAccount>
): ReturnType<typeof updatePaymentAccount> {
  await requirePermission(["payment_accounts", "settings"]);
  return updatePaymentAccount(...args);
}

export async function deletePaymentAccountAction(
  ...args: Parameters<typeof deletePaymentAccount>
): ReturnType<typeof deletePaymentAccount> {
  await requirePermission(["payment_accounts", "settings"]);
  return deletePaymentAccount(...args);
}

export async function setActivePaymentAccountAction(
  ...args: Parameters<typeof setActivePaymentAccount>
): ReturnType<typeof setActivePaymentAccount> {
  await requirePermission(["payment_accounts", "settings"]);
  return setActivePaymentAccount(...args);
}
