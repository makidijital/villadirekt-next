/* ===============================================================
   🛡️ ADMIN NOTIFICATION — TYPES
   ===============================================================
   Unified notification katmanı: tek event hem ephemeral preview
   (sağ üst) hem persistent kayıt (bell dropdown) olarak
   görülür. Aynı görsel dil, aynı API.
   =============================================================== */

export type NotificationSeverity = "success" | "error" | "info";

export type AdminNotification = {
  id: string;
  severity: NotificationSeverity;
  title: string;
  description?: string;
  /** ms epoch (Date.now()) */
  createdAt: number;
  /** null → unread; ms epoch → read at */
  readAt: number | null;
};

export type NotifyOptions = {
  /** Aynı id → mevcut bildirim güncellenir (same-action dedupe). */
  id?: string;
  description?: string;
  /** Ephemeral preview süresi (ms). variant'a göre default'ları
   *  override eder. */
  duration?: number;
  /** false → yalnız transient preview, persistent kayıt YOK.
   *  Default: success/error/info → true, loading → false. */
  persist?: boolean;
};

export type PromiseMessages<T> = {
  loading: string;
  success: string | ((data: T) => string);
  error: string | ((err: unknown) => string);
};

/* ---------------------------------------------
   🔥 Write API — call sites bu interface'i kullanır.
   Eski useToast() ile signature uyumlu (success/error/info/
   loading/dismiss/promise). Mevcut çağıran kodu minimum
   değişiklikle taşır.
---------------------------------------------- */
export type NotifyApi = {
  success: (title: string, options?: NotifyOptions) => string;
  error: (title: string, options?: NotifyOptions) => string;
  info: (title: string, options?: NotifyOptions) => string;
  loading: (title: string, options?: NotifyOptions) => string;
  dismiss: (id?: string) => void;
  promise: <T>(
    promise: Promise<T>,
    messages: PromiseMessages<T>,
    options?: NotifyOptions
  ) => Promise<T>;
};

/* ---------------------------------------------
   🔥 Read API — bell dropdown ve badge bu hook'u tüketir.
---------------------------------------------- */
export type NotificationCenterApi = {
  items: AdminNotification[];
  unreadCount: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
};

/* ---------------------------------------------
   🔥 Confirm API — destructive intent + güçlü onay.
   Native confirm() yerine premium ConfirmDialog'u
   imperative async fonksiyon olarak sunar. Tüm admin
   sisteminde tek visual language.
---------------------------------------------- */
export type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" → kırmızı CTA. Default → koyu CTA. */
  variant?: "danger" | "default";
};

export type ConfirmFn = (request: ConfirmRequest) => Promise<boolean>;
