/* ===============================================================
   🔥 ADMIN FETCH — TEK MERKEZİ HELPER (FAZ 4 — NATIVE)
   ===============================================================
   Korunan admin API route'larına çağrı yapan admin UI kodu için ortak kapı.

   NATIVE AUTH:
     Access JWT httpOnly cookie'de → JS token'a erişemez; same-origin fetch
     cookie'yi OTOMATİK gönderir. Bearer header EKLENMEZ. Access süresi
     dolmuşsa (401) bir kez `/api/auth/refresh` denenir ve istek tekrarlanır.
     Server tarafı doğrulama: lib/admin-route-auth.ts → authorizeAdminCaller /
     authorizeAdminCallerFlex (native access cookie okur).

   Bu helper SADECE client component'lerde kullanılır.
   =============================================================== */

export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const doFetch = () => fetch(input, { ...init, credentials: "same-origin" });
  let res = await doFetch();
  if (res.status === 401) {
    // Access token süresi dolmuş olabilir → bir kez refresh + retry.
    const refreshed = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    });
    if (refreshed.ok) {
      res = await doFetch();
    }
  }
  return res;
}

/* ---------------------------------------------
   🔥 buildAdminUrlWithToken
   GET-and-open-new-tab (örn: window.open(voucher PDF)). Native modda
   new-tab GET aynı origin olduğundan httpOnly access cookie OTOMATİK gider
   → ?token GEREKMEZ (JS token'a erişemez). URL olduğu gibi döner.
   (Sentinel `null` dönüşü artık oluşmaz; imza geriye-uyumlu korunur.)
---------------------------------------------- */
export async function buildAdminUrlWithToken(
  url: string
): Promise<string | null> {
  return url;
}
