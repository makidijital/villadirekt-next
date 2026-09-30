import SettingsTranslationsPage, {
  type SettingsTranslationCanonical,
} from "./SettingsTranslationsPage";

import { getPublicSettings } from "@/app/services/settings.service";
/* 🛡️ PHASE 10L — mevcut EN/DE çevirileri server-side okunur ve client
   island'a başlangıç state'i olarak verilir (ekstra bir client fetch
   turu YOK). Okuma başarısız olursa ekran boş çevirilerle açılır. */
import { getSettingsTranslations } from "@/app/services/settings-translation.service";
import type { SettingsTranslationsByLocale } from "@/lib/i18n/settings-translations.types";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";
import { adminPermissionGate } from "@/app/components/admin/AdminSectionGuard";

/* ===============================================================
   🛡️ ADMIN > SETTINGS > ÇEVİRİLER — server wrapper
   ===============================================================
   TR canonical değerler SERVER-SIDE okunur ve yalnız BU EKRANIN
   ihtiyaç duyduğu 9 doğal dil alanı client island'a geçirilir.

   🛡️ PHASE 10M — bakım mesajı ve adres canonical okumaları
   KALDIRILDI (11 → 9): bakım mesajı artık çevrilmiyor, adres bölümü
   de ekrandan çıkarıldı. HER İKİ CANONICAL SETTINGS ALANI DA YERİNDE
   DURUYOR — yalnız BU EKRAN onları okumuyor.

   NEDEN `getPublicSettings()` (ve `getSettings()` değil):
     `getSettings()` FULL row döner (`resend_api_key` DAHİL —
     bkz. settings.service.ts dosya içi uyarısı). Bu ekranın
     ihtiyaç duyduğu 9 alanın TAMAMI `get_public_settings` RPC
     whitelist'inde olduğundan public-safe okuma yeterlidir ve
     secret'ın render sınırına hiç yaklaşmaması sağlanır.

   NEDEN SERVER COMPONENT (diğer settings alt sayfaları client):
     Diğer sayfalar `getSettingsClient()` ile FULL row'u admin
     tarayıcısına indirir çünkü o satırı DÜZENLERLER. Bu ekran
     hiçbir şey düzenlemez — yalnız 9 alanı okur. Server-side okuma
     hem daha dar bir yüzey verir hem de mevcut save akışına
     (tek form + tek SaveButton + atomik PUT) hiç dokunmaz.

   🛡️ PHASE 10L — DB çeviri altyapısı (migration 083) bağlandı.
   Kayıt `./settings-translations.action.ts` üzerinden yapılır.
   `/api/admin/settings` PUT'una ve 7 settings alt sayfasının save
   akışına DOKUNULMADI.
   =============================================================== */

/** `null`/`undefined` → "" (client tarafında tek tip string sözleşmesi). */
function text(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function SettingsCevirilerPage() {
  /* 🛡️ SEC-01 — AUTH ÖNCE, VERİ SONRA (bkz. maki-admin/page.tsx). */
  const auth = await authorizeAdminSession();
  if (!auth.ok) return <AdminPageSessionRefresh />;

  /* 🛡️ Yetki ("settings") — VERİDEN ÖNCE. Bölüm layout'u sayfanın
     server render'ını durdurmadığı için kontrol burada da yapılır. */
  const denied = await adminPermissionGate(auth.caller.id, "settings");
  if (denied) return denied;

  const [settings, translationsResult] = await Promise.all([
    getPublicSettings().catch(() => null),
    getSettingsTranslations().catch(() => null),
  ]);

  const initialTranslations: SettingsTranslationsByLocale =
    translationsResult && translationsResult.ok
      ? translationsResult.translations
      : {};

  const canonical: SettingsTranslationCanonical = {
    footer_copyright: text(settings?.footer_copyright),
    default_meta_title: text(settings?.default_meta_title),
    default_meta_description: text(settings?.default_meta_description),
    hero_badge_text: text(settings?.hero_badge_text),
    hero_title: text(settings?.hero_title),
    hero_subtitle: text(settings?.hero_subtitle),
    hero_primary_cta_text: text(settings?.hero_primary_cta_text),
    hero_secondary_cta_text: text(settings?.hero_secondary_cta_text),
    business_hours: text(settings?.business_hours),
  };

  return (
    <SettingsTranslationsPage
      canonical={canonical}
      initialTranslations={initialTranslations}
    />
  );
}
