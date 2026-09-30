import "server-only";

import { westernUnionAccountRepository } from "@/lib/db/western-union-account.repository.server";
import type { WesternUnionAccount } from "@/lib/western-union-account.helper";

/* ===============================================================
   🛡️ WESTERN UNION ACCOUNT — SERVER-ONLY READ HELPER
   ===============================================================
   payment-account.server.ts (getActivePaymentAccount) ile BİREBİR
   aynı pattern. western_union_accounts tablosunda anon erişim yok
   (migration 060 RLS); server-side mail akışı (western-union-payment
   route) bu helper ile service-role kullanarak aktif kaydı çeker.

   GÜVENLİK:
     • `import "server-only"` — client bundle'a sızarsa build HATA.
     • Veri erişimi westernUnionAccountRepository (→ dbAdmin, service-role,
       service-role kimlik bilgisi) üzerinden → yalnız server runtime; RLS
       bypass. (Phase 1 repo consolidation; davranış AYNEN.)

   CALLER:
     • app/api/mail/western-union-payment/route.ts
   =============================================================== */
export async function getActiveWesternUnionAccount(): Promise<WesternUnionAccount | null> {
  try {
    const { data, error, status } =
      await westernUnionAccountRepository.findActive();

    if (error) {
      console.error("[western_union.server.getActive] FAILED", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        status,
      });
      return null;
    }

    if (!data) {
      console.warn("[western_union.server.getActive] EMPTY", {
        status,
        hint: "Aktif WU kaydı yok (western_union_accounts.is_active=true yok).",
      });
      return null;
    }

    return data as WesternUnionAccount;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[western_union.server.getActive] EXCEPTION:", msg);
    return null;
  }
}
