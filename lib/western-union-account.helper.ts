/* ===============================================================
   🔥 WESTERN UNION ACCOUNT HELPER — PURE TYPES
   ===============================================================
   Western Union ödeme alıcı bilgileri için tip katmanı.
   payment-account.helper.ts pattern'i: DB query YOK → client bundle
   güvenli (admin card component'i tipi import eder).

   "Aktif kayıt" mantığı service tarafında (single-active) tutulur;
   server-side okuma western-union-account.server.ts (service-role).
   =============================================================== */

export type WesternUnionAccount = {
  id: string;
  recipient_name: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  instructions: string | null;
  is_active: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};
