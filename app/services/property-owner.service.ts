import { propertyOwnerRepository } from "@/lib/db/property-owner.repository";

/* ===============================================================
   🔥 PROPERTY OWNERS — MİNİMAL CRUD (mülk sahipleri)
   ===============================================================
   Tablo: property_owners (id, first_name, last_name, phone, email,
   iban, created_at). Villa bağlantısı: villa.owner_id nullable FK.

   ⚠️ admin-only RLS (migration 044). Veri erişimi propertyOwnerRepository
   (→ DbProvider `db`, anon client) üzerinden; admin login sonrası
   authenticated session ile çalışır → is_active_admin() policy match →
   CRUD izinli. (Phase 1 repo consolidation; RLS/davranış AYNEN.)

   KAPSAM: yalnız CRUD + villa sayısı. CRM/ödeme/hakediş/not YOK.
   =============================================================== */

export type PropertyOwner = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  iban: string | null;
  created_at?: string;
};

export type PropertyOwnerWithCount = PropertyOwner & {
  villa_count: number;
};

export type PropertyOwnerInput = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  iban: string | null;
};

/* 📦 LİSTE — owner'lar + her owner'ın villa sayısı (N+1 yok: 2 sorgu + JS merge). */
export async function getPropertyOwners(): Promise<
  PropertyOwnerWithCount[]
> {
  const [ownersRes, villaRes] = await Promise.all([
    propertyOwnerRepository.findAll(),
    /* villa public-read; yalnız owner_id kolonu (PII değil) — sayım için. */
    propertyOwnerRepository.findLinkedVillaOwnerIds(),
  ]);

  if (ownersRes.error) {
    console.error("❌ getPropertyOwners:", ownersRes.error.message);
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of (villaRes.data as Array<{ owner_id: string | null }> | null) ||
    []) {
    const oid = row.owner_id;
    if (oid) counts.set(oid, (counts.get(oid) || 0) + 1);
  }

  return ((ownersRes.data as PropertyOwner[] | null) || []).map((o) => ({
    ...o,
    villa_count: counts.get(o.id) || 0,
  }));
}

/* ➕ OLUŞTUR */
export async function addPropertyOwner(
  input: PropertyOwnerInput
): Promise<boolean> {
  const { error } = await propertyOwnerRepository.insert({
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone,
    email: input.email,
    iban: input.iban,
  });
  if (error) {
    console.error("❌ addPropertyOwner:", error.message);
    return false;
  }
  return true;
}

/* ✏️ GÜNCELLE */
export async function updatePropertyOwner(
  id: string,
  input: PropertyOwnerInput
): Promise<boolean> {
  const { error } = await propertyOwnerRepository.updateById(id, {
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone,
    email: input.email,
    iban: input.iban,
  });
  if (error) {
    console.error("❌ updatePropertyOwner:", error.message);
    return false;
  }
  return true;
}

/* 🗑️ SİL — villa.owner_id on delete SET NULL ile otomatik kopar (villa silinmez). */
export async function deletePropertyOwner(id: string): Promise<boolean> {
  const { error } = await propertyOwnerRepository.deleteById(id);
  if (error) {
    console.error("❌ deletePropertyOwner:", error.message);
    return false;
  }
  return true;
}

/* 📋 SELECT için hafif liste (villa edit dropdown'ı) — sayım olmadan. */
export async function getPropertyOwnersForSelect(): Promise<
  PropertyOwner[]
> {
  const { data, error } = await propertyOwnerRepository.findAllForSelect();
  if (error) {
    console.error("❌ getPropertyOwnersForSelect:", error.message);
    return [];
  }
  return (data as PropertyOwner[] | null) || [];
}
