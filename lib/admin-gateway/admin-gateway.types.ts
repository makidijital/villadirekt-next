/* ===============================================================
   🛡️ FAZ 41 — ADMIN GATEWAY TYPES
   ===============================================================
   Privilege boundary için provider-agnostic shape'ler. Gateway
   tüketicileri eski sağlayıcıya özgü tip görmez.
   =============================================================== */

/** Audit-worthy admin action taxonomy. String literal union;
 *  yeni action eklenince burada genişler. */
export type AdminAuditAction =
  /* High priority */
  | "reservation.status_change"
  | "reservation.hard_delete"
  | "villa.hard_delete"
  | "villa.visibility_toggle"
  | "villa.private_token_generate"
  | "payment.confirm"
  | "payment.link_status_change"
  | "admin_user.create"
  | "admin_user.update"
  | "admin_user.delete"
  /* Medium priority */
  | "settings.update"
  | "homepage.reorder"
  | "homepage.toggle"
  | "homepage.add"
  | "homepage.remove"
  | "faq.replace_all"
  /* Low priority (gateway'e taşıma için hazır; audit YOK) */
  | "exchange_rate.refresh"
  | "external_calendar.deactivate"
  | "external_calendar.purge"
  | "external_calendar.sync"
  | "activity_log.cleanup"
  | "mail_log.cleanup";

/** Audit log entry — `admin_audit_logs` table row shape.
 *  before_data / after_data jsonb. */
export type AdminAuditEntry = {
  admin_user_id: string | null;
  action: AdminAuditAction | string;
  entity_type: string | null;
  entity_id: string | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
};

/** Gateway operation context — caller'dan gelen audit metadata.
 *  optional; en kötü ihtimal `admin_user_id` null log atılır. */
export type AdminGatewayContext = {
  adminUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};
