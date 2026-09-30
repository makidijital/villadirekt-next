/* ===============================================================
   🛡️ GEOCODING HELPER — Admin MapPicker place autocomplete client
   ===============================================================
   ROL:
     `app/api/geocode/route.ts` server proxy'sine browser-side
     fetch wrapper. Debounce ve UI state caller'ın sorumluluğu.

   YALNIZ ADMIN:
     Bu helper'ın çağrılması yalnız `MapPicker` (admin villa form)
     içinde olur. Frontend villa detay sayfası geocoding YAPMAZ
     (Google Maps iframe ile DB'deki lat/lng'yi direkt render eder).

   SSR-SAFE: Fetch wrapper; React/DOM bağımlılığı yok ama browser
   bağlamında (`/api/geocode`) çağrılır. Server component import
   etmemeli (yine de hata vermez; fetch'in çalışmasını engelleyen
   yok).

   FALLBACK:
     - Network error / abort / non-ok → boş array
     - Caller (`MapPicker`) boş array gördüğünde "Sonuç bulunamadı"
       UI'sı gösterir; harita drag-marker davranışı bağımsız çalışır.
   =============================================================== */

export type GeocodeResult = {
  /** Stable id (nominatim place_id veya coord composite) */
  id: string;
  /** Display label — `display_name` (örn. "Kalkan, Kaş, Antalya") */
  label: string;
  /** Latitude (finite number) */
  lat: number;
  /** Longitude (finite number) */
  lon: number;
  /** OSM type: village/town/city/poi/null — UI opsiyonel chip için */
  type: string | null;
};

/**
 * Place autocomplete arama.
 *
 * @param query kullanıcının yazdığı arama metni (min 2 char)
 * @param signal AbortController.signal — bir önceki request iptal için
 * @returns sonuç dizisi (boş array fallback)
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal
): Promise<GeocodeResult[]> {
  const q = (query || "").trim();
  if (q.length < 2) return [];

  /* 🛡️ FAZ 21 — debug log (request başladı) */
  console.info("[geocode.client] fetching:", q);

  try {
    const res = await fetch(
      `/api/geocode?q=${encodeURIComponent(q)}`,
      {
        signal,
        cache: "no-store",
      }
    );

    /* 🛡️ FAZ 21 — response status log */
    console.info(
      `[geocode.client] response: ${res.status} ${res.statusText}`
    );

    if (!res.ok) {
      console.warn(
        `[geocode.client] upstream non-ok (${res.status}); returning empty`
      );
      return [];
    }

    const data = (await res.json()) as { results?: GeocodeResult[] };
    if (!Array.isArray(data?.results)) {
      console.warn("[geocode.client] invalid response shape:", data);
      return [];
    }

    /* Defansif: server her item için lat/lon/label garanti ediyor
       ama browser tarafında bir kere daha narrow filter. */
    const filtered = data.results.filter(
      (r) =>
        typeof r?.id === "string" &&
        typeof r?.label === "string" &&
        Number.isFinite(r?.lat) &&
        Number.isFinite(r?.lon)
    );

    /* 🛡️ FAZ 21 — count log */
    console.info(
      `[geocode.client] parsed: ${filtered.length} valid result(s) for "${q}"`
    );

    /* Boş sonuç production sızıntısı değil; non-trivial query için warning. */
    if (filtered.length === 0 && q.length >= 3) {
      console.warn(
        `[geocode.client] no results for non-trivial query: "${q}"`
      );
    }

    return filtered;
  } catch (err) {
    /* AbortError sessiz geçer; diğer hatalar console warning + boş array. */
    const name = (err as { name?: string })?.name;
    if (name === "AbortError") {
      console.info("[geocode.client] aborted:", q);
      return [];
    }
    console.warn("[geocode.client] exception:", err);
    return [];
  }
}
