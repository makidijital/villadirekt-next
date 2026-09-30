import "server-only";

import { paymentAccountRepository } from "@/lib/db/payment-account.repository.server";
import type { PaymentAccount } from "@/lib/payment-account.helper";

/* ===============================================================
   🛡️ PAYMENT ACCOUNT — SERVER-ONLY READ HELPER
   ===============================================================
   Service-role client kullanan helper. Migration 034 sonrası
   `payment_accounts` tablosunda anon erişim sıfır (no policy);
   server-side mail flow'ları (bank transfer onayı) bu helper
   üzerinden service role ile aktif hesabı çeker.

   GÜVENLİK SINIRI:
     • `import "server-only"` direktifi — bu dosya CLIENT bundle'a
       sızarsa Next.js BUILD HATA verir. Defansif net guard.
     • Veri erişimi paymentAccountRepository (→ dbAdmin, service-role,
       service-role kimlik bilgisi) üzerinden — yalnız server runtime'da
       (Node/edge route handler). NEXT_PUBLIC_ prefix yok → client
       bundle'da expose YOK. (Phase 1 repo consolidation; davranış AYNEN.)

   CALLER:
     • app/api/mail/bank-transfer-payment/route.ts (server)

   NEDEN HELPER'DAN ÇIKARILDI:
     `lib/payment-account.helper.ts` hem types/pure utility (formatIban,
     paymentAccountDisplay) hem DB query barındırıyordu. Admin client
     component'leri pure utility'i import ediyor; aynı dosyaya
     dbAdmin eklemek bundle'a service-role import statement
     sokardı (declaration olarak; runtime'da çağrılmasa bile attack
     surface büyür). Split → client bundle helper'dan SADECE pure
     kısmı alır; server file ayrı çağrılır.

   GERIYE UYUMLULUK:
     `PaymentAccount` type'ı helper'dan re-import — caller'lar tip
     contract'ında değişim YOK.
   =============================================================== */

/* ---------------------------------------------
   🔥 GET ACTIVE PAYMENT ACCOUNT (server-side, service-role)
   - is_active = true olan ilk kaydı döner
   - hiç aktif hesap yoksa veya hata → null
   - RLS bypass: service role policy'leri görmez
---------------------------------------------- */
export async function getActivePaymentAccount(): Promise<PaymentAccount | null> {
  try {
    const { data, error, status } =
      await paymentAccountRepository.findActive();

    if (error) {
      console.error("[payment_account.server.getActive] FAILED", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        status,
      });
      return null;
    }

    if (!data) {
      console.warn("[payment_account.server.getActive] EMPTY", {
        status,
        hint: "Aktif hesap bulunamadı (payment_accounts.is_active=true kayıt yok).",
      });
      return null;
    }

    return data as PaymentAccount;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[payment_account.server.getActive] EXCEPTION:", msg);
    return null;
  }
}
