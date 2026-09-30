/* 🛡️ Payment Migration WU-P5A — anon `payment.repository` (dbNative)
   yerine native `payment.repository.server` (WU-P5 twin'leri: 6 western_union
   metodu). Service WU-B1 sonrası hiçbir client tarafından runtime import
   edilmiyor (yalnız server action + type-only) → server-only native repo
   güvenli. Call-site'lar aynı (paymentServerRepository → paymentRepository
   alias). Return contract / exception flow / single-active orchestration
   AYNEN. */
import { paymentServerRepository as paymentRepository } from "@/lib/db/payment.repository.server";
import type { WesternUnionAccount } from "@/lib/western-union-account.helper";

/* ===============================================================
   🔥 WESTERN UNION ACCOUNT SERVICE — CRUD + single-active
   ===============================================================
   payment-account.service.ts ile BİREBİR aynı pattern; tablo
   `western_union_accounts`. EFT/Havale akışına SIFIR temas.
     - Single-active: aynı anda tek kayıt is_active=true.
     - Result envelope `{ ok, id?, error? }`.
   =============================================================== */

export type WesternUnionAccountInput = {
  recipient_name: string;
  country?: string | null;
  city?: string | null;
  phone?: string | null;
  instructions?: string | null;
  is_active?: boolean;
};

const trim = (v: unknown): string => (v ?? "").toString().trim();

/* ----- LIST ----- */
export async function getWesternUnionAccounts(): Promise<WesternUnionAccount[]> {
  const { data, error } = await paymentRepository.findWesternUnionAccounts();
  if (error) {
    console.error("[western_union.list] FAILED", error.message);
    return [];
  }
  return (data || []) as WesternUnionAccount[];
}

/* ----- CREATE ----- */
export async function createWesternUnionAccount(
  input: WesternUnionAccountInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const payload = {
    recipient_name: trim(input.recipient_name),
    country: trim(input.country) || null,
    city: trim(input.city) || null,
    phone: trim(input.phone) || null,
    instructions: trim(input.instructions) || null,
    is_active: !!input.is_active,
  };

  const { data, error } =
    await paymentRepository.insertWesternUnionAccount(payload);

  if (error) {
    console.error("[western_union.create] FAILED", error.message);
    return { ok: false, error: error.message };
  }

  if (payload.is_active && data?.id) {
    await deactivateOthers(data.id as string);
  }

  return { ok: true, id: data?.id as string };
}

/* ----- UPDATE ----- */
export async function updateWesternUnionAccount(
  id: string,
  input: Partial<WesternUnionAccountInput>
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };

  const payload: Record<string, unknown> = {};
  if (input.recipient_name !== undefined)
    payload.recipient_name = trim(input.recipient_name);
  if (input.country !== undefined)
    payload.country = trim(input.country) || null;
  if (input.city !== undefined) payload.city = trim(input.city) || null;
  if (input.phone !== undefined) payload.phone = trim(input.phone) || null;
  if (input.instructions !== undefined)
    payload.instructions = trim(input.instructions) || null;
  if (input.is_active !== undefined) payload.is_active = !!input.is_active;

  const { error } = await paymentRepository.updateWesternUnionAccountById(
    id,
    payload
  );

  if (error) {
    console.error("[western_union.update] FAILED", error.message);
    return { ok: false, error: error.message };
  }

  if (input.is_active === true) {
    await deactivateOthers(id);
  }

  return { ok: true };
}

/* ----- DELETE ----- */
export async function deleteWesternUnionAccount(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };

  const { error } =
    await paymentRepository.deleteWesternUnionAccountById(id);

  if (error) {
    console.error("[western_union.delete] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* ----- SET ACTIVE ----- */
export async function setActiveWesternUnionAccount(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };

  const { error: e1 } =
    await paymentRepository.setWesternUnionAccountActive(id);

  if (e1) {
    console.error("[western_union.setActive] FAILED", e1.message);
    return { ok: false, error: e1.message };
  }

  const res = await deactivateOthers(id);
  if (res.error) return { ok: false, error: res.error };
  return { ok: true };
}

/* ----- INTERNAL: diğer kayıtları pasifleştir ----- */
async function deactivateOthers(
  keepId: string
): Promise<{ error?: string }> {
  const { error } =
    await paymentRepository.deactivateOtherWesternUnionAccounts(keepId);

  if (error) {
    console.error("[western_union.deactivateOthers] FAILED", error.message);
    return { error: error.message };
  }
  return {};
}
