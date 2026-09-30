"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  listDiscountCollection as listDiscountCollectionService,
  addToDiscountCollection as addToDiscountCollectionService,
  removeFromDiscountCollection as removeFromDiscountCollectionService,
  toggleDiscountCollectionActive as toggleDiscountCollectionActiveService,
  updateDiscountCollectionItem as updateDiscountCollectionItemService,
  reorderDiscountCollection as reorderDiscountCollectionService,
  type DiscountCollectionItem,
  type SelectedDiscountRange,
} from "@/app/services/discount-collection.service";
/* 🛡️ MIGRATION 092 — indirim dönemi seçim listesi. MEVCUT server-only
   repository metodu (`findDiscountsByVillaId`) yeniden kullanılır; yeni
   repository/servis/RPC OLUŞTURULMADI. */
import { villaDiscountRepository } from "@/lib/db/villa-discount.repository.server";

/* ===============================================================
   🛡️ DISCOUNT COLLECTION — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `discount-collection/page.tsx` (client) → bu server action'lar →
   `discount-collection.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function listDiscountCollectionAction(): Promise<
  DiscountCollectionItem[]
> {
  await requirePermission("discount_collection");
  return listDiscountCollectionService();
}

export async function addToDiscountCollectionAction(
  villaId: string
): Promise<boolean> {
  await requirePermission("discount_collection");
  return addToDiscountCollectionService(villaId);
}

export async function removeFromDiscountCollectionAction(
  id: string
): Promise<boolean> {
  await requirePermission("discount_collection");
  return removeFromDiscountCollectionService(id);
}

export async function toggleDiscountCollectionActiveAction(
  id: string,
  isActive: boolean
): Promise<boolean> {
  await requirePermission("discount_collection");
  return toggleDiscountCollectionActiveService(id, isActive);
}

export async function updateDiscountCollectionItemAction(
  id: string,
  patch: {
    custom_title?: string | null;
    custom_cover_image?: string | null;
    /* 🛡️ MIGRATION 092 — küratörlük seçimi (villa_discounts'a DOKUNMAZ). */
    selected_discount_ranges?: SelectedDiscountRange[] | null;
  }
): Promise<boolean> {
  await requirePermission("discount_collection");
  return updateDiscountCollectionItemService(id, patch);
}

export async function reorderDiscountCollectionAction(
  orderedIds: string[]
): Promise<boolean> {
  await requirePermission("discount_collection");
  return reorderDiscountCollectionService(orderedIds);
}

/* ===============================================================
   🛡️ MIGRATION 092 — VİLLA İNDİRİM DÖNEMLERİ (seçim listesi)
   ===============================================================
   Admin koleksiyon satırındaki "İndirim dönemleri" checkbox listesini
   doldurur. SALT OKUMA — hiçbir yazma yapmaz.

   ⚠️ NEDEN AYRI ACTION (mevcut `loadDiscountData` yerine):
     `app/components/admin/villa/discount.action.ts > loadDiscountData`
     `requirePermission("villas")` ister. Bu ekranın yetki anahtarı ise
     `discount_collection` — yalnız o yetkiye sahip bir admin
     `loadDiscountData`'yı çağırsa 403 alırdı. Bu action AYNI, MEVCUT
     repository metodunu bu ekranın kendi yetkisiyle okur; yeni
     repository/servis/sorgu OLUŞTURULMADI ve `loadDiscountData`'ya
     DOKUNULMADI.

   Sıralama `start_date` ASC — public tarafın (`cache.helpers >
   visibleDiscounts`) ve admin fiyat ekranının kullandığı sıra ile aynı.
   Tarih filtresi YOK: geçmiş kayıtlar zaten cleanup cron tarafından
   siliniyor; burada ek bir iş kuralı İCAT EDİLMEZ.
   =============================================================== */
export type VillaDiscountPeriodOption = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency: string | null;
};

export async function listVillaDiscountPeriodsAction(
  villaId: string
): Promise<VillaDiscountPeriodOption[]> {
  await requirePermission("discount_collection");
  const { data, error } =
    await villaDiscountRepository.findDiscountsByVillaId(villaId);
  if (error) {
    console.error("❌ listVillaDiscountPeriodsAction:", error.message);
    return [];
  }
  return (data || [])
    .map((r) => ({
      start_date: String(r.start_date ?? "").slice(0, 10),
      end_date: String(r.end_date ?? "").slice(0, 10),
      discount_type: (r.discount_type === "fixed" ? "fixed" : "percent") as
        | "percent"
        | "fixed",
      discount_value: Number(r.discount_value ?? 0),
      currency: r.currency ?? null,
    }))
    .filter((r) => r.start_date.length === 10 && r.end_date.length === 10)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}
