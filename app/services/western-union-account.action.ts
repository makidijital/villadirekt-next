"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getWesternUnionAccounts,
  createWesternUnionAccount,
  updateWesternUnionAccount,
  deleteWesternUnionAccount,
  setActiveWesternUnionAccount,
} from "@/app/services/western-union-account.service";

/* ===============================================================
   🛡️ WESTERN UNION ACCOUNT — SERVER ACTIONS (thin wrapper, Migration WU-B1)
   ===============================================================
   Client boundary temizliği: `western-union-account.service` (ileride native
   `server-only` repo'ya geçecek) client bundle'ına SIZMASIN. Tek client
   tüketicisi (settings/odeme/_components/WesternUnionAccountsCard.tsx) bu
   action'lara repoint edilir.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service'ten türetilir (Parameters/ReturnType → cast/any
     YOK, birebir). Single-active toggle ORCHESTRATION + Result envelope
     davranışı service'te AYNEN. Provider/repository/DB DEĞİŞMEDİ — yalnız
     çağrı sınırı server action'a taşındı (native repoint bu sprintte YOK).
   =============================================================== */

export async function getWesternUnionAccountsAction(
  ...args: Parameters<typeof getWesternUnionAccounts>
): ReturnType<typeof getWesternUnionAccounts> {
  await requirePermission(["payment_accounts", "settings"]);
  return getWesternUnionAccounts(...args);
}

export async function createWesternUnionAccountAction(
  ...args: Parameters<typeof createWesternUnionAccount>
): ReturnType<typeof createWesternUnionAccount> {
  await requirePermission(["payment_accounts", "settings"]);
  return createWesternUnionAccount(...args);
}

export async function updateWesternUnionAccountAction(
  ...args: Parameters<typeof updateWesternUnionAccount>
): ReturnType<typeof updateWesternUnionAccount> {
  await requirePermission(["payment_accounts", "settings"]);
  return updateWesternUnionAccount(...args);
}

export async function deleteWesternUnionAccountAction(
  ...args: Parameters<typeof deleteWesternUnionAccount>
): ReturnType<typeof deleteWesternUnionAccount> {
  await requirePermission(["payment_accounts", "settings"]);
  return deleteWesternUnionAccount(...args);
}

export async function setActiveWesternUnionAccountAction(
  ...args: Parameters<typeof setActiveWesternUnionAccount>
): ReturnType<typeof setActiveWesternUnionAccount> {
  await requirePermission(["payment_accounts", "settings"]);
  return setActiveWesternUnionAccount(...args);
}
