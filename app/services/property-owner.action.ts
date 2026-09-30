"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getPropertyOwners as getPropertyOwnersService,
  getPropertyOwnersForSelect as getPropertyOwnersForSelectService,
  addPropertyOwner as addPropertyOwnerService,
  updatePropertyOwner as updatePropertyOwnerService,
  deletePropertyOwner as deletePropertyOwnerService,
  type PropertyOwner,
  type PropertyOwnerWithCount,
  type PropertyOwnerInput,
} from "@/app/services/property-owner.service";

/* ===============================================================
   🛡️ PROPERTY OWNERS — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin client'lar (property-owners/page.tsx + villa-form/BasicInfoStep)
   → bu server action'lar → `property-owner.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function getPropertyOwnersAction(): Promise<
  PropertyOwnerWithCount[]
> {
  await requirePermission(["property_owners", "villas"]);
  return getPropertyOwnersService();
}

export async function getPropertyOwnersForSelectAction(): Promise<
  PropertyOwner[]
> {
  await requirePermission(["property_owners", "villas"]);
  return getPropertyOwnersForSelectService();
}

export async function addPropertyOwnerAction(
  input: PropertyOwnerInput
): Promise<boolean> {
  await requirePermission("property_owners");
  return addPropertyOwnerService(input);
}

export async function updatePropertyOwnerAction(
  id: string,
  input: PropertyOwnerInput
): Promise<boolean> {
  await requirePermission("property_owners");
  return updatePropertyOwnerService(id, input);
}

export async function deletePropertyOwnerAction(id: string): Promise<boolean> {
  await requirePermission("property_owners");
  return deletePropertyOwnerService(id);
}
