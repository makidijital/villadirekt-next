/* ===============================================================
   🛡️ AUTH HARDENING (Fix 3) — SAME-ORIGIN GUARD (CSRF)
   ===============================================================
   `/api/auth/login` ve `/api/auth/logout` gibi cookie oturumu kuran/kapatan
   endpoint'ler için basit CSRF sertleştirmesi: `Origin` header'ının host'u
   istek `Host`'u ile eşleşmiyorsa reddedilir.

   ⚠️ DAVRANIŞ KORUMA:
     • Origin header'ı YOKSA reddedilmez → mevcut davranış korunur (bazı
       non-browser/programatik istekler Origin göndermez; tarayıcılar
       cross-site POST'larda Origin'i DAİMA gönderir → asıl saldırı vektörü
       kapanır). Bu, Next.js Server Action'larının Origin kontrolüyle
       aynı yaklaşımdır.
     • Same-origin istekler (adminFetch / native provider fetch) Origin'i
       kendi host'uyla gönderir → geçer.
   =============================================================== */

/** Origin header'ı Host ile aynı değilse false (reddet). Origin yoksa true. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // Origin yok → engelleme (davranış korunur).
  const host = req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // parse edilemeyen Origin → reddet.
  }
}
