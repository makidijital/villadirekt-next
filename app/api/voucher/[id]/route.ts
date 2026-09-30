import { NextResponse } from "next/server";
import { buildVoucherContent } from "@/app/lib/voucher/build";
import { authorizeAdminCallerFlex } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";

/* ===============================================================
   🔥 GET /api/voucher/[id]
   ===============================================================
   Confirmed rezervasyon için voucher HTML'ini render eder.
   Auth: ZORUNLU — admin oturumu doğrulanmadan PII expose edilmez.

   Auth modeli (authorizeAdminCallerFlex):
     1. Authorization: Bearer <access_token> header (programatik)
     2. ?token=<access_token> query parametresi (yeni-tab UX'i)

   Query params:
     ?print=1  → window.print() otomatik tetiklenir; tarayıcı
                 "Save as PDF" / "Print" diyaloğunu açar.
     ?token=…  → admin access_token (yeni-tab açma için)

   Token URL'de geçtiği için response header'larında:
     - Referrer-Policy: no-referrer  → URL hiçbir downstream isteğe
                                       sızmaz
     - Cache-Control: no-store        → ara cache'lere düşmez

   "PDF İndir" butonu admin tarafında lib/admin-fetch.buildAdminUrlWithToken
   ile token'ı ekleyerek window.open eder. Bu route token'ı
   doğrulayıp admin_users.is_active=true ise HTML render eder;
   aksi halde 401/403 plain-text döner.
   =============================================================== */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const print = url.searchParams.get("print") === "1";

  /* ---------- ADMIN AUTH ---------- */
  const auth = await authorizeAdminCallerFlex(req);
  if (!auth.ok) {
    console.error("[voucher.html.auth] FORBIDDEN", {
      reservationId: id,
      status: auth.status,
      error: auth.error,
    });
    return new NextResponse(
      `Yetkisiz erişim: ${auth.error}`,
      {
        status: auth.status,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  }

  /* 🛡️ Admin yetki (reservations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "reservations"))) {
    return new NextResponse(`Yetkisiz erişim: ${FORBIDDEN_MESSAGE}`, {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  console.info("[voucher.html.auth] ADMIN_VERIFIED", {
    callerId: auth.caller.id,
    reservationId: id,
  });

  const result = await buildVoucherContent(id);
  if (!result.ok) {
    console.error("[voucher.html] FAILED", {
      reservationId: id,
      status: result.status,
      error: result.error,
    });
    return new NextResponse(
      `Voucher görüntülenemedi: ${result.error}`,
      {
        status: result.status,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  }

  // 🔥 Print mode — sayfa load olduktan sonra otomatik print diyaloğu
  let html = result.html;
  if (print) {
    html = html.replace(
      "</body>",
      `<script>
        window.addEventListener("load", function () {
          setTimeout(function () { window.print(); }, 250);
        });
      </script></body>`
    );
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
