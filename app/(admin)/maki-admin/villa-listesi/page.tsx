/* 🛡️ Villa Migration S5F — findActiveCuratorCards native embed'e taşındı.
   Bu sayfa server RSC + villaRepository'yi YALNIZ findActiveCuratorCards
   için kullanıyor → server-only native repo import'u güvenli, tek call-site. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { villaLocationRepository } from "@/lib/db/villa-location.repository";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";
import { adminPermissionGate } from "@/app/components/admin/AdminSectionGuard";

import VillaListesiClient, {
  type VillaListesiRow,
  type LocationOption,
  type CategoryOption,
} from "./_components/VillaListesiClient";

/* ===============================================================
   🏛️ ADMIN — VILLA LISTESİ (concierge curator)
   ===============================================================
   Admin: müşteriye özel villa seçkisi hazırlar.
   Public hero search mantığıyla filtre uygular, sonuçlardan
   manuel villa seçer, "Listeyi Paylaş" → kısa token URL üretir.
   Müşteri /liste/[token] sayfasında aynı premium UX'le görür.

   Server bileşeni: read-only data fetch (active villas + locations).
   Filter / select / share UX'i `VillaListesiClient`'a (client) devreder.

   PRICING:
     Caller (client) tarih girdiğinde VillaCard `calculateGrandTotal`
     ile total + gece + temizlik dahil bilgisini render eder; tarih
     girmediyse `getStartingPrice` fallback'i devreye girer. Aynı
     /arama sayfası pattern'i.

   ZERO-IMPACT:
     - Booking engine, availability merge, reservation create,
       pricing engine, currency conversion DOKUNULMAZ.
     - Mevcut /arama page query'si bağımsız; bu sayfa kendi
       hafif eski sağlayıcı fetch'ini yapar (admin scope ~ az villa).
   =============================================================== */

export const dynamic = "force-dynamic";

/* Raw row shape — slim payload optimizasyonu sonrası villa kolonları
   render'da gerçekten tüketilen 13 alana indirildi (description,
   pool_*, indoor_pool_*, child_pool_*, bedroom_layout, bathroom_layout,
   youtube_videos, tourism_document_number, owner_id, commission_rate,
   deposit, rules, included_items, address, vb. — VillaCard'da
   kullanılmayan ~45 kolon artık çekilmez). villa_images embed cover-
   only (lib/db/villa.repository.ts:120-134 slim-embed pattern). */
type RawVilla = {
  id: string;
  slug: string | null;
  title: string | null;
  location_id: string | null;
  badge: string | null;
  guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  /* 🛡️ villa.price + villa.currency DB'den kaldırıldı (legacy migration —
     dashboard manuel müdahalesi; commitlenmiş SQL drop YOK). Eşdeğer veri
     villa_prices relation'ından `getStartingPrice(prices)` ile derive edilir
     (VillaListesiClient.tsx:459-466 fallback). RawVilla'da bu alanlar
     tutulmaz; mapping VillaListesiRow.price/currency = null gönderir; client
     fallback devreye girer — UI/fiyat davranışı birebir korunur. */
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  location: { name: string | null } | { name: string | null }[] | null;
  villa_images:
    | {
        image_url: string | null;
        is_cover: boolean | null;
        sort_order: number | null;
      }[]
    | null;
  villa_prices:
    | {
        price: number | null;
        currency: string | null;
        start_date: string;
        end_date: string;
      }[]
    | null;
};

export default async function VillaListesiPage() {
  /* 🛡️ SEC-01 — AUTH ÖNCE, VERİ SONRA (bkz. maki-admin/page.tsx). */
  const auth = await authorizeAdminSession();
  if (!auth.ok) return <AdminPageSessionRefresh />;

  /* 🛡️ Yetki ("villa_lists") — VERİDEN ÖNCE. Bölüm layout'u sayfanın
     server render'ını durdurmadığı için kontrol burada da yapılır. */
  const denied = await adminPermissionGate(auth.caller.id, "villa_lists");
  if (denied) return denied;

  /* Active villas + locations + categories + type relations paralel
     fetch. SELECT pattern /arama ve villaRepository.listPublic ile
     birebir aynı (yıldız + embed). */
  const [villasRes, locationsRes, typesRes, relationsRes] = await Promise.all([
    villaAdminRepository.findActiveCuratorCards(),
    villaLocationRepository.findAllForFilter(),
    villaTypeRepository.findAllIdNameBySortOrder(),
    /* villa_type_relations: M:N junction. Tüm satırları çekiyoruz —
       admin scope (varsayım: <500 villa × birkaç kategori). Client
       tarafı bunu villa.id → categoryId[] map'ine dönüştürür ve
       in-memory filter uygular. Public /arama page'i URL-driven SSR
       round-trip yapıyor; admin client-side flow için bu yeterli. */
    villaTypeRepository.findAllRelations(),
  ]);

  /* Silent failure → console'a yansıt (server log). UI tarafı boş
     state ile çökmez; ama operasyon ekibi neden boş geldiğini görür. */
  if (villasRes.error) {
    console.error(
      "[villa-listesi.fetch] villas FAILED",
      villasRes.error.message
    );
  }
  if (locationsRes.error) {
    console.error(
      "[villa-listesi.fetch] locations FAILED",
      locationsRes.error.message
    );
  }
  if (typesRes.error) {
    console.error(
      "[villa-listesi.fetch] types FAILED",
      typesRes.error.message
    );
  }
  if (relationsRes.error) {
    console.error(
      "[villa-listesi.fetch] type_relations FAILED",
      relationsRes.error.message
    );
  }

  const rawVillas: RawVilla[] = (villasRes.data || []) as RawVilla[];

  /* Normalize — VillaCard prop shape + curator selection için. */
  const villas: VillaListesiRow[] = rawVillas.map((v) => {
    /* Image cover-first sort. */
    const imgs = Array.isArray(v.villa_images) ? v.villa_images : [];
    const sortedImgs = [...imgs].sort((a, b) => {
      if (a?.is_cover) return -1;
      if (b?.is_cover) return 1;
      return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
    });
    /* 🛡️ Aşama A + bucket-fix — resolveVillaImageUrl: image_url HEM
       FULL URL (legacy) HEM relative path (yeni — Aşama B sonrası)
       olabilir. villa-images bucket'ından doğru URL üretir. */
    const images = sortedImgs
      .map((i) => resolveVillaImageUrl(i?.image_url))
      .filter(
        (u): u is string => typeof u === "string" && u.trim().length > 0
      );

    /* Location name embed (object | array | null). */
    const locName = (() => {
      const l = v.location;
      if (!l) return "";
      if (Array.isArray(l)) return l[0]?.name || "";
      return l.name || "";
    })();

    /* Stay prices — VillaCard `calculateGrandTotal` için. */
    const rawPrices = Array.isArray(v.villa_prices) ? v.villa_prices : [];
    const prices = rawPrices
      .filter(
        (p) =>
          !!p &&
          typeof p.start_date === "string" &&
          typeof p.end_date === "string" &&
          p.start_date.length > 0 &&
          p.end_date.length > 0
      )
      .map((p) => ({
        price: Number(p.price || 0),
        currency: p.currency || "TRY",
        start_date: p.start_date,
        end_date: p.end_date,
      }));

    return {
      id: v.id,
      slug: v.slug || "",
      title: v.title || "",
      location_id: v.location_id || "",
      location: locName,
      /* 🛡️ villa.price/currency DB'den kaldırıldı — top-level fiyat alanları
         null gönderiyoruz. Client (VillaListesiClient.tsx:459-466) bu durumda
         getStartingPrice(v.prices) ile villa_prices relation'ından starting
         price hesaplar; VillaCard prop kontratı korunur. */
      price: null,
      currency: null,
      images,
      badge: v.badge,
      guests: v.guests,
      bedrooms: v.bedrooms,
      bathrooms: v.bathrooms,
      cleaning_fee: Number(v.cleaning_fee || 0),
      cleaning_currency: v.cleaning_currency || "TRY",
      cleaning_limit: Number(v.cleaning_limit || 0),
      prices,
    };
  });

  const locations: LocationOption[] = ((locationsRes.data || []) as Array<{
    id: string;
    name: string | null;
    filter_group_name?: string | null;
  }>).map((l) => ({
    id: l.id,
    name: l.name || "",
    filter_group_name: l.filter_group_name ?? null,
  }));

  const categories: CategoryOption[] = ((typesRes.data || []) as Array<{
    id: string;
    name: string | null;
  }>).map((t) => ({ id: t.id, name: t.name || "" }));

  /* villa.id → categoryIds[] map. Client filter O(1) lookup. */
  const rawRelations = (relationsRes.data || []) as Array<{
    villa_id: string;
    type_id: string;
  }>;
  const villaCategoryMap: Record<string, string[]> = {};
  for (const r of rawRelations) {
    if (!r?.villa_id || !r?.type_id) continue;
    (villaCategoryMap[r.villa_id] ??= []).push(r.type_id);
  }

  return (
    <div className="space-y-8">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Pazarlama</p>
          <h1 className="admin-page-header__title">Mülk Listesi</h1>
          <p className="admin-page-header__sub">
            Müşteriye özel bir mülk seçkisi hazırla. Filtre uygula,
            beğendiklerini seç, &ldquo;Listeyi Paylaş&rdquo; ile
            paylaşılabilir bağlantı oluştur.
          </p>
        </div>
      </header>

      <VillaListesiClient
        villas={villas}
        locations={locations}
        categories={categories}
        villaCategoryMap={villaCategoryMap}
      />
    </div>
  );
}
