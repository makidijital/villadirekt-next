"use client";

/* ===============================================================
   🛡️ ADMIN NOTIFICATION — PROVIDER
   ===============================================================
   Tek source-of-truth.
   - Context: Write API (useNotify) + Read API (useNotificationCenter)
   - Persistence: localStorage (cross-tab sync, refresh-safe).
     Provider abstract; ileride DB swap edilebilir, çağıran kod
     değişmez.
   - Ephemeral preview: sağ üst, 4-6s auto-dismiss
   - Persistent kayıt: bell dropdown'da listelenir, read/unread
   - Promise lifecycle: loading (transient) → success/error
     (persistent), aynı id altında.
   - SSR-safe: "use client"; window/localStorage erişimleri
     useEffect içinde.
   =============================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import type {
  AdminNotification,
  ConfirmFn,
  ConfirmRequest,
  NotificationCenterApi,
  NotificationSeverity,
  NotifyApi,
  NotifyOptions,
  PromiseMessages,
} from "./types";

import { NotificationPreview } from "./NotificationPreview";
import { ConfirmDialog } from "./ConfirmDialog";

/* ---------------------------------------------
   🔧 STORAGE
---------------------------------------------- */
const STORAGE_KEY = "maki:admin:notifications:v1";
const MAX_PERSISTED = 100;

type StorageShape = {
  version: 1;
  items: AdminNotification[];
};

function loadFromStorage(): AdminNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StorageShape;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items))
      return [];
    return parsed.items.slice(-MAX_PERSISTED);
  } catch {
    return [];
  }
}

function saveToStorage(items: AdminNotification[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = items.slice(-MAX_PERSISTED);
    const payload: StorageShape = { version: 1, items: trimmed };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exhausted veya storage disabled — sessizce geç. */
  }
}

/* ---------------------------------------------
   🔧 PREVIEW QUEUE
   Persistent items'tan farklı; sadece "şu anda görünür" olanlar.
---------------------------------------------- */
const MAX_PREVIEW = 3;
const DURATION_DEFAULT = 4000;
const DURATION_ERROR = 6000;
const DURATION_LOADING = 30_000; // failsafe

type PreviewEntry = {
  id: string;
  severity: NotificationSeverity | "loading";
  title: string;
  description?: string;
  duration: number;
};

/* ---------------------------------------------
   🔧 CONFIRM STATE
   Imperative ConfirmDialog: tek global instance Provider'da
   render edilir; her confirm() çağrısı promise döndürür.
---------------------------------------------- */
type ConfirmInternal = ConfirmRequest & {
  id: string;
  resolve: (ok: boolean) => void;
};

/* ---------------------------------------------
   🔧 CONTEXT
---------------------------------------------- */
type ProviderApi = NotifyApi & NotificationCenterApi & {
  previews: PreviewEntry[];
  dismissPreview: (id: string) => void;
  confirm: ConfirmFn;
};

const NotificationContext = createContext<ProviderApi | null>(null);

/* ---------------------------------------------
   🔧 ID GENERATOR
---------------------------------------------- */
function makeId(prefix = "n"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/* ===============================================================
   🔥 PROVIDER
   =============================================================== */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [previews, setPreviews] = useState<PreviewEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmInternal | null>(
    null
  );

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const hydratedRef = useRef(false);
  const confirmSeqRef = useRef(0);

  /* ---------------------------------------------
     Hydrate from localStorage on mount.
     SSR-safe: useEffect içinde.
  ---------------------------------------------- */
  useEffect(() => {
    setItems(loadFromStorage());
    hydratedRef.current = true;
  }, []);

  /* ---------------------------------------------
     Persist to localStorage on items change.
     Hydrate öncesi yazma yapma (SSR fallback'i ezmesin).
  ---------------------------------------------- */
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveToStorage(items);
  }, [items]);

  /* ---------------------------------------------
     Cross-tab sync via storage event.
  ---------------------------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setItems(loadFromStorage());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  /* ---------------------------------------------
     Provider unmount → tüm preview timer'ları temizle.
  ---------------------------------------------- */
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  /* ---------------------------------------------
     Escape → dropdown ve preview queue temizle.
  ---------------------------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setPreviews([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ---------------------------------------------
     PREVIEW QUEUE HELPERS
  ---------------------------------------------- */
  const clearTimer = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissPreview = useCallback(
    (id: string) => {
      clearTimer(id);
      setPreviews((prev) => prev.filter((p) => p.id !== id));
    },
    [clearTimer]
  );

  const pushPreview = useCallback(
    (entry: PreviewEntry) => {
      clearTimer(entry.id);
      setPreviews((prev) => {
        const filtered = prev.filter((p) => p.id !== entry.id);
        const next = [...filtered, entry];
        if (next.length > MAX_PREVIEW) {
          const dropped = next.slice(0, next.length - MAX_PREVIEW);
          dropped.forEach((d) => clearTimer(d.id));
          return next.slice(next.length - MAX_PREVIEW);
        }
        return next;
      });
      if (entry.severity !== "loading") {
        const handle = setTimeout(() => {
          timersRef.current.delete(entry.id);
          setPreviews((prev) => prev.filter((p) => p.id !== entry.id));
        }, entry.duration);
        timersRef.current.set(entry.id, handle);
      }
    },
    [clearTimer]
  );

  /* ---------------------------------------------
     WRITE API
     - persistent kaydı (success/error/info): items state'e push +
       same-id replace
     - ephemeral preview: pushPreview
     - loading: yalnız preview, persistent yok
  ---------------------------------------------- */
  const show = useCallback(
    (
      severity: NotificationSeverity | "loading",
      title: string,
      options?: NotifyOptions
    ): string => {
      const id = (options?.id && options.id.trim()) || makeId();
      const duration =
        options?.duration ??
        (severity === "error"
          ? DURATION_ERROR
          : severity === "loading"
            ? DURATION_LOADING
            : DURATION_DEFAULT);

      pushPreview({
        id,
        severity,
        title: (title || "").toString(),
        description: options?.description,
        duration,
      });

      const persistDefault = severity !== "loading";
      const persist = options?.persist ?? persistDefault;

      if (persist && severity !== "loading") {
        setItems((prev) => {
          const filtered = prev.filter((it) => it.id !== id);
          const next: AdminNotification = {
            id,
            severity,
            title: (title || "").toString(),
            description: options?.description,
            createdAt: Date.now(),
            readAt: null,
          };
          return [...filtered, next].slice(-MAX_PERSISTED);
        });
      }

      return id;
    },
    [pushPreview]
  );

  const dismiss = useCallback(
    (id?: string) => {
      if (id) {
        dismissPreview(id);
      } else {
        timersRef.current.forEach((t) => clearTimeout(t));
        timersRef.current.clear();
        setPreviews([]);
      }
    },
    [dismissPreview]
  );

  const promise = useCallback(
    <T,>(
      p: Promise<T>,
      messages: PromiseMessages<T>,
      options?: NotifyOptions
    ): Promise<T> => {
      const id = (options?.id && options.id.trim()) || makeId("np");
      show("loading", messages.loading, { ...options, id });
      return p.then(
        (data) => {
          const msg =
            typeof messages.success === "function"
              ? messages.success(data)
              : messages.success;
          show("success", msg, { ...options, id });
          return data;
        },
        (err) => {
          const msg =
            typeof messages.error === "function"
              ? messages.error(err)
              : messages.error;
          show("error", msg, { ...options, id });
          throw err;
        }
      );
    },
    [show]
  );

  /* ---------------------------------------------
     READ API (center)
  ---------------------------------------------- */
  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.readAt === null
          ? { ...it, readAt: Date.now() }
          : it
      )
    );
  }, []);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    setItems((prev) =>
      prev.map((it) => (it.readAt === null ? { ...it, readAt: now } : it))
    );
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  /* ---------------------------------------------
     CONFIRM API
     Imperative async confirm: native confirm() yerine.
     Dönen Promise<boolean>: kullanıcı onayladıysa true,
     iptal/ESC/outside-click → false.
     Aynı anda yalnız bir confirm gösterilir; ikinci çağrı
     öncekini false ile resolve edip yenisi açılır
     (focus + race koruması).
  ---------------------------------------------- */
  const confirm: ConfirmFn = useCallback(
    (request: ConfirmRequest) => {
      return new Promise<boolean>((resolve) => {
        setConfirmState((prev) => {
          if (prev) {
            // Önceki confirm tamamlanmadan yeni geldi → eskisini
            // false ile resolve et, yenisini aç.
            try {
              prev.resolve(false);
            } catch {
              /* noop */
            }
          }
          return {
            ...request,
            id: `cf_${Date.now().toString(36)}_${++confirmSeqRef.current}`,
            resolve,
          };
        });
      });
    },
    []
  );

  const handleConfirmAccept = useCallback(() => {
    setConfirmState((prev) => {
      if (prev) prev.resolve(true);
      return null;
    });
  }, []);

  const handleConfirmCancel = useCallback(() => {
    setConfirmState((prev) => {
      if (prev) prev.resolve(false);
      return null;
    });
  }, []);

  /* ---------------------------------------------
     ITEMS sorted desc (newest first); preview queue native order.
  ---------------------------------------------- */
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => b.createdAt - a.createdAt),
    [items]
  );

  const unreadCount = useMemo(
    () => items.reduce((n, it) => n + (it.readAt === null ? 1 : 0), 0),
    [items]
  );

  /* ---------------------------------------------
     CONTEXT VALUE
  ---------------------------------------------- */
  const value: ProviderApi = useMemo(
    () => ({
      // write
      success: (title, opts) => show("success", title, opts),
      error: (title, opts) => show("error", title, opts),
      info: (title, opts) => show("info", title, opts),
      loading: (title, opts) => show("loading", title, opts),
      dismiss,
      promise,
      // read (center)
      items: sortedItems,
      unreadCount,
      isOpen,
      open,
      close,
      toggle,
      markRead,
      markAllRead,
      clear: clearAll,
      // preview render
      previews,
      dismissPreview,
      // confirm API
      confirm,
    }),
    [
      show,
      dismiss,
      promise,
      sortedItems,
      unreadCount,
      isOpen,
      open,
      close,
      toggle,
      markRead,
      markAllRead,
      clearAll,
      previews,
      dismissPreview,
      confirm,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationPreview previews={previews} onDismiss={dismissPreview} />
      {confirmState ? (
        <ConfirmDialog
          open
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          variant={confirmState.variant}
          onConfirm={handleConfirmAccept}
          onClose={handleConfirmCancel}
        />
      ) : null}
    </NotificationContext.Provider>
  );
}

/* ---------------------------------------------
   🔥 HOOKS
---------------------------------------------- */
const NOOP_NOTIFY: NotifyApi = {
  success: () => "",
  error: () => "",
  info: () => "",
  loading: () => "",
  dismiss: () => {},
  promise: async (p) => p,
};

const NOOP_CENTER: NotificationCenterApi = {
  items: [],
  unreadCount: 0,
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  markRead: () => {},
  markAllRead: () => {},
  clear: () => {},
};

const NOOP_CONFIRM: ConfirmFn = async () => false;

/* ---------------------------------------------
   🔥 useConfirm — destructive intent için.
   Native confirm() yerine premium ConfirmDialog'u
   imperative async fonksiyon olarak verir.

   Pattern:
     const confirm = useConfirm();
     const ok = await confirm({
       title: "Silinsin mi?",
       description: "...",
       confirmLabel: "Sil",
       variant: "danger",
     });
     if (!ok) return;
---------------------------------------------- */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(NotificationContext);
  if (!ctx) return NOOP_CONFIRM;
  return ctx.confirm;
}

export function useNotify(): NotifyApi {
  const ctx = useContext(NotificationContext);
  if (!ctx) return NOOP_NOTIFY;
  const { success, error, info, loading, dismiss, promise } = ctx;
  return { success, error, info, loading, dismiss, promise };
}

export function useNotificationCenter(): NotificationCenterApi {
  const ctx = useContext(NotificationContext);
  if (!ctx) return NOOP_CENTER;
  const {
    items,
    unreadCount,
    isOpen,
    open,
    close,
    toggle,
    markRead,
    markAllRead,
    clear,
  } = ctx;
  return {
    items,
    unreadCount,
    isOpen,
    open,
    close,
    toggle,
    markRead,
    markAllRead,
    clear,
  };
}
