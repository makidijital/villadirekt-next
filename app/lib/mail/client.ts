/* ===============================================================
   🔥 RESEND CLIENT (REST API üzerinden)
   ===============================================================
   - settings.resend_api_key dinamik kullanılır (hardcoded YOK)
   - settings.mail_from / mail_from_name dinamik
   - Resend REST endpoint: https://api.resend.com/emails
   - Production-grade, package-free integration
   - DEBUG: tüm checkpoint'ler [mail] prefix ile loglanır
   =============================================================== */

import type { Settings } from "@/app/services/settings.types";
import { settingsServerRepository } from "@/lib/db/settings.repository.server";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";

export type ResendPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string | string[];
};

export type ResendResult = {
  ok: boolean;
  id?: string;
  error?: string;
  /** Resend tarafından dönen tam yanıt (debug için) */
  raw?: any;
  /** HTTP status (varsa) */
  status?: number;
};

function maskKey(key?: string | null): string {
  if (!key) return "(yok)";
  if (key.length <= 8) return `${key.slice(0, 2)}***`;
  return `${key.slice(0, 6)}…${key.slice(-2)}`;
}

/* ---------------------------------------------
   📦 Settings'ten mail config çek
   - 🛡️ ENV ÖNCELİKLİ (secret leak hardening): RESEND_API_KEY env
     authoritative; DB değeri yalnız GEÇİCİ backward-compat fallback
     (env set edilene kadar). Amaç: resend_api_key DB'den kalkınca
     (null'lanınca) mail KESİNTİSİZ env'den çalışsın. mail_from /
     mail_from_name için de env-first; DB fallback compat.
   - getMailConfig SERVER-ONLY (tüm caller'lar mail pipeline / route).
---------------------------------------------- */
export async function getMailConfig(): Promise<{
  apiKey: string | null;
  from: string;
  fromName: string;
  /* 🔥 Firma logosu — settings.site_logo (Storage URL veya relative
     path; resolveAssetUrl ile public URL'e çevrilir). NULL → mail
     header logo bloğunu render ETMEZ, sadece firma adı gösterilir.
     ESKİ "M" placeholder avatarı KESİNLİKLE KULLANILMAZ. PDF voucher
     ile AYNI kaynak (data.ts > brandLogoUrl). */
  brandLogoUrl: string | null;
  source: { apiKey: "db" | "env" | "missing"; from: "db" | "env" | "default"; fromName: "db" | "env" | "default" };
  settings: Settings | null;
}> {
  /* 🛡️ SETTINGS READ — SERVER-ONLY, SERVICE-ROLE.
     Migration 042 settings_admin_only RLS sonrası, mail pipeline'ın
     route handler bağlamında çalıştığı anon DB client client'a JWT
     iliştirilmez → anon SELECT REDDEDİLİR (silent null). Server
     repository service-role ile okur (RLS bypass) → resend_api_key /
     mail_from / mail_from_name DB fallback'i yine çalışır. ENV-first
     pattern AŞAĞIDA AYNEN korunur. RLS policy'sine dokunulmadı. */
  const { data: settingsData, error: settingsError } =
    await settingsServerRepository.findSingleton();
  if (settingsError) {
    console.error("[mail] settings read FAILED", settingsError.message);
  }
  const settings = (settingsData as Settings) || null;

  const dbKey = (settings?.resend_api_key || "").trim();
  const envKey = (process.env.RESEND_API_KEY || "").trim();
  const apiKey = envKey || dbKey || null;
  const apiKeySource: "db" | "env" | "missing" = envKey
    ? "env"
    : dbKey
      ? "db"
      : "missing";

  const dbFrom = (settings?.mail_from || "").trim();
  const envFrom = (process.env.RESEND_FROM || "").trim();
  const from = envFrom || dbFrom || "no-reply@example.com";
  const fromSource: "db" | "env" | "default" = envFrom
    ? "env"
    : dbFrom
      ? "db"
      : "default";

  const dbName = (settings?.mail_from_name || "").trim();
  const envName = (process.env.RESEND_FROM_NAME || "").trim();
  const fromName = envName || dbName || "Maki Dijital";
  const fromNameSource: "db" | "env" | "default" = envName
    ? "env"
    : dbName
      ? "db"
      : "default";

  console.log("[mail] config loaded", {
    apiKeyPresent: !!apiKey,
    apiKeyPrefix: maskKey(apiKey),
    apiKeyLooksValid: !!apiKey && apiKey.startsWith("re_"),
    apiKeySource,
    from,
    fromSource,
    fromName,
    fromNameSource,
  });

  /* 🔥 site_logo'yu Storage public URL'e resolve et (FULL URL veya
     relative path için tek code path; Header/Footer/PDF voucher
     ile AYNI helper). Yoksa null. */
  /* 🛡️ `?v=settings.updated_at` — Header/Footer ile AYNI versiyon;
     logo sabit path'e overwrite edildiğinde mail istemcisi/proxy
     cache'i eski logoyu göstermesin. */
  const brandLogoUrl =
    resolveAssetUrlVersioned(settings?.site_logo, settings?.updated_at) || null;

  return {
    apiKey,
    from,
    fromName,
    brandLogoUrl,
    source: {
      apiKey: apiKeySource,
      from: fromSource,
      fromName: fromNameSource,
    },
    settings,
  };
}

/* ---------------------------------------------
   "Maki Dijital <rez@domain>" formatı
---------------------------------------------- */
export function formatFrom(name: string, address: string): string {
  const cleanName = (name || "").replace(/[<>]/g, "").trim();
  if (!cleanName) return address;
  return `${cleanName} <${address}>`;
}

/* ---------------------------------------------
   🔥 Resend REST send
---------------------------------------------- */
export async function resendSend(
  apiKey: string,
  payload: ResendPayload
): Promise<ResendResult> {
  if (!apiKey) {
    console.error("[mail] resend skipped — apiKey yok");
    return { ok: false, error: "Resend API key tanımlı değil" };
  }

  console.log("[mail] resend POST", {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    htmlBytes: (payload.html || "").length,
  });

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    console.error("[mail] resend network error", err?.message || err);
    return {
      ok: false,
      error: err?.message || "Resend network error",
    };
  }

  // Yanıtı text olarak okuyup JSON'a parse etmeye çalış (boş body olsa bile bilgi alalım).
  const rawText = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }

  console.log("[mail] resend response", {
    status: res.status,
    ok: res.ok,
    body: json ?? rawText.slice(0, 600),
  });

  if (!res.ok) {
    const errorMsg =
      json?.message ||
      json?.error ||
      (typeof rawText === "string" && rawText.length
        ? rawText.slice(0, 240)
        : null) ||
      `Resend HTTP ${res.status}`;

    return {
      ok: false,
      error: errorMsg,
      status: res.status,
      raw: json ?? rawText,
    };
  }

  return {
    ok: true,
    id: json?.id,
    status: res.status,
    raw: json,
  };
}
