"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, MapPin, Loader2, X } from "lucide-react";

import {
  searchPlaces,
  type GeocodeResult,
} from "@/lib/geocoding.helper";

/* ===============================================================
   🛡️ MapPicker — FAZ 20: place autocomplete + Leaflet
   ===============================================================
   AMAÇ:
     Admin'in adres yazıp öneriden seçmesi → marker otomatik gider
     + map zoom + lat/lng auto-fill. Leaflet renderer KORUNUR;
     yalnız UX katmanı zenginleşti.

   KORUNAN (BACKWARD-COMPAT):
     - `value: { latitude, longitude }` + `onChange({ latitude, longitude })`
       prop signature **BYTE-IDENTICAL** — caller (villa form pages)
       dokunulmaz
     - Marker draggable; dragend → position + onChange aynen
     - useEffect ile parent'tan gelen value → setPosition sync aynen
     - Read-only coord display (admin gözlem için)
     - Leaflet tile (OSM), marker icon fix, SSR dynamic patterns aynen

   YENİ:
     - Üstte premium search input (`Search` icon + clear button)
     - Debounce 350ms + AbortController (rate-limit safe)
     - Dropdown autocomplete (Nominatim TR-biased via /api/geocode)
     - Place seçimi → setPosition + onChange + map flyTo (smooth)
     - Outside-click close
     - Graceful fallback: API fail → dropdown gizli, drag-marker aynen

   FRONTEND COUPLING:
     SIFIR. Frontend villa detay Google Maps iframe ile DB'deki
     lat/lng'yi render ediyor; bu MapPicker'a hiç dokunmaz.

   SSR:
     MapContainer/TileLayer/Marker/MapViewSync hepsi
     `dynamic(..., { ssr: false })`. Search input kendisi
     `"use client"` zaten — server bundle'a sızmaz.
   =============================================================== */

// 🔥 SSR FIX — react-leaflet ve MapViewSync client-only
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);

const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);

/* MapViewSync küçük client component; useMap hook MapContainer
   context'i gerektiriyor. */
const MapViewSync = dynamic(() => import("./MapViewSync"), { ssr: false });

// 🔥 MARKER ICON FIX (Next.js bug fix — eski davranış AYNEN)
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Props = {
  value: {
    latitude?: number;
    longitude?: number;
  };
  onChange: (data: { latitude: number; longitude: number }) => void;
};

export default function MapPicker({ value, onChange }: Props) {
  /* Position state — eski davranış aynen. */
  const [position, setPosition] = useState({
    lat: value.latitude ?? 36.36,
    lng: value.longitude ?? 29.35,
  });

  /* Parent'tan gelen value sync — eski davranış aynen. */
  useEffect(() => {
    if (value.latitude && value.longitude) {
      setPosition({
        lat: value.latitude,
        lng: value.longitude,
      });
    }
  }, [value.latitude, value.longitude]);

  /* 🔥 FAZ 20 — SEARCH STATE */
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Debounced search effect.
     - q < 2 → instant reset
     - q >= 2 → 350ms debounce + AbortController + searchPlaces */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ctrl = new AbortController();
    const tid = window.setTimeout(async () => {
      /* 🛡️ FAZ 21 — debug log (request başladı) */
      console.info("[MapPicker] search start:", q);
      const r = await searchPlaces(q, ctrl.signal);
      if (ctrl.signal.aborted) {
        console.info("[MapPicker] search aborted:", q);
        return;
      }
      /* 🛡️ FAZ 21 — debug log (response count) */
      console.info(
        `[MapPicker] search done: "${q}" → ${r.length} result(s)`
      );
      setResults(r);
      setLoading(false);
    }, 350);

    return () => {
      window.clearTimeout(tid);
      ctrl.abort();
    };
  }, [query]);

  /* Outside-click close dropdown. */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Place seçimi → position + onChange + dropdown kapat. */
  const handlePlaceSelect = (place: GeocodeResult) => {
    const next = { lat: place.lat, lng: place.lon };
    setPosition(next);
    onChange({ latitude: next.lat, longitude: next.lng });
    /* Query field'ına seçilen yerin adını yazdırıyoruz → kullanıcı
       seçtiğini görür; istenirse temizleyebilir. */
    setQuery(place.label);
    setResults([]);
    setOpen(false);
  };

  /* Clear search */
  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* ═══════════════════════════════════════════════════════════
          🔍 SEARCH FIELD — premium autocomplete (Faz 20)
          ═══════════════════════════════════════════════════════════ */}
      <div ref={containerRef} className="relative">
        <div className="relative flex items-center">
          <Search
            size={15}
            className="absolute left-3 text-[var(--color-stone-400)] pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length >= 2) setOpen(true);
            }}
            placeholder="Adres veya yer ara (Kalkan, Kaş, Ölüdeniz, Fethiye…)"
            className="input !pl-9 !pr-9 w-full"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2
              size={14}
              className="absolute right-3 animate-spin text-[var(--color-stone-400)] pointer-events-none"
              aria-hidden
            />
          )}
          {!loading && query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-stone-400)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition"
              aria-label="Aramayı temizle"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════
            🛡️ FAZ 21 — Dropdown z-index HARDENING
            ═══════════════════════════════════════════════════════
            ESKİ HATA: `z-[60]` Leaflet'in iç pane'lerinin (tile-pane
            z-200, marker-pane z-600, popup-pane z-700) altında kalıyor
            → dropdown tile'ların ARKASINDA renderleniyor, görünmüyor.

            ÇÖZÜM: `z-[1000]` (Leaflet'in tüm iç pane'lerinin üstünde).
            Ayrıca `bg-white` explicit (transparent fallback yok),
            `border` + `shadow` premium görünür, `overflow-auto` long
            list için scroll, `max-h-72` taşma korumalı. */}
        {open && query.trim().length >= 2 && (
          <div
            className="
              absolute top-full mt-2 left-0 right-0 z-[1000]
              bg-white border border-[var(--color-stone-100)]
              rounded-2xl shadow-[0_12px_32px_-12px_rgb(27_26_23/0.18)]
              max-h-72 overflow-auto
            "
            /* 🛡️ Inline style fallback — Tailwind purge edilse veya
               JIT'in özel selector'u tanımasa bile dropdown garanti
               görünür (defensive). */
            style={{ zIndex: 1000 }}
          >
            {loading ? (
              <div className="px-4 py-3 text-sm text-[var(--color-stone-500)] flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                Aranıyor…
              </div>
            ) : results.length === 0 ? (
              /* 🛡️ FAZ 21 — graceful empty state.
                 Net mesaj + drag fallback bilgisi. */
              <div className="px-4 py-3.5 text-sm">
                <p className="text-[var(--color-stone-900)] font-medium">
                  Konum bulunamadı
                </p>
                <p className="text-[var(--color-stone-500)] text-[12.5px] mt-1 leading-snug">
                  Farklı bir yer adı dene veya haritadaki marker&apos;ı
                  doğrudan sürükleyerek konumu seç.
                </p>
              </div>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handlePlaceSelect(r)}
                  className="
                    flex items-start gap-2 w-full text-left
                    px-4 py-2.5
                    hover:bg-[var(--color-sand-50)]
                    transition-colors motion-reduce:transition-none
                    border-b border-[var(--color-stone-100)] last:border-b-0
                    focus:outline-none focus-visible:bg-[var(--color-sand-50)]
                  "
                >
                  <MapPin
                    size={13}
                    className="text-[var(--color-champagne-500)] mt-0.5 shrink-0"
                  />
                  <span className="text-sm text-[var(--color-stone-700)] line-clamp-2 leading-snug">
                    {r.label}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          🗺️ MAP — Leaflet (KORUNDU)
          ═══════════════════════════════════════════════════════════ */}
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={13}
        className="h-[600px] w-full rounded-xl"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker
          position={[position.lat, position.lng]}
          draggable
          eventHandlers={{
            dragend: (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
              const latlng = e.target.getLatLng();
              const newPos = { lat: latlng.lat, lng: latlng.lng };
              setPosition(newPos);
              onChange({
                latitude: newPos.lat,
                longitude: newPos.lng,
              });
            },
          }}
        />

        {/* 🛡️ FAZ 20 — view sync: place seçilince map smooth fly.
           Marker drag durumunda position değişir ama bu component'in
           flyTo'su tek seferlik geçişlerde yumuşak hareket verir;
           drag sırasında zaten map kendi kendine taşır (drag handler
           pan'i kullanır), flyTo arasındaki cycle minor — kabul
           edilir UX. İlerideki gelişme: drag sırasında flyTo'yu
           skip etmek için ref-based guard. */}
        <MapViewSync lat={position.lat} lng={position.lng} />
      </MapContainer>

      {/* ═══════════════════════════════════════════════════════════
          📐 KOORDİNATLAR (read-only) — KORUNDU
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-2">
        <input
          value={position.lat.toFixed(6)}
          readOnly
          className="input !bg-[var(--color-sand-50)] tabular-nums text-sm"
          aria-label="Enlem (latitude)"
          title="Enlem"
        />
        <input
          value={position.lng.toFixed(6)}
          readOnly
          className="input !bg-[var(--color-sand-50)] tabular-nums text-sm"
          aria-label="Boylam (longitude)"
          title="Boylam"
        />
      </div>
    </div>
  );
}
