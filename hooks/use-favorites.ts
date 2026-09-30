"use client";

import { useCallback, useEffect, useState } from "react";

/* ===============================================================
   🛡️ FAZ 36 — GUEST FAVORITES HOOK (localStorage-only)
   ===============================================================
   AMAÇ:
     Login sistemi olmadan, public kullanıcının villa favorilerini
     tarayıcısında saklamak. DB tablosu YOK, server action YOK,
     API endpoint YOK, eski sağlayıcıya bir şey yazılmaz.

   STORAGE:
     localStorage key   : "maki_favorites"
     value              : JSON.stringify(string[])  → villa.id dizisi

   API:
     const { favorites, isFavorite, toggleFavorite, clearFavorites,
             isHydrated, count } = useFavorites();

   SSR SAFETY:
     - İlk render (server + client): favorites=[], isHydrated=false
     - useEffect mount sonrası: localStorage'dan oku → favorites set +
       isHydrated=true.
     - Bu pattern: hidrasyon mismatch YOK çünkü ilk client render
       SSR ile birebir ([]). Mount sonrası state güncellenir.
     - Tüketici component'lerin "active" görüntüsünü `isHydrated`
       gate'i arkasına almasını öneriyoruz; ama opsiyonel — SSR
       sırasında zaten favori bilgisi yoktur, default inaktif state
       UI'da doğal.

   CROSS-TAB SYNC:
     - `storage` event listener: aynı domain'de başka tab toggle
       yaparsa state burada da güncellenir.
     - `maki:favorites:change` custom event: aynı tab içindeki
       birden çok `useFavorites` instance'ı sync olur (toggle eden
       component ile farklı yerdeki badge counter aynı render
       cycle'da güncellenir).

   PERFORMANCE:
     - Sıfır DB / API / network fetch
     - localStorage parse JSON microseconds
     - O(n) toggle (Set membership check + slice)
     - Memory footprint: id başına ~36 byte (UUID); 100 favori ≈ 3.6 KB

   DOKUNULMAYAN:
     - Reservation engine, pricing, availability, BookingSidebar,
       review system, AggregateRating, cache architecture (favoriler
       cache'lenmez; per-user/local), search algorithms, private URL
       system, gallery, admin, sidebar permissions.
   =============================================================== */

const STORAGE_KEY = "maki_favorites";
const CHANGE_EVENT = "maki:favorites:change";

/* ---------------------------------------------------------------
   🛡️ STORAGE I/O — defansif read/write
   ---------------------------------------------------------------
   localStorage erişimi private mode / quota / disabled durumlarında
   throw atabilir. Tüm I/O try/catch arkasında — uygulama her zaman
   ayakta kalır, en kötü ihtimal favoriler "ephemeral" davranır.
*/
function readFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* Defansif: yalnız string entry'ler; tek seferde sanitize. */
    return parsed.filter(
      (x): x is string => typeof x === "string" && x.length > 0
    );
  } catch {
    return [];
  }
}

function writeToStorage(value: string[]): void {
  if (typeof window === "undefined") return;
  try {
    /* Deterministik order: ekleme sırasını koru — recent-first
       kullanım için caller toggle akışı responsible. */
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota / disabled — sessizce geç; UI hata göstermez. */
  }
}

function broadcastChange() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* eski tarayıcı / restricted context — sessizce geç */
  }
}

export type UseFavoritesApi = {
  /** Villa.id dizisi. SSR + ilk client render: []. Mount sonrası gerçek
   *  değer yüklenir. */
  favorites: string[];
  /** O(n) lookup. Çoğu sayfa <20 favori; performance kritik değil. */
  isFavorite: (id: string) => boolean;
  /** Toggle ekle/çıkar; localStorage + state + cross-tab broadcast. */
  toggleFavorite: (id: string) => void;
  /** Hepsini sil; /favoriler sayfasında "Favorileri temizle" CTA için. */
  clearFavorites: () => void;
  /** UI badge / count display için convenience. */
  count: number;
  /** Hydrate olmadan önce false; sonrası true. UI bu flag'i bekleyerek
   *  "active" state'i conditional render edebilir → hidrasyon mismatch
   *  riskini azaltır. */
  isHydrated: boolean;
};

export function useFavorites(): UseFavoritesApi {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  /* ---------- Hydrate + subscribe ----------
     useEffect yalnız client'ta çalışır → SSR ve ilk client render
     için state default ([], false). Mount sonrası gerçek değer
     yüklenir + listener'lar bağlanır. */
  useEffect(() => {
    setFavorites(readFromStorage());
    setIsHydrated(true);

    /* Cross-tab: storage event yalnız BAŞKA tab'lerden gelir. */
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setFavorites(readFromStorage());
      }
    };
    /* Same-tab: aynı tab içinde başka bir useFavorites instance
       toggle yaptıysa custom event ile burası da resync olur. */
    const onCustom = () => {
      setFavorites(readFromStorage());
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustom);
    };
  }, []);

  /* ---------- Mutators ---------- */
  const toggleFavorite = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    if (!id || typeof id !== "string") return;

    /* Her toggle'da storage'dan canonical değeri oku — cross-tab
       race condition'larında "kaybolan" değişiklik yok. */
    const current = readFromStorage();
    const exists = current.includes(id);
    const next = exists
      ? current.filter((x) => x !== id)
      : [...current, id];

    writeToStorage(next);
    setFavorites(next);
    broadcastChange();
  }, []);

  const clearFavorites = useCallback(() => {
    if (typeof window === "undefined") return;
    writeToStorage([]);
    setFavorites([]);
    broadcastChange();
  }, []);

  const isFavorite = useCallback(
    (id: string) => {
      if (!id) return false;
      return favorites.includes(id);
    },
    [favorites]
  );

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    clearFavorites,
    count: favorites.length,
    isHydrated,
  };
}
