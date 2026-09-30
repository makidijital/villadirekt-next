import type { VillaFormData } from "../_types/villa-form-data";

/* ===============================================================
   🛡️ FAZ 2 — VILLA FORM VALIDATION HELPERS (PURE)
   ===============================================================
   Eski:
     - ekle/handleCreate: `if (!form.title || !selectedLocation) →
       toast.error("Villa adı ve bölge zorunlu")`
     - ekle/goNext step 1: aynı kural, ayrı toast'larla:
         - `if (!form.title) → toast.error("Villa adı zorunlu")`
         - `if (!selectedLocation) → toast.error("Bölge zorunlu")`
     - [id]/handleUpdate: `if (!form.title) → toast.error("Villa adı zorunlu")`

   BYTE-IDENTICAL kural matrisleri:
     - Create submit: title + location her ikisi de zorunlu, tek toast
     - Create step 1 navigation: title VE location zorunlu, ayrı toast'lar
     - Edit submit: yalnız title zorunlu (location DB'den yüklü)

   ⚠️ KESIN KURAL:
     - Toast mesajları BYTE-IDENTICAL (case-sensitive, accent-sensitive).
     - Order of checks AYNEN (goNext: title FIRST, location SECOND).

   PURE: input alır, ValidationOutcome döner. Toast dispatch caller'da.
=============================================================== */

/** Validation sonucu — ok: true ise hata yok; ok: false ise tek
 *  hata mesajı + (opsiyonel) hata key'i. Caller toast.error() çağırır. */
export type VillaValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/* ---------------------------------------------------------------
   ekle/handleCreate guard (submit) — title + location, tek mesaj
=============================================================== */
export type ValidateVillaCreateInput = {
  form: Pick<VillaFormData, "title">;
  selectedLocation: string;
};

export function validateVillaCreate(
  input: ValidateVillaCreateInput
): VillaValidationResult {
  if (!input.form.title || !input.selectedLocation) {
    return { ok: false, message: "Villa adı ve bölge zorunlu" };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------
   ekle/goNext step 1 — title + location, AYRI mesajlar (sırası ÖNEMLİ)
=============================================================== */
export function validateVillaCreateStep1(
  input: ValidateVillaCreateInput
): VillaValidationResult {
  /* Order aynen: title FIRST, location SECOND. */
  if (!input.form.title) {
    return { ok: false, message: "Villa adı zorunlu" };
  }
  if (!input.selectedLocation) {
    return { ok: false, message: "Bölge zorunlu" };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------
   [id]/handleUpdate guard — yalnız title (location DB'den)
=============================================================== */
export type ValidateVillaUpdateInput = {
  form: Pick<VillaFormData, "title">;
};

export function validateVillaUpdate(
  input: ValidateVillaUpdateInput
): VillaValidationResult {
  if (!input.form.title) {
    return { ok: false, message: "Villa adı zorunlu" };
  }
  return { ok: true };
}
