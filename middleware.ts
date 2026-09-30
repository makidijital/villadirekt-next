import { NextResponse, type NextRequest } from "next/server";

import { verifyAccessToken } from "@/lib/auth/native/jwt";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/native/cookie-names";

/* ===============================================================
   🛡️ ADMIN MIDDLEWARE — NATIVE AUTH (FAZ 4)
   ===============================================================
   Korunan path: /maki-admin/:path*

   native auth (createServerClient / auth.getUser / session refresh) ve
   marker-cookie (admin-session) TAMAMEN KALDIRILDI. Tek gerçek middleware:
     • Native access JWT (jose, edge-safe) doğrulanır.
     • Access geçerli → geçir. Access süresi dolmuş ama refresh cookie var
       → geçir (downstream /api/auth/refresh yeniler). İkisi de yoksa login.
   Gerçek yetki (is_active + admin) her istekte server-side
   `authorizeAdminCaller/Session` içinde native jose verify + admin_users
   lookup ile doğrulanır; middleware yalnızca redirect kapısıdır.
   =============================================================== */

const LOGIN_PATH = "/maki-admin/login";
const HOME_PATH = "/maki-admin";

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const isLoginPath = pathname === LOGIN_PATH;

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const hasRefresh = !!req.cookies.get(REFRESH_COOKIE)?.value;

  let sessionOk = false;
  if (access) {
    const r = await verifyAccessToken(access);
    // access geçerli → OK; süresi dolmuş ama refresh var → yenilenebilir.
    sessionOk = r.ok || (!r.ok && r.reason === "expired" && hasRefresh);
  } else if (hasRefresh) {
    // access yok ama refresh var → downstream refresh eder.
    sessionOk = true;
  }

  // Login sayfasında ve oturum var → ana panele.
  if (isLoginPath && sessionOk) {
    const url = req.nextUrl.clone();
    url.pathname = HOME_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Korunan path ve oturum yok → login'e.
  if (!isLoginPath && !sessionOk) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: req });
}

export const config = {
  matcher: [
    /* Yalnız /maki-admin/* — public reservation flow, voucher, mail API,
       public sayfalar matcher DIŞINDA. */
    "/maki-admin/:path*",
  ],
};
