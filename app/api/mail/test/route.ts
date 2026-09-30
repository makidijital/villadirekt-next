import { NextResponse } from "next/server";
import { sendMail } from "@/app/lib/mail/send";
import { applyRateLimit } from "@/lib/rate-limit";
import { renderTestEmail } from "@/app/lib/mail/templates/TestEmail";
import { getMailConfig } from "@/app/lib/mail/client";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";

/* ===============================================================
   🔥 POST /api/mail/test
   ===============================================================
   Body: { to: string }
   Response: { ok, id?, recipient?, subject?, error?, hint?, diagnostics? }
   Auth: Authorization: Bearer <admin access_token> ZORUNLU (Faz 4A).
   Bu route admin Settings sayfasından "Test mail gönder" akışında
   tetikleniyor; auth'suz olduğunda anonim kullanıcılar arbitrary
   alıcılara mail gönderebiliyordu (spam vector). Diğer admin mail
   route'larıyla simetrik authorizeAdminCaller koruması eklendi;
   yetkili admin için response shape ve davranış byte-identical.
   =============================================================== */

function detectSandboxIssue(
  error: string | undefined,
  fromAddress: string,
  toAddress: string
): string | null {
  if (!error) return null;
  const e = error.toLowerCase();

  // Resend sandbox: onboarding@resend.dev sadece doğrulanmış maile gönderilebilir.
  if (
    /testing emails|verify a domain|own email address|domain.*not.*verified/i.test(
      error
    )
  ) {
    if (fromAddress.includes("onboarding@resend.dev")) {
      return `Resend sandbox kısıtlaması: "onboarding@resend.dev" sadece Resend hesabınıza kayıtlı email adresine gönderim yapabilir. Çözüm: Resend dashboard'da bir domain doğrulayın veya alıcı olarak Resend hesabınızdaki adresi kullanın.`;
    }
    return `Resend domain doğrulama gerekli: "${fromAddress}" gönderimi için Resend dashboard'da domain'in DNS doğrulaması yapılmalı.`;
  }

  if (e.includes("invalid") && e.includes("api key")) {
    return `API key geçersiz. Resend dashboard'dan yeni bir key alın ve "re_" ile başladığından emin olun.`;
  }

  if (e.includes("unauthorized")) {
    return `Yetkisiz: API key yanlış veya silinmiş olabilir. Resend dashboard'dan kontrol edin.`;
  }

  return null;
}

export async function POST(req: Request) {
  /* Rate limit: 5 req/dakika/IP — mail spam koruması. */
  const limited = await applyRateLimit(req, "mail");
  if (limited) return limited;

  console.log("[mail.test] POST /api/mail/test");

  try {
    /* ---------- ADMIN AUTH (Faz 4A) ----------
       Diğer admin mail route'larıyla aynı pattern; başarısız
       auth → early return, hiçbir Mail config çekme veya
       gönderim yapılmaz. */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[mail.test.auth] UNAUTHORIZED", {
        status: auth.status,
        error: auth.error,
      });
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    /* 🛡️ Admin yetki (["settings", "system_logs"]) — izin yoksa 403; hiçbir veri
       okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
    if (!(await callerHasPermission(auth.caller.id, ["settings", "system_logs"]))) {
      return NextResponse.json(
        { ok: false, error: FORBIDDEN_MESSAGE },
        { status: 403 }
      );
    }
    console.info("[mail.test.auth] ADMIN_VERIFIED", {
      callerId: auth.caller.id,
    });

    const body = await req.json().catch(() => ({}));
    const to = (body?.to || "").toString().trim();

    if (!to) {
      console.warn("[mail.test] alıcı boş");
      return NextResponse.json(
        { ok: false, error: "Alıcı e-posta zorunlu" },
        { status: 400 }
      );
    }

    const cfg = await getMailConfig();

    const diagnostics = {
      apiKeyPresent: !!cfg.apiKey,
      apiKeyLooksValid: !!cfg.apiKey && cfg.apiKey.startsWith("re_"),
      apiKeySource: cfg.source.apiKey,
      from: cfg.from,
      fromSource: cfg.source.from,
      fromName: cfg.fromName,
      fromNameSource: cfg.source.fromName,
    };

    console.log("[mail.test] diagnostics", diagnostics);

    if (!cfg.apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Resend API key tanımlı değil. Ayarlar → Mail Ayarları'ndan ekleyin.",
          diagnostics,
        },
        { status: 400 }
      );
    }

    const brand = cfg.fromName || "Maki Dijital";
    const { subject, html } = renderTestEmail({
      recipient: to,
      brandName: brand,
      brandLogoUrl: cfg.brandLogoUrl,
    });

    const result = await sendMail({
      to,
      subject,
      html,
      mailType: "test",
    });

    if (!result.ok) {
      const hint = detectSandboxIssue(result.error, cfg.from, to);
      console.error("[mail.test] FAILED", {
        error: result.error,
        status: result.status,
        hint,
      });
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Gönderilemedi",
          status: result.status,
          hint,
          diagnostics,
        },
        { status: 502 }
      );
    }

    console.log("[mail.test] SENT", {
      id: result.id,
      recipient: result.recipient,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      recipient: result.recipient,
      subject: result.subject,
      diagnostics,
    });
  } catch (err: any) {
    console.error("[mail.test] EXCEPTION", err?.message || err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
}
