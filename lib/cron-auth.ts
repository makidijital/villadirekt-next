import "server-only";

/* ===============================================================
   🛡️ CRON AUTH GUARD — zamanlanmış görev Bearer secret doğrulama
   ===============================================================
   Zamanlanmış görev (Coolify Scheduled Task) her çağrıda
   `Authorization: Bearer <CRON_SECRET>` header'ı gönderir. Bu guard:
     • CRON_SECRET env eksik → 503 (fail-closed; production'da
       cron'un sessiz çalışıyor görünmesin)
     • Authorization header yok / yanlış → 401
     • Doğru → null (caller devam eder)

   ⚠️ ADMIN AUTH İLE KARIŞTIRMA YOK:
     Bu guard `authorizeAdminCaller` (eski sağlayıcı JWT + admin_users.
     is_active) ile İLGİSİZ. Cron route'ları admin route'larından
     izole; admin Bearer secret ile cron Bearer secret farklı namespace.
     Yanlışlıkla public access olmasın diye fail-closed default.

   ⚠️ SERVICE-ROLE LEAK YOK:
     Bu fonksiyon yalnız header check; downstream kullanılan
     `dbAdmin` zaten server-only ve service-role key
     `service-role kimlik bilgisi` (NEXT_PUBLIC_ prefix YOK) ile
     korunur. Cron route'lar sadece env CRON_SECRET'i doğrular,
     service-role key'i export etmez.
=============================================================== */

export function authorizeCronRequest(
  req: Request
):
  | { ok: true }
  | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim().length === 0) {
    /* Fail-closed: env eksik → reject. Aksi halde public bir
       endpoint olur ve herkes sync/refresh tetikleyebilir. */
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET tanımlı değil",
    };
  }

  const header = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (header !== expected) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
