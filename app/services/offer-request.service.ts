import { offerRequestRepository } from "@/lib/db/offer-request.repository";
import type {
  OfferRequestRow,
  OfferRequestStatus,
} from "@/types/database";

/* ===============================================================
   🛡️ FAZ 40 — OFFER REQUEST SERVICE
   ===============================================================
   /teklif-al public form submit + /maki-admin/offer-requests
   moderation.

   PATTERN:
     - Public (anon): createOfferRequest → RLS anon insert
     - Admin (authenticated): getOfferRequests / getById /
       updateStatus → RLS authenticated CRUD
     - Result<T> shape (mevcut FAZ pattern parity)
   =============================================================== */

export type OfferRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export type OfferRequestResultWithId =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type CreateOfferRequestInput = {
  travel_group?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  adults?: number;
  children?: number;
  region_tokens?: string[];
  villa_type_tokens?: string[];
  feature_tokens?: string[];
  budget_min?: number | null;
  budget_max?: number | null;
  budget_currency?: string;
  full_name: string;
  phone: string;
  email?: string | null;
  note?: string | null;
};

const MAX_NAME = 120;
const MAX_PHONE = 40;
const MAX_EMAIL = 160;
const MAX_NOTE = 2000;
const MAX_TOKEN_ARR = 30;

function sanitize(raw: string | null | undefined): string {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

function sanitizeMultiline(raw: string | null | undefined): string {
  return String(raw || "").trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function pruneTokens(arr: string[] | undefined): string[] {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(
      arr.filter(
        (s): s is string => typeof s === "string" && s.trim().length > 0
      )
    )
  ).slice(0, MAX_TOKEN_ARR);
}

/* ===============================================================
   PUBLIC WRITE — guest form submit
=============================================================== */
export async function createOfferRequest(
  input: CreateOfferRequestInput
): Promise<OfferRequestResultWithId> {
  const fullName = sanitize(input.full_name);
  if (fullName.length < 2 || fullName.length > MAX_NAME) {
    return { ok: false, error: "Lütfen geçerli bir ad soyad girin." };
  }
  const phone = sanitize(input.phone);
  if (phone.length < 6 || phone.length > MAX_PHONE) {
    return { ok: false, error: "Lütfen geçerli bir telefon numarası girin." };
  }
  const email = input.email ? sanitize(input.email) : null;
  if (email && email.length > MAX_EMAIL) {
    return { ok: false, error: "E-posta çok uzun." };
  }
  const note = input.note ? sanitizeMultiline(input.note) : null;
  if (note && note.length > MAX_NOTE) {
    return { ok: false, error: "Not çok uzun (maks. 2000 karakter)." };
  }

  const adults =
    typeof input.adults === "number" && Number.isFinite(input.adults)
      ? Math.max(1, Math.min(40, Math.floor(input.adults)))
      : 1;
  const children =
    typeof input.children === "number" && Number.isFinite(input.children)
      ? Math.max(0, Math.min(20, Math.floor(input.children)))
      : 0;

  const budgetMin =
    typeof input.budget_min === "number" && Number.isFinite(input.budget_min)
      ? Math.max(0, Math.floor(input.budget_min))
      : null;
  const budgetMax =
    typeof input.budget_max === "number" && Number.isFinite(input.budget_max)
      ? Math.max(0, Math.floor(input.budget_max))
      : null;

  /* 🛡️ FAZ 46 — CANONICAL SCHEMA WRITE
     Migration 022'nin canonical isimleri tek source of truth.
     FAZ 45'teki paralel mirror write kaldırıldı (alias kolonları
     migration 025 ile drop edildi). */
  const insertPayload = {
    travel_group: input.travel_group ? sanitize(input.travel_group) : null,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    adults,
    children,
    region_tokens: pruneTokens(input.region_tokens),
    villa_type_tokens: pruneTokens(input.villa_type_tokens),
    feature_tokens: pruneTokens(input.feature_tokens),
    budget_min: budgetMin,
    budget_max: budgetMax,
    budget_currency: input.budget_currency || "TRY",
    full_name: fullName,
    phone,
    email,
    note,
    status: "pending" as const,
  };

  /* 🛡️ FAZ 47 — DIAGNOSTIC ECHO
     INSERT sonrası tüm kanonik kolonları geri çek; eğer DB'ye yazılan
     değer payload'tan farklıysa (örn. kolon yok, default override, vs.)
     console'a net bir uyumsuzluk raporu düşür. Production'da side-effect
     yok — sadece anormal durumda log. */
  const { data, error } = await offerRequestRepository.create(insertPayload);

  if (error || !data) {
    console.error("[offerRequest.create] FAILED", {
      message: error?.message,
      details: (error as { details?: string } | null)?.details,
      hint: (error as { hint?: string } | null)?.hint,
      sentPayload: insertPayload,
    });
    return {
      ok: false,
      error: "Talebiniz kaydedilemedi. Lütfen tekrar deneyin.",
    };
  }

  /* Echo-back diff check — eğer canonical kolon mismatch varsa görünür ol. */
  const row = data as {
    id: string;
    adults: number | null;
    children: number | null;
    region_tokens: string[] | null;
    villa_type_tokens: string[] | null;
    feature_tokens: string[] | null;
    budget_min: number | null;
    budget_max: number | null;
  };
  const mismatch: string[] = [];
  if (row.adults !== insertPayload.adults) mismatch.push("adults");
  if (row.children !== insertPayload.children) mismatch.push("children");
  if ((row.region_tokens?.length ?? 0) !== insertPayload.region_tokens.length)
    mismatch.push("region_tokens");
  if (
    (row.villa_type_tokens?.length ?? 0) !==
    insertPayload.villa_type_tokens.length
  )
    mismatch.push("villa_type_tokens");
  if ((row.feature_tokens?.length ?? 0) !== insertPayload.feature_tokens.length)
    mismatch.push("feature_tokens");
  if (row.budget_min !== insertPayload.budget_min) mismatch.push("budget_min");
  if (row.budget_max !== insertPayload.budget_max) mismatch.push("budget_max");
  if (mismatch.length > 0) {
    console.warn("[offerRequest.create] CANONICAL_MISMATCH", {
      mismatchedColumns: mismatch,
      sent: {
        adults: insertPayload.adults,
        children: insertPayload.children,
        region_tokens: insertPayload.region_tokens,
        villa_type_tokens: insertPayload.villa_type_tokens,
        feature_tokens: insertPayload.feature_tokens,
        budget_min: insertPayload.budget_min,
        budget_max: insertPayload.budget_max,
      },
      stored: {
        adults: row.adults,
        children: row.children,
        region_tokens: row.region_tokens,
        villa_type_tokens: row.villa_type_tokens,
        feature_tokens: row.feature_tokens,
        budget_min: row.budget_min,
        budget_max: row.budget_max,
      },
    });
  }

  return { ok: true, id: String(row.id) };
}

/* ===============================================================
   ADMIN READ — listing
=============================================================== */
export async function getOfferRequests(): Promise<OfferRequestRow[]> {
  const { data, error } = await offerRequestRepository.findAll();

  if (error) {
    console.error("[offerRequest.list] FAILED", error.message);
    return [];
  }
  return (data || []) as OfferRequestRow[];
}

export async function getOfferRequestById(
  id: string
): Promise<OfferRequestRow | null> {
  if (!id) return null;
  const { data, error } = await offerRequestRepository.findById(id);
  if (error) {
    console.error("[offerRequest.getById] FAILED", error.message);
    return null;
  }
  return (data as OfferRequestRow | null) || null;
}

/* ===============================================================
   ADMIN UPDATE — status transitions
=============================================================== */
const VALID_STATUSES: OfferRequestStatus[] = [
  "pending",
  "contacted",
  "offered",
  "closed",
];

export async function updateOfferRequestStatus(
  id: string,
  status: OfferRequestStatus
): Promise<OfferRequestResult> {
  if (!id) return { ok: false, error: "ID gerekli" };
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: "Geçersiz durum" };
  }
  const { error } = await offerRequestRepository.updateById(id, {
    status,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[offerRequest.updateStatus] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteOfferRequest(
  id: string
): Promise<OfferRequestResult> {
  if (!id) return { ok: false, error: "ID gerekli" };
  const { error } = await offerRequestRepository.deleteById(id);
  if (error) {
    console.error("[offerRequest.delete] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* NOT: `OFFER_STATUS_LABEL` (UI-facing sabit) client-safe modüle taşındı:
   app/(admin)/maki-admin/offer-requests/offer-request-labels.ts.
   Bu service native repo (server-only) import ettiği için client bundle'a
   sızmamalı; sabit ayrı client-safe dosyada. */
