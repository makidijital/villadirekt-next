"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";

import { authProvider } from "@/lib/auth";
import {
  getCurrentAdmin,
  signOutAdmin,
  type AdminAuthRecord,
} from "@/lib/admin-auth";

/* ===============================================================
   🔥 ADMIN SESSION GUARD
   ===============================================================
   - Auth state listener (login/logout/refresh)
   - Session restore validation (admin_users tekrar kontrol)
   - 60 dakika inactivity timeout (mousemove/keydown/click/scroll/touch)
   - /maki-admin/login dışındaki tüm admin route'ları korur
   - login sayfasındaki admin'i /maki-admin'e yönlendirir
   - Marker cookie set/clear (middleware redirect hint için)

   AdminContext: admin record + loading state
   useAdmin() hook ile sidebar/topbar permission/avatar bilgisi alınır
   =============================================================== */

const INACTIVITY_MS = 60 * 60 * 1000; // 60 dakika
const MARKER_COOKIE = "admin-session";
const LOGIN_PATH = "/maki-admin/login";

type AdminContextValue = {
  admin: AdminAuthRecord | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AdminContext = createContext<AdminContextValue>({
  admin: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function useAdmin(): AdminContextValue {
  return useContext(AdminContext);
}

function setMarkerCookie(active: boolean): void {
  if (typeof document === "undefined") return;
  if (active) {
    // 1 gün; SameSite=Lax → middleware fast-path için yeterli
    document.cookie = `${MARKER_COOKIE}=1; path=/; max-age=86400; SameSite=Lax`;
  } else {
    document.cookie = `${MARKER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function AdminSessionGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPath = pathname === LOGIN_PATH;

  const [admin, setAdmin] = useState<AdminAuthRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const inactivityTimerRef = useRef<number | null>(null);

  /* ---------------------------------------------
     Admin'i yükle/yenile
     - admin geçersiz → marker temizle + (protected path'te) login'e
     - admin geçerli  → marker set + (login path'te) panele yönlendir
  ---------------------------------------------- */
  const refresh = useCallback(async (): Promise<void> => {
    const a = await getCurrentAdmin();
    setAdmin(a);
    setLoading(false);
    setMarkerCookie(!!a);

    if (!a && !isLoginPath) {
      router.replace(LOGIN_PATH);
      return;
    }
    if (a && isLoginPath) {
      router.replace("/maki-admin");
      return;
    }
  }, [isLoginPath, router]);

  const signOut = useCallback(async (): Promise<void> => {
    setMarkerCookie(false);
    await signOutAdmin();
    setAdmin(null);
    router.replace(LOGIN_PATH);
  }, [router]);

  /* ---------------------------------------------
     Initial load + auth listener
  ---------------------------------------------- */
  useEffect(() => {
    let mounted = true;

    void (async () => {
      const a = await getCurrentAdmin();
      if (!mounted) return;
      setAdmin(a);
      setLoading(false);
      setMarkerCookie(!!a);

      if (!a && !isLoginPath) {
        router.replace(LOGIN_PATH);
      } else if (a && isLoginPath) {
        router.replace("/maki-admin");
      }
    })();

    /* FAZ 39: authProvider.onAuthStateChange delege; Subscription
       handle aynen unsubscribe ile temizlenir. Listener davranışı
       (her event'te admin lookup + redirect) AYNEN. */
    const sub = authProvider.onAuthStateChange((_event, _session) => {
      // Her auth state değişiminde admin_users'ı tekrar doğrula
      void (async () => {
        const a = await getCurrentAdmin();
        setAdmin(a);
        setMarkerCookie(!!a);
        if (!a && !isLoginPath) {
          router.replace(LOGIN_PATH);
        }
      })();
    });

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* ---------------------------------------------
     Inactivity timeout — sadece authenticated alanlarda çalışır
  ---------------------------------------------- */
  useEffect(() => {
    if (!admin || isLoginPath) return;
    if (typeof window === "undefined") return;

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];

    const handleTimeout = async (): Promise<void> => {
      try {
        setMarkerCookie(false);
        await signOutAdmin();
      } catch {
        /* silent — yine de redirect */
      }
      try {
        if (typeof window !== "undefined") {
          window.alert(
            "Oturum süreniz doldu. Lütfen tekrar giriş yapın."
          );
        }
      } catch {
        /* alert engellenmiş olabilir */
      }
      router.replace(LOGIN_PATH);
    };

    const reset = (): void => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = window.setTimeout(
        handleTimeout,
        INACTIVITY_MS
      );
    };

    events.forEach((e) =>
      window.addEventListener(e, reset, { passive: true })
    );
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [admin, isLoginPath, router]);

  /* ---------------------------------------------
     Render
     - Login path: her durumda children'ı render et
       (kendi loading state'ini login formu yönetir)
     - Protected path: ilk auth check tamamlanana kadar
       hiçbir şey gösterme (flash önler)
  ---------------------------------------------- */
  if (!isLoginPath && loading) {
    return null;
  }
  if (!isLoginPath && !admin) {
    // Redirect tetiklenmiş; geçici boş render
    return null;
  }

  return (
    <AdminContext.Provider
      value={{ admin, loading, refresh, signOut }}
    >
      {children}
    </AdminContext.Provider>
  );
}
