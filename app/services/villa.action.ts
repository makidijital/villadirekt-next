"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getVillasByIds as getVillasByIdsService,
  getTrashedVillas as getTrashedVillasService,
  type VillaDTO,
} from "@/app/services/villa.service";
import { getVillaBadgesByLocale } from "@/lib/i18n/get-villa-badge-translations.server";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ VILLA — SERVER ACTIONS (thin wrapper, Villa Migration S1)
   ===============================================================
   Client boundary temizliği: `villa.service` (nötr modül; ileride
   native `server-only` repo'ya geçecek) client bundle'ına SIZMASIN.
   İki client tüketicisi bu action'lara repoint edilir:
     - FavoritesGrid (public /favoriler)      → getVillasByIdsAction
                                              → getVillaBadgesAction
     - villas/trash  (admin trash bin)        → getTrashedVillasAction

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder.
     İmzalar + dönüş tipleri service'ten türetilir (Parameters/
     ReturnType → cast/any YOK, birebir). Provider/repository/eski sağlayıcı
     DEĞİŞMEDİ; yalnız çağrı sınırı server action'a taşındı.
     `getVillasByIdsAction` dönüşü tam `VillaDTO` DEĞİL, yalnız kart
     alanları (bkz. aşağıdaki PUBLIC PAYLOAD SINIRI) — plain
     (string/number/string[]), server action serialization güvenli.
   =============================================================== */

/* 🔒 PUBLIC PAYLOAD SINIRI — `getVillasByIdsAction` yanıtı Server Action
   ile TARAYICIYA serileştirilir. Servisin döndürdüğü tam `VillaDTO`
   yalnız server/admin içindir (ör. `private_access_token`,
   `commission_rate`, açıklama/SEO/harita alanları). Bu action'ın TEK
   tüketicisi `FavoritesGrid` → `VillaCard` ve yalnız aşağıdaki alanları
   okur; yanıt bu alanlarla sınırlandırılır. Değerler servisten AYNEN
   kopyalanır (dönüşüm YOK) → kart çıktısı birebir aynı.
   `getVillasByIds` servisi, `mapVilla`, `VillaDTO` ve repository
   DEĞİŞMEDİ (diğer server tüketicileri tam DTO'yu kullanmaya devam eder). */
type FavoriteVillaCardDTO = Pick<
  VillaDTO,
  | "id"
  | "slug"
  | "title"
  | "location"
  | "price"
  | "currency"
  | "images"
  | "badge"
  | "bedrooms"
  | "bathrooms"
  | "guests"
  | "review_average"
  | "review_count"
>;

function toFavoriteVillaCard(v: VillaDTO): FavoriteVillaCardDTO {
  const card: FavoriteVillaCardDTO = {
    id: v.id,
    slug: v.slug,
    title: v.title,
    location: v.location,
    price: v.price,
    currency: v.currency,
    images: v.images,
    badge: v.badge,
    bedrooms: v.bedrooms,
    bathrooms: v.bathrooms,
    guests: v.guests,
  };
  /* Review alanları servis tarafında yalnız yorum varken set edilir;
     aynı "anahtar yok" davranışı korunur. */
  if (v.review_average !== undefined) card.review_average = v.review_average;
  if (v.review_count !== undefined) card.review_count = v.review_count;
  return card;
}

export async function getVillasByIdsAction(
  ...args: Parameters<typeof getVillasByIdsService>
): Promise<FavoriteVillaCardDTO[]> {
  const villas = await getVillasByIdsService(...args);
  return villas.map(toFavoriteVillaCard);
}

export async function getTrashedVillasAction(
  ...args: Parameters<typeof getTrashedVillasService>
): ReturnType<typeof getTrashedVillasService> {
  await requirePermission("villas");
  return getTrashedVillasService(...args);
}

/* 🛡️ Kart rozeti (villa_translations.badge) çevirisi — `VillaList` /
   `DiscountCollection` ile AYNI batch kaynağı (`getVillaBadgesByLocale`),
   N+1 YOK. `FavoritesGrid` bir client component olduğu için server-only
   modülü doğrudan import EDEMEZ; bu ince wrapper yalnız sınır geçişi
   sağlar — iş mantığı YOK. TR'de servis zaten boş Map döner (sorgu
   atılmaz) → TR davranışı ve maliyeti BİREBİR eskisi gibi.

   Map serialize edilemediği için düz obje döner (server action
   serialization güvenli); çağıran tarafta `?? canonical` fallback'i
   korunur. */
export async function getVillaBadgesAction(
  villaIds: readonly string[],
  locale: Locale
): Promise<Record<string, string>> {
  const map = await getVillaBadgesByLocale(villaIds, locale);
  return Object.fromEntries(map);
}
