import "server-only";

import { villaAdminRepository } from "@/lib/db/villa.repository.server";

import { generateUniqueSlug } from "./_helpers/slug";
import {
  insertVillaTypeRelations,
  insertVillaFeatureRelations,
  insertVillaRuleRelations,
  insertVillaPriceIncludeRelations,
} from "./_helpers/relations";
import { setVillaPricesServer } from "../villa-price.service.server";
import { setVillaDistancesServer } from "../villa-distance.service.server";

/* ===============================================================
   🛡️ CLONE VILLA — admin "Kopyala" feature (orchestrator)
   ===============================================================
   AMAÇ:
     Admin liste sayfasındaki "Kopyala" aksiyonu için kaynak
     villanın TÜM ham verilerini ve relation kayıtlarını yeni bir
     villaya kopyalar. Görsel (villa_images) KOPYALANMAZ — kullanıcı
     kuralı; ayrıca yeni villa is_active=false olarak doğar
     (admin önce kontrol/edit eder).

   MİMARİ KARAR (refactor YOK):
     Mevcut create.service.ts orchestrator'ı çağırmıyoruz çünkü o
     `VillaFormPayload` (FE form shape) bekliyor; DB row → form
     reverse-mapping ek complexity ve sürprize açık. Bunun yerine
     ham row pick + `villaAdminRepository.insertVilla` doğrudan
     çağrılır. Tüm relation/prices/distances için mevcut `insertV*`
     ve `setV*ServerÔ helper'ları paylaşılır → kod tekrarı yok.

   KOPYALANAN ALANLAR (master villa row — 40+):
     title, description, location_id, badge, slug, guests, bedrooms,
     bathrooms, deposit, cleaning_fee, cleaning_currency,
     cleaning_limit, map_type/latitude/longitude/map_embed,
     pool_type/depth/width/length, indoor_pool*, child_pool*,
     pool_sheltered,
     seo_title, seo_description, noindex, custom_prepayment_rate,
     tourism_document_number, minimum_stay_nights, youtube_videos,
     commission_rate, owner_id, bedroom_layout, bathroom_layout
     + RELATION TABLOLARI:
       villa_type_relations, villa_feature_relations,
       villa_rule_relations, villa_price_include_relations
     + STANDALONE:
       villa_prices, villa_distances

   KOPYALANMAYAN ALANLAR:
     - id (yeni UUID — Postgres default)
     - is_active (zorla false)
     - deleted_at (yeni — null)
     - sort_order (admin drag-drop yeniden sıralar)
     - created_at (default now())
     - private_access_token (güvenlik — kopyalanmaz, gerekirse
       admin yeniden üretir)
     - villa_images (KULLANICI KURALI — galeri boş)

   SLUG STRATEJİSİ:
     `${original.title} - Kopya` → slugifyTr → "<base>-kopya"
     `generateUniqueSlug` çakışırsa "-2", "-3"... ekler. Mevcut
     create flow'u ile birebir aynı uniqueness garantisi.

   HATA MODU:
     Master INSERT fail → throw → caller (route) 400.
     Relation/prices/distances fail → throw → master kayıt kalır
     (kısmen klonlanmış). Bu mevcut createVillaFull semantic'i
     ile parity; rollback yok — admin edit ekranında manuel
     düzeltebilir.
=============================================================== */

type CloneResult = { ok: true; id: string } | { ok: false; error: string };

export async function cloneVilla(
  sourceVillaId: string
): Promise<CloneResult> {
  if (!sourceVillaId) {
    return { ok: false, error: "Kaynak villa ID gerekli" };
  }

  /* 1) Master row + tüm relation/prices/distances paralel fetch.
        Tek round-trip yerine paralel: net latency = max(fetch).
        Server-role (dbAdmin) → RLS bypass. */
  const [
    villaRes,
    typeRes,
    featureRes,
    ruleRes,
    includeRes,
    priceRes,
    distanceRes,
  ] = await Promise.all([
    villaAdminRepository.findRawById(sourceVillaId),
    villaAdminRepository.findTypeRelationIds(sourceVillaId),
    villaAdminRepository.findFeatureRelationIds(sourceVillaId),
    villaAdminRepository.findRuleRelationIds(sourceVillaId),
    villaAdminRepository.findPriceIncludeRelationIds(sourceVillaId),
    villaAdminRepository.findPricesForClone(sourceVillaId),
    /* 🛡️ FIX — `villa_distances` tablosunda `unit` SÜTUNU YOK
       (replace_villa_distances yalnız title+distance yazar; unit
       distance metnine serialize edilir). Repo `findDistancesForClone`
       select yalnız title+distance; aşağıdaki map `d.unit` yoksa
       undefined'a düşer; distance metni serialized unit'i taşıdığı için
       passthrough korunur. */
    villaAdminRepository.findDistancesForClone(sourceVillaId),
  ]);

  if (villaRes.error) {
    console.error("[clone.villa] FETCH_FAILED", {
      sourceVillaId,
      error: villaRes.error.message,
    });
    return { ok: false, error: villaRes.error.message };
  }
  const original = villaRes.data as Record<string, unknown> | null;
  if (!original) {
    return { ok: false, error: "Kaynak villa bulunamadı" };
  }

  /* 2) Title + slug üretimi.
        Title aynı suffix ("- Kopya"); ardışık kopyalamada slug
        otomatik -2, -3 ile uniqueness. */
  const originalTitle = (original.title as string | null) || "Villa";
  const newTitle = `${originalTitle} - Kopya`;
  const newSlug = await generateUniqueSlug(newTitle);

  /* 3) Master payload — kaynak row'dan kopyalanmaması gereken
        alanları çıkar; yeni başlık + slug + is_active=false uygula.
        sort_order, created_at, private_access_token, deleted_at,
        id ATILIR — Postgres default'ları devreye girer.
        Tüm diğer 40+ alan birebir taşınır. */
  const exclude = new Set([
    "id",
    "slug",
    "title",
    "is_active",
    "deleted_at",
    "created_at",
    "sort_order",
    "private_access_token",
    /* 🛡️ GENERATED ALWAYS kolon (mig 065) — DB `title`'dan otomatik
       hesaplar. select("*") bunu getirdiği için blacklist'e eklenir;
       INSERT'e değer gitse Postgres "cannot insert a non-DEFAULT value
       into column search_title" reddi verir. Hariç tutulunca PostgreSQL
       clone sonrası yeniden üretir. */
    "search_title",
    /* 🛡️ GENERATED ALWAYS kolon (mig 078) — DB `real_title`'dan otomatik
       hesaplar; search_title ile aynı gerekçe. */
    "real_title_search",
  ]);
  const corePayload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(original)) {
    if (!exclude.has(k)) corePayload[k] = v;
  }
  corePayload.title = newTitle;
  corePayload.slug = newSlug;
  corePayload.is_active = false;

  /* 4) INSERT yeni villa. */
  const { data: inserted, error: insertErr } =
    await villaAdminRepository.insertVilla(corePayload);
  if (insertErr || !inserted?.id) {
    console.error("[clone.villa] INSERT_FAILED", {
      sourceVillaId,
      error: insertErr?.message,
    });
    return {
      ok: false,
      error: insertErr?.message || "Yeni villa oluşturulamadı",
    };
  }
  const newId = inserted.id as string;

  /* 5) Relations + prices + distances — kaynak satırlardan yeni
        villaId ile reinsert. Create flow asimetrisi (`.length > 0`
        conditional) AYNEN uygulanır; sıfır element → call YOK.
        Hata olursa throw → caller (route) catch'inde 400'e map'lenir;
        master villa kayıt edildi (kullanıcı edit ekranında düzeltebilir).
        createVillaFull'un mevcut semantic'i ile parity. */
  try {
    const typeIds = (typeRes.data || [])
      .map((r) => (r as { type_id: string | null }).type_id)
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    if (typeIds.length > 0) {
      await insertVillaTypeRelations(newId, typeIds);
    }

    const featureIds = (featureRes.data || [])
      .map((r) => (r as { feature_id: string | null }).feature_id)
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    if (featureIds.length > 0) {
      await insertVillaFeatureRelations(newId, featureIds);
    }

    const ruleIds = (ruleRes.data || [])
      .map((r) => (r as { rule_id: string | null }).rule_id)
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    if (ruleIds.length > 0) {
      await insertVillaRuleRelations(newId, ruleIds);
    }

    const includeIds = (includeRes.data || [])
      .map((r) => (r as { include_id: string | null }).include_id)
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    if (includeIds.length > 0) {
      await insertVillaPriceIncludeRelations(newId, includeIds);
    }

    const prices = (priceRes.data || []) as {
      start_date: string;
      end_date: string;
      price: number;
      currency?: string | null;
    }[];
    if (prices.length > 0) {
      await setVillaPricesServer(
        newId,
        prices.map((p) => ({
          start_date: p.start_date,
          end_date: p.end_date,
          price: Number(p.price) || 0,
          currency: p.currency || undefined,
        }))
      );
    }

    const distances = (distanceRes.data || []) as {
      title: string | null;
      distance: string | null;
      unit?: "m" | "km" | null;
    }[];
    if (distances.length > 0) {
      await setVillaDistancesServer(
        newId,
        distances.map((d) => ({
          title: String(d.title || ""),
          distance: String(d.distance || ""),
          unit:
            d.unit === "m" || d.unit === "km" ? d.unit : undefined,
        }))
      );
    }
  } catch (relErr) {
    console.error("[clone.villa] RELATIONS_FAILED", {
      sourceVillaId,
      newId,
      error:
        relErr instanceof Error ? relErr.message : "İlişkili kayıtlar",
    });
    return {
      ok: false,
      error:
        relErr instanceof Error
          ? relErr.message
          : "İlişkili kayıtlar kopyalanamadı",
    };
  }

  return { ok: true, id: newId };
}
