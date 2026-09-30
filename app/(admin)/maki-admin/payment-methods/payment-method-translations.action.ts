"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getPaymentMethodTranslations,
  upsertPaymentMethodTranslation,
  type PaymentMethodTranslationInput,
  type PaymentMethodTranslationsListResult,
  type PaymentMethodTranslationResult,
} from "@/app/services/payment-method-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ ÖDEME YÖNTEMİ ÇEVİRİ SERVER ACTION'LARI (migration 088)
   ===============================================================
   `app/(admin)/maki-admin/types/type-translations.action.ts` ve
   `menu/menu-translations.action.ts` ile BİREBİR AYNI desen.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth gerekmez.
   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ İnce wrapper — iş mantığı YOK. Mevcut `payment-method.action.ts`
   (canonical CRUD) DEĞİŞTİRİLMEDİ. Yeni bir yetki anahtarı EKLENMEDİ —
   ekran zaten `payment_methods` yetkisiyle korunuyor.
   =============================================================== */

export async function loadPaymentMethodTranslationsAction(
  paymentMethodId: string
): Promise<PaymentMethodTranslationsListResult> {
  await requirePermission("payment_methods");
  return getPaymentMethodTranslations(paymentMethodId);
}

export async function savePaymentMethodTranslationAction(
  input: PaymentMethodTranslationInput
): Promise<PaymentMethodTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "payment_methods"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  return upsertPaymentMethodTranslation(input);
}
