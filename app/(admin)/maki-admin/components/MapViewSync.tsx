"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

/* ===============================================================
   🛡️ MapViewSync — Leaflet view sync helper (Faz 20)
   ===============================================================
   Place autocomplete'ten gelen koordinat değişimini Leaflet
   `map.flyTo` ile yumuşak pan/zoom yapar. `MapContainer`'ın
   child'ı olarak mount edilir (useMap context'i gerekir).

   - dynamic ssr:false ile import edilir (parent MapPicker'da)
   - Position değişirse map yumuşak transition'la kayar (0.8s)
   - Marker kendisi MapPicker tarafından render edilir; bu component
     yalnız map viewport'u senkronize eder.

   Reservation/booking/save logic'e DOKUNULMAZ.
   =============================================================== */

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
};

export default function MapViewSync({ lat, lng, zoom = 14 }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    /* flyTo → premium smooth pan/zoom. Süre 0.8s; admin'i bekletmez. */
    try {
      map.flyTo([lat, lng], zoom, { duration: 0.8 });
    } catch {
      /* Defensive: bir nedenle harita henüz ready değilse atla. */
    }
  }, [lat, lng, zoom, map]);

  return null;
}
