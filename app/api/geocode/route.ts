import { NextResponse } from "next/server";

import { applyRateLimit } from "@/lib/rate-limit";

/* ===============================================================
   🛡️ GEOCODE — Nominatim (OpenStreetMap) server proxy
   ===============================================================
   ROL:
     Admin MapPicker'ın search input'u için place autocomplete.
     Browser yerine SUNUCU üzerinden Nominatim'e proxy:
       - Kendi domain'imize fetch (CORS yok)
       - User-Agent header (Nominatim usage policy — zorunlu)
       - Şema sabit: { results: [{ id, label, lat, lon, type }] }
     Frontend villa map render'ı bu route'u KULLANMAZ; yalnız
     admin MapPicker arama UX'i için.

   USAGE POLICY:
     - Rate limit 1 req/s (Nominatim) — caller debounce 350ms +
       AbortController ile mitigate eder. Birden fazla admin için
       fair-use korunur.
     - Türkiye'ye bias: countrycodes=tr (admin TR villaları için).
     - addressdetails=1 → ileride province/county breakdown için
       hazır (şu an sadece display_name kullanılıyor).

   FAILURE MODES:
     - Network/upstream error → `{ results: [], error }` + 5xx
     - Empty query (<2 char) → `{ results: [] }` 200
     - Invalid JSON → boş array (caller fallback)

   SECURITY:
     - Yalnız GET, query param `q` (read-only)
     - API key gerektirmez (Nominatim public, no auth)
     - PII yok; admin query'leri sunucuda loglanmaz (privacy)
     - Üçüncü taraf rate limit'ine respect: 1 req/s policy.
   =============================================================== */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
/* User-Agent — Nominatim usage policy uyarınca bir identifier
   gerekiyor. Production'da app URL'i + iletişim noktası içerebilir. */
const USER_AGENT =
  "VillaKiralamaAdmin/1.0 (https://github.com/villa-kiralama; admin geocoding)";

export const runtime = "nodejs";

export async function GET(req: Request) {
  /* Rate limit: 20 req/dakika/IP. Nominatim quota koruması (1 req/sn
     usage policy'si var, üzerine çıkmamalıyız). Limit aşılırsa 429. */
  const limited = await applyRateLimit(req, "geocode");
  if (limited) return limited;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  /* 🛡️ FAZ 21 — Türkiye bias parametreleri zorunlu, doğrulamada. */
  const params = new URLSearchParams({
    q,
    countrycodes: "tr", // Türkiye-only sonuçlar
    format: "json",
    limit: "8",
    addressdetails: "1",
    "accept-language": "tr", // TR display_name
  });

  /* 🛡️ FAZ 21 — server-side debug log (request başladı) */
  console.info(`[geocode.api] query="${q}" upstream=nominatim`);

  try {
    const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      // 🔥 Cache deliberately disabled — admin canlı arama yapıyor.
      // İleride server-side LRU cache eklenebilir (P2).
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(
        `[geocode.api] upstream non-ok status=${res.status} statusText="${res.statusText}" query="${q}"`
      );
      return NextResponse.json(
        { results: [], error: "upstream_failed" },
        { status: 502 }
      );
    }

    type NominatimItem = {
      place_id?: number | string;
      display_name?: string;
      lat?: string;
      lon?: string;
      type?: string;
      importance?: number;
    };

    const raw = (await res.json().catch(() => [])) as NominatimItem[];
    if (!Array.isArray(raw)) {
      console.warn(
        `[geocode.api] non-array response from upstream for query="${q}"`
      );
      return NextResponse.json({ results: [] });
    }

    const results = raw
      .map((r) => ({
        id: String(r.place_id ?? `${r.lat}-${r.lon}`),
        label: String(r.display_name ?? ""),
        lat: Number(r.lat),
        lon: Number(r.lon),
        type: r.type ?? null,
      }))
      .filter(
        (r) =>
          r.label.length > 0 &&
          Number.isFinite(r.lat) &&
          Number.isFinite(r.lon)
      );

    /* 🛡️ FAZ 21 — sonuç sayısı log + boş query için warning */
    console.info(
      `[geocode.api] query="${q}" results=${results.length}`
    );
    if (results.length === 0 && q.length >= 3) {
      console.warn(
        `[geocode.api] empty results for non-trivial query="${q}". ` +
          `Check Nominatim coverage or remove countrycodes=tr bias if needed.`
      );
    }

    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(
      `[geocode.api] exception query="${q}" error="${msg}"`
    );
    return NextResponse.json(
      { results: [], error: "exception" },
      { status: 500 }
    );
  }
}
