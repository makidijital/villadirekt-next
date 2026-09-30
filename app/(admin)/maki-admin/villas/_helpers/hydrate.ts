import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";
import {
  normalizeBedroomLayout,
  normalizeBathroomLayout,
  type BedroomLayoutItem,
  type BathroomLayoutItem,
} from "@/lib/villa-layout.helper";
import { slugifyTr } from "@/lib/slug";

import type { VillaMapData } from "../_types/villa-form-data";

/* ===============================================================
   🛡️ FAZ 2 — VILLA EDIT FORM HYDRATION HELPERS (PURE)
   ===============================================================
   Eski:
     - [id]/page.tsx fetchVilla useEffect inline:
         setForm((prev) => ({ ...prev, ...data }))
         setSelectedLocation(data?.location_id || "")
         setSlug(data.slug || slugifyTr(data.title))
         setMapData({ map_type, latitude, longitude, map_embed })
         setYoutubeVideos(normalizeYouTubeVideos(data.youtube_videos))

   Bu helper'lar TEK DB ROW'dan typed slice'lar üretir. Caller
   orchestrator (fetchVilla useEffect) bu helper'ları çağırıp
   state'leri set eder.

   ⚠️ KESIN KURAL:
     - Number coerce + fallback (36.36 / 29.35) AYNEN.
     - `data.map_type || "coords"` fallback AYNEN.
     - `data.slug || slugifyTr(data.title)` fallback AYNEN.
     - `data.location_id || ""` fallback AYNEN.
     - normalizeYouTubeVideos pipe-through AYNEN.

   PURE: input DB row alır, slice döner. Side-effect YOK.
=============================================================== */

/** [id]/fetchVilla DB row'dan map state slice'ı. */
export function hydrateVillaMapDataFromRow(
  data: Record<string, unknown>
): VillaMapData {
  return {
    map_type: (data?.map_type as string) || "coords",
    latitude: Number(data?.latitude) || 36.36,
    longitude: Number(data?.longitude) || 29.35,
    map_embed: (data?.map_embed as string) || "",
  };
}

/** [id]/fetchVilla DB row'dan slug fallback chain.
 *  `data.slug || slugifyTr(data.title)` — eski inline aynen. */
export function hydrateVillaSlugFromRow(
  data: Record<string, unknown>
): string {
  const dbSlug = data?.slug;
  if (typeof dbSlug === "string" && dbSlug.length > 0) return dbSlug;
  const title = (data?.title as string) || "";
  return slugifyTr(title);
}

/** [id]/fetchVilla DB row'dan selected location id (fallback boş). */
export function hydrateVillaLocationIdFromRow(
  data: Record<string, unknown>
): string {
  const locId = data?.location_id;
  return typeof locId === "string" ? locId : "";
}

/** [id]/fetchVilla DB row'dan youtube videos array (JSONB).
 *  normalizeYouTubeVideos pipe-through; geçersiz item drop. */
export function hydrateVillaYouTubeVideosFromRow(
  data: Record<string, unknown>
): VillaYouTubeVideo[] {
  return normalizeYouTubeVideos(data?.youtube_videos);
}

/** [id]/fetchVilla DB row'dan konaklama düzeni (mig 047, JSONB).
 *  normalize* pipe-through; geçersiz item drop. Eski villalar
 *  (NULL) → []. */
export function hydrateVillaBedroomLayoutFromRow(
  data: Record<string, unknown>
): BedroomLayoutItem[] {
  return normalizeBedroomLayout(data?.bedroom_layout);
}

export function hydrateVillaBathroomLayoutFromRow(
  data: Record<string, unknown>
): BathroomLayoutItem[] {
  return normalizeBathroomLayout(data?.bathroom_layout);
}
