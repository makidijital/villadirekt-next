import { slugifyTr } from "@/lib/slug";
import type { VillaYouTubeVideo } from "@/lib/youtube.helper";
import type {
  BedroomLayoutItem,
  BathroomLayoutItem,
} from "@/lib/villa-layout.helper";

import type {
  VillaForm,
  VillaFormPayload,
  VillaUpdatePayload,
} from "@/app/services/villa-admin.service";

import type {
  VillaFormData,
  VillaMapData,
  VillaPriceRowState,
  VillaDistanceItem,
} from "../_types/villa-form-data";

/* ===============================================================
   🛡️ FAZ 2 — VILLA FORM PAYLOAD BUILDERS (PURE)
   ===============================================================
   Eski:
     - villas/ekle/page.tsx handleCreate (~20 LOC inline)
     - villas/[id]/page.tsx handleUpdate (~15 LOC inline)
   İki sayfa `createVillaFull` / `updateVillaFull` çağrılarına geçen
   payload'ı BYTE-IDENTICAL bu helper'lara taşındı.

   ⚠️ KESIN KURAL:
     - Alan sırası eski inline çağrıyla aynen.
     - `prices.filter(...)` ve `distances.filter(...)` ekle-only
       filtreleri AYNEN korundu (create asimetrisi).
     - `[id]` update: distances/prices filter YOK — direkt geçer.
     - `slugifyTr(form.title)` create için her zaman; edit için
       caller `slug` state'inden geçer.
     - `youtube_videos` form'a inject — service normalize eder.

   PURE: input alır, payload object'i döner. Side-effect YOK.
=============================================================== */

export type BuildVillaCreatePayloadInput = {
  form: VillaFormData;
  selectedLocation: string;
  selectedTypes: string[];
  selectedFeatures: string[];
  mapData: VillaMapData;
  distances: VillaDistanceItem[];
  prices: VillaPriceRowState[];
  selectedRules: string[];
  selectedPriceIncludes: string[];
  youtubeVideos: VillaYouTubeVideo[];
  /* mig 047 — opsiyonel; verilmezse [] (boş → service null'a düşürür).
     Mevcut test'ler ve eski caller'lar bu alanları geçmese de kırılmaz. */
  bedroomLayout?: BedroomLayoutItem[];
  bathroomLayout?: BathroomLayoutItem[];
};

/* createVillaFull payload — ekle/handleCreate inline'ın aynen kopyası.
   `prices.filter` + `distances.filter` ekle-side filtreleri korundu. */
export function buildVillaCreatePayload(
  input: BuildVillaCreatePayloadInput
): VillaFormPayload {
  const {
    form,
    selectedLocation,
    selectedTypes,
    selectedFeatures,
    mapData,
    distances,
    prices,
    selectedRules,
    selectedPriceIncludes,
    youtubeVideos,
    bedroomLayout,
    bathroomLayout,
  } = input;

  /* 🛡️ Form spread BYTE-IDENTICAL eski payload ile:
     - `slug: slugifyTr(form.title)` create flow özelinde inject edilir.
       Service-side `createVillaFull` form.slug'ı OKUMAZ (kendi
       `generateUniqueSlug` çağrısını yapar). Eski `useState<any>`
       runtime'da bu ek key zaten gönderiliyordu; key-set BYTE-IDENTICAL
       korunması için cast ile devre dışı tip kontrolü.
     - `youtube_videos` form'a inject — service normalize eder,
       boşsa null'a düşer.
     - `bedroom_layout` / `bathroom_layout` (mig 047) form'a inject —
       service normalize eder, boşsa null. */
  const formWithExtras = {
    ...form,
    slug: slugifyTr(form.title),
    youtube_videos: youtubeVideos,
    bedroom_layout: bedroomLayout ?? [],
    bathroom_layout: bathroomLayout ?? [],
  } as VillaForm;

  return {
    form: formWithExtras,
    selectedLocation,
    selectedTypes,
    selectedFeatures,
    mapData,
    distances: distances.filter((d) => d.title && d.distance),
    prices: prices.filter(
      (p) => p.start_date && p.end_date && p.price > 0
    ),
    // 🔥 master/relation — id arrays
    selectedRules,
    selectedPriceIncludes,
  };
}

export type BuildVillaUpdatePayloadInput = {
  id: string;
  form: VillaFormData;
  slug: string;
  selectedLocation: string;
  selectedTypes: string[];
  selectedFeatures: string[];
  mapData: VillaMapData;
  distances: VillaDistanceItem[];
  prices: VillaPriceRowState[];
  selectedRules: string[];
  selectedPriceIncludes: string[];
  youtubeVideos: VillaYouTubeVideo[];
  /* mig 047 — opsiyonel; verilmezse [] (boş → service null'a düşürür).
     Mevcut test'ler ve eski caller'lar bu alanları geçmese de kırılmaz. */
  bedroomLayout?: BedroomLayoutItem[];
  bathroomLayout?: BathroomLayoutItem[];
};

/* updateVillaFull payload — [id]/handleUpdate inline'ın aynen kopyası.
   ⚠️ KRİTİK ASIMETRİ:
     Update'te distances/prices filter YOK — direkt geçer.
     (Create'te filter VAR.) Eski davranış aynen korundu. */
export function buildVillaUpdatePayload(
  input: BuildVillaUpdatePayloadInput
): VillaUpdatePayload {
  const {
    id,
    form,
    slug,
    selectedLocation,
    selectedTypes,
    selectedFeatures,
    mapData,
    distances,
    prices,
    selectedRules,
    selectedPriceIncludes,
    youtubeVideos,
    bedroomLayout,
    bathroomLayout,
  } = input;

  /* 🛡️ Form spread BYTE-IDENTICAL eski payload ile:
     - `slug` [id] page'in state'inden gelir (DB'den hidrate edildi).
       Service `updateVillaFull` form.slug'ı OKUMAZ (kendi
       `generateUniqueSlug(form.title, id)` çağrısını yapar).
       Eski `useState<any>` runtime'da bu ek key gönderiyordu;
       key-set korunması için cast.
     - `youtube_videos` form'a inject — service normalize eder.
     - `bedroom_layout` / `bathroom_layout` (mig 047) inject. */
  const formWithExtras = {
    ...form,
    slug,
    youtube_videos: youtubeVideos,
    bedroom_layout: bedroomLayout ?? [],
    bathroom_layout: bathroomLayout ?? [],
  } as VillaForm;

  return {
    id,
    form: formWithExtras,
    selectedLocation,
    selectedTypes,
    selectedFeatures,
    mapData,
    distances,
    prices,
    // 🔥 master/relation — id arrays
    selectedRules,
    selectedPriceIncludes,
  };
}
