/* 🛡️ Migration ST-P5A — anon `settings.repository` (dbNative)
   yerine native `settings.repository.server` (ST-P5 twin'leri: findSingleton +
   findPublicViaRpc + updateById). Call-site'lar aynı (settingsServerRepository
   → settingsRepository alias). Envelope + maybeSingle + RPC (get_public_settings
   whitelist) AYNEN. Service yalnız server-consumed (client taint yok → boundary-
   sever gerekmez). ⚠️ getSettings native (RLS-free) → voucher `site_logo` artık
   null yerine full row'dan gelir (RLS'in gizlediği logo görünür; secret voucher
   çıktısına ulaşmaz — yalnız site_logo okunur). */
import { settingsServerRepository as settingsRepository } from "@/lib/db/settings.repository.server";
/* 🛡️ PHASE 10L — EN/DE settings çevirileri (migration 083). Yalnız
   `multilingual_enabled` AÇIKKEN okunur; kapalıyken bu modül hiç
   çalıştırılmaz → TR davranışı ve sorgu sayısı BİREBİR aynı kalır. */
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { getPublicSettingsTranslations } from "./settings-translation.service";
import type { Settings } from "./settings.types";

/* ===============================================================
   🔥 SETTINGS — global site ayarları
   ===============================================================
   ⚠️ FAZ 6 S1 — `Settings` + `WatermarkPosition` tipleri client-safe
   `./settings.types` modülüne taşındı; burada import edilip kullanılır
   (tüm dış tip-tüketicileri de settings.types'tan alır). Şekiller AYNEN.
   =============================================================== */


/* ===============================================================
   🛡️ SAFE getSettings (Faz 2A)
   ===============================================================
   .single() boş tabloda PGRST116 (no rows) hatası fırlatır ve
   downstream'de Header/TopBar/BookingSidebar/Mail config pipeline'ı
   çöküyordu. .maybeSingle() boş tabloda { data: null } döner;
   davranış:
     - tablo BOŞSA → null (önceden: exception)
     - row mevcutsa → aynı Settings objesi (BYTE-IDENTICAL)
   Schema/UI değişmedi. Çağıran tüm yerler zaten `Settings | null`
   bekliyor, yeni davranış uyumlu.
   =============================================================== */
export async function getSettings(): Promise<Settings | null> {
  /* FAZ 40: settingsRepository delege; .maybeSingle resolver aynen.
     ⚠️ FULL row (resend_api_key DAHİL). YALNIZ server (mail
     getMailConfig) ve authenticated admin (settings edit) bağlamında
     kullanılmalı. Public/client için getPublicSettings() kullanın. */
  const { data, error } = await settingsRepository.findSingleton();

  if (error) {
    console.error("[settings.get] FAILED", error.message);
    return null;
  }

  return (data as Settings) || null;
}

/* ===============================================================
   🛡️ getPublicSettings — PUBLIC-SAFE (resend_api_key HARİÇ)
   ===============================================================
   Public/client component'ler (TopBar, ReservationForm,
   useBookingEngine) bunu kullanır. Repository public-safe kolon
   projeksiyonu döndürür → resend_api_key (ve mail_from*) browser
   response'una ASLA düşmez. Return tipi `Settings` (resend_api_key
   alanı undefined gelir; tüm public alanlar mevcut). Davranış
   getSettings ile aynı (maybeSingle, hata → null). */
export async function getPublicSettings(): Promise<Settings | null> {
  /* 🛡️ PHASE (migration 041/042): SECURITY DEFINER RPC `get_public_settings`.
     ESKİ: anon table-select (findPublicSingleton). 042 admin-only RLS sonrası
     anon table-select reddedilir → null → public site boşalırdı.
     YENİ: RPC (definer) güvenli kolon projeksiyonunu döndürür; resend_api_key
     ÇIKTIDA YOK. anon/server/authenticated her bağlamda + RLS sonrası çalışır.
     Return jsonb → Settings (safe subset). */
  const { data, error } = await settingsRepository.findPublicViaRpc();

  if (error) {
    console.error("[settings.getPublic] FAILED", error.message);
    return null;
  }

  const settings = (data as Settings) || null;

  /* ===============================================================
     🛡️ PHASE 10L §5 — EN/DE ÇEVİRİLERİNİ PAYLOAD'A EKLE
     ===============================================================
     NEDEN RPC DEĞİL, AYRI SORGU:
       `get_public_settings` (migration 081) SECURITY DEFINER bir
       KOLON WHITELIST'idir — `settings` satırının güvenli alt kümesini
       döndürür. Çeviriler AYRI bir tabloda (`settings_translations`,
       migration 083) ve 0..2 SATIR halinde durur; bunu whitelist'e
       sıkıştırmak RPC'yi (ve onun güvenlik sözleşmesini) yeniden
       yazmayı gerektirirdi. Bu yüzden RPC'ye DOKUNULMADI (§5/§14) ve
       çeviriler burada, dar bir okuma ile eklenir.

     NEDEN `multilingual_enabled` KAPIYA KOYULDU:
       Çoklu dil kapalıyken /en ve /de route'ları zaten
       `requirePublicLocaleEnabled()` ile 404 döner → çeviri okumak
       SAF İSRAF olurdu. `FooterWrapper` (Phase 10H) ile AYNI desen.
       Sonuç: bugünkü production davranışında (multilingual kapalı)
       EK SORGU YOK, dönen obje AYNI REFERANS → TR bit-bire aynı.

     GÜVENLİK: `settings_translations` tablosunda secret kolon YOKTUR
     (migration 083); dönen payload yalnız 4 doğal-dil alanı taşır.
     Okuma başarısız olursa public site ÇÖKMEZ — çeviri eklenmez,
     TR canonical'e düşülür. */
  if (!settings?.id || !isMultilingualEnabled(settings)) return settings;

  const translations = await getPublicSettingsTranslations(settings.id).catch(
    () => null
  );
  if (!translations) return settings;

  return { ...settings, translations };
}

/* ===============================================================
   🛡️ SAFE updateSettings — explicit boolean contract
   ===============================================================
   Return contract netleştirildi:
     - true  → update başarılı (DB'ye yazıldı)
     - false → settings tablosu boş veya eski sağlayıcı error
   Önceden `data` döndürüyordu; ancak eski sağlayıcı `.update().eq()`
   `.select()` zinciri olmadan başarılı durumda da `data: null`
   döner. Bu, çağıran tarafta "null ⇒ fail" yanılgısına yol
   açabiliyordu. Boolean contract bu belirsizliği kaldırır.

   Davranış:
     - getSettings() row yoksa → false
     - repository update error → false
     - row var ve update başarılı → true
   Yeni satır oluşturulmuyor (insert YOK); başlangıç row'unun
   var olduğu varsayımı önceki davranışla aynı.

   Çağıran taraflar:
     - handleSave: boolean check (true/false)
     - handleWatermarkSelect / handleLogoSelect: return değerini
       kullanmıyor (await fire-and-forget) → davranış AYNEN.
   =============================================================== */
export async function updateSettings(
  values: Partial<Settings>
): Promise<boolean> {
  const current = await getSettings();

  if (!current?.id) {
    console.error("[settings.update] NO_ROW — settings tablosu boş");
    return false;
  }

  /* FAZ 40: settingsRepository.updateById delege; predicate aynen. */
  const { error } = await settingsRepository.updateById(
    current.id,
    values
  );

  if (error) {
    console.error("[settings.update] FAILED", error.message);
    return false;
  }

  return true;
}
