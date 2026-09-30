import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). single()/
   maybeSingle()/PGRST116/json parity hazır; method yüzeyi + dönüş şekli
   aynen. Runtime testi yeşil olmadan production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ SETTINGS — SERVER-ONLY READ REPOSITORY (service-role)
   ===============================================================
   `settings` tablosu PHASE 4 (migration 042) sonrası admin-only RLS:
     `settings_admin_only` FOR ALL TO authenticated USING (is_active_admin())
   Anon erişim REDDEDİLİR; authenticated-non-admin REDDEDİLİR.

   Mail pipeline (`/app/lib/mail/client.ts > getMailConfig`) route
   handler bağlamında çalışır — anon DB client client (`@/lib/db`)
   sunucu fetch'lerine session cookie/JWT iliştirmez → RLS DENY →
   `findSingleton` `{ data: null, error: null }` döndürür. Sonuçta
   `apiKey = settings.resend_api_key || env || null`. ENV de yoksa
   `apiKey: null` → `sendMail` precheck "Resend API key yok" → mail
   HİÇ gönderilmez (silent fail; mail_logs status="failed").

   Bu repository, mail pipeline gibi server-only path'lerin settings
   row'unu RLS bypass ile (service-role) okuyabilmesi için sağlanır.
   Anon repository (`lib/db/settings.repository.ts`) admin browser
   client flow'ları (settings edit pages) için aynen kalır — orada
   browser session JWT taşır, `is_active_admin()` true → RLS allow.

   GÜVENLİK SINIRI (reservation.repository.server.ts /
   mail-log.repository.server / payment-account.server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → `dbAdmin` (service-role kimlik bilgisi,
       NEXT_PUBLIC_ prefix yok) → yalnız server runtime.

   DAVRANIŞ — BYTE-IDENTICAL anon repo `findSingleton()`:
     - `.from("settings").select("*").maybeSingle()` AST aynen.
     - Tek fark: `db` → `dbAdmin` (RLS bypass).
     - Return shape native `{ data, error }`. Repository
       sessiz; throw / console / log YOK. Caller (mail/client.ts)
       error → null fallback; başarı → FULL row (resend_api_key dahil).

   ⚠️ RLS POLİTİKASI DEĞİŞMEDİ:
     Migration 042'nin `settings_admin_only` policy'sine HİÇ
     dokunulmadı. Anon yine reddedilir; service-role yine bypass.
     Mevcut authenticated admin (browser) path'i de anon repo
     üzerinden çalışmaya devam eder.

   CALLER:
     • app/lib/mail/client.ts → getMailConfig (mail pipeline)
   =============================================================== */

export const settingsServerRepository = {
  /** Singleton settings row (FULL — `*`); server-only, service-role.
   *  Anon repo `findSingleton` ile BYTE-IDENTICAL — tek fark dbAdmin. */
  async findSingleton() {
    return await dbAdmin
      .from("settings")
      .select("*")
      .maybeSingle();
  },

  /** 🛡️ PHASE 10L — Singleton settings satırının YALNIZ `id` alanı.
   *  `settings_translations.settings_id` FK'sini çözmek için gerekir.
   *  `findZipNameFields` ile AYNI "slim projeksiyon" deseni: FULL row
   *  (`resend_api_key` DAHİL) okumamak için bilinçli olarak dar —
   *  çeviri okuma/yazma yolu secret'a HİÇ YAKLAŞMAZ.
   *  Mevcut method'ların hiçbiri DEĞİŞMEDİ; bu yalnız EK bir okuma. */
  async findSingletonId() {
    return await dbAdmin
      .from("settings")
      .select("id")
      .maybeSingle();
  },

  /** ZIP filename için slim projeksiyon (site_name, company_legal_name),
   *  .maybeSingle(). /api/villa-zip/[token] delege. BİREBİR select. */
  async findZipNameFields() {
    return await dbAdmin
      .from("settings")
      .select("site_name, company_legal_name")
      .maybeSingle();
  },

  /** Singleton settings row (FULL `*`) — `.single()` resolver. /api/admin/
   *  settings GET delege. ⚠️ `findSingleton`'dan FARKLI: `.single()`
   *  (maybeSingle DEĞİL) → satır yoksa error (PGRST116) → caller 500.
   *  Bu davranış BİREBİR korunmalı. */
  async findSingletonStrict() {
    return await dbAdmin
      .from("settings")
      .select("*")
      .single();
  },

  /** UPDATE by id — service-role (RLS bypass). Anon repo `updateById` ile
   *  BYTE-IDENTICAL (`.update(values).eq("id", id)`); tek fark dbAdmin →
   *  admin settings edit server action'ları (getSettingsAction/
   *  updateSettingsAction) RLS-gated browser JWT olmadan yazabilsin. RLS
   *  politikası (042 settings_admin_only) DEĞİŞMEDİ; service-role bypass
   *  eder. Return shape native `{ data, error }`; caller boolean'a çevirir. */
  async updateById(id: string, values: Record<string, unknown>) {
    return await dbAdmin
      .from("settings")
      .update(values)
      .eq("id", id);
  },

  /** Singleton settings row (PUBLIC-SAFE) — SECURITY DEFINER RPC
   *  `get_public_settings` (migration 041). Anon repo `findPublicViaRpc`
   *  ile BYTE-IDENTICAL; tek fark `db` → `dbAdmin`.
   *  ⚠️ RPC ÇAĞRISI KORUNUR — `SELECT *` DEĞİL: definer fonksiyon
   *  public-safe kolon whitelist'i döner (resend_api_key/mail_from* ÇIKTIDA
   *  YOK). Düz select'e çevrilirse native (RLS-free) secret sızdırır.
   *  Native provider RPC scalar davranışı (rpc-metadata: get_public_settings
   *  → "scalar", jsonb) → dönen jsonb obje (row yoksa null) `{ data, error }`
   *  içinde; anon `db.rpc` ile aynı envelope. */
  async findPublicViaRpc() {
    return await dbAdmin.rpc("get_public_settings");
  },
};
