/* ===============================================================
   🛡️ KTB BELGE DURUM MAKİNESİ (SAF — server/client ortak)
   ===============================================================
   Kontrol sonucu (her sorgu): VALID | NOT_FOUND | INVALID | CHECK_FAILED
   Villa durumu (villa_license_states.current_status): son GÜVENİLİR
   sonuç (VALID | NOT_FOUND | INVALID) veya UNCHECKED.

   KESİN KURALLAR:
     • CHECK_FAILED current_status / previous_status / review'u
       DEĞİŞTİRMEZ; yalnız consecutive_failures artar.
     • Güvenilir sonuç geldiğinde durum değişmişse previous_status +
       status_changed_at güncellenir (tüm 3×3 geçiş izlenir).
     • NOT_FOUND ve INVALID "inceleme gerekli" işaretler; hiçbiri
       otomatik işlem (pasife alma vb.) tetiklemez.
     • Villanın belge numarası değişmişse eski numaranın durumu yeni
       numaraya TAŞINMAZ (durum sıfırdan başlar; geçmiş checks'te kalır).
=============================================================== */

export type LicenseCheckResult = "VALID" | "NOT_FOUND" | "INVALID" | "CHECK_FAILED";
export type ReliableLicenseStatus = "VALID" | "NOT_FOUND" | "INVALID";
export type LicenseCurrentStatus = ReliableLicenseStatus | "UNCHECKED";
export type LicenseReviewState = "ok" | "needs_review";

export type LicenseStateRow = {
  villa_id: string;
  document_number_normalized: string | null;
  current_status: LicenseCurrentStatus;
  previous_status: ReliableLicenseStatus | null;
  status_changed_at: string | null;
  first_valid_at: string | null;
  last_valid_at: string | null;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_result_status: LicenseCheckResult | null;
  last_reason_code: string | null;
  consecutive_failures: number;
  consecutive_not_found: number;
  consecutive_invalid: number;
  last_check_id: string | null;
  review_state: LicenseReviewState;
  review_reason: string | null;
  updated_at: string;
};

export function isReliableStatus(v: unknown): v is ReliableLicenseStatus {
  return v === "VALID" || v === "NOT_FOUND" || v === "INVALID";
}

export function emptyLicenseState(
  villaId: string,
  documentNumber: string | null,
  now: string
): LicenseStateRow {
  return {
    villa_id: villaId,
    document_number_normalized: documentNumber,
    current_status: "UNCHECKED",
    previous_status: null,
    status_changed_at: null,
    first_valid_at: null,
    last_valid_at: null,
    last_checked_at: null,
    last_success_at: null,
    last_result_status: null,
    last_reason_code: null,
    consecutive_failures: 0,
    consecutive_not_found: 0,
    consecutive_invalid: 0,
    last_check_id: null,
    review_state: "ok",
    review_reason: null,
    updated_at: now,
  };
}

export type ApplyLicenseCheckInput = {
  villaId: string;
  /** Kontrol edilen normalize numara (format dışıysa null). */
  documentNumber: string | null;
  result: LicenseCheckResult;
  reasonCode: string | null;
  checkId: string | null;
  checkedAt: string;
};

export type ApplyLicenseCheckOutput = {
  next: LicenseStateRow;
  /** Bu kontrolden ÖNCEKİ son güvenilir durum (checks.previous_status). */
  previousReliable: ReliableLicenseStatus | null;
};

export function applyLicenseCheck(
  prev: LicenseStateRow | null,
  input: ApplyLicenseCheckInput
): ApplyLicenseCheckOutput {
  const now = input.checkedAt;
  const base: LicenseStateRow =
    prev && prev.document_number_normalized === input.documentNumber
      ? { ...prev }
      : emptyLicenseState(input.villaId, input.documentNumber, now);

  const previousReliable = isReliableStatus(base.current_status)
    ? base.current_status
    : null;

  const next: LicenseStateRow = {
    ...base,
    villa_id: input.villaId,
    document_number_normalized: input.documentNumber,
    last_checked_at: now,
    last_result_status: input.result,
    last_reason_code: input.reasonCode,
    last_check_id: input.checkId,
    updated_at: now,
  };

  if (input.result === "CHECK_FAILED") {
    /* Son güvenilir durum KORUNUR. */
    next.consecutive_failures = base.consecutive_failures + 1;
    return { next, previousReliable };
  }

  const r = input.result;
  next.consecutive_failures = 0;
  next.last_success_at = now;

  if (base.current_status !== r) {
    next.previous_status = previousReliable;
    next.status_changed_at = now;
  }
  next.current_status = r;

  next.consecutive_not_found =
    r === "NOT_FOUND" ? (base.current_status === "NOT_FOUND" ? base.consecutive_not_found + 1 : 1) : 0;
  next.consecutive_invalid =
    r === "INVALID" ? (base.current_status === "INVALID" ? base.consecutive_invalid + 1 : 1) : 0;

  if (r === "VALID") {
    next.first_valid_at = base.first_valid_at ?? now;
    next.last_valid_at = now;
    next.review_state = "ok";
    next.review_reason = null;
  } else if (r === "NOT_FOUND") {
    next.review_state = "needs_review";
    next.review_reason = base.first_valid_at ? "not_found_after_valid" : "not_found";
  } else {
    next.review_state = "needs_review";
    next.review_reason = "invalid";
  }

  return { next, previousReliable };
}

/* ---------------------------------------------------------------
   UI METİNLERİ
   --------------------------------------------------------------- */
export const LICENSE_STATUS_LABEL: Record<LicenseCurrentStatus | "CHECK_FAILED", string> = {
  VALID: "Geçerli",
  INVALID: "İptal / Geçersiz",
  NOT_FOUND: "Bulunamadı",
  CHECK_FAILED: "Kontrol Edilemedi",
  UNCHECKED: "Kontrol edilmedi",
};

/** Güvenilir iki durum arasındaki geçiş mesajı (aynıysa null). */
export function licenseTransitionMessage(
  from: ReliableLicenseStatus | null,
  to: LicenseCurrentStatus
): string | null {
  if (!from || !isReliableStatus(to) || from === to) return null;
  const key = `${from}->${to}`;
  const map: Record<string, string> = {
    "VALID->NOT_FOUND": "Önceden geçerliydi, şimdi KTB'de bulunamadı",
    "VALID->INVALID": "Önceden geçerliydi, şimdi iptal/geçersiz görünüyor",
    "INVALID->VALID": "Belge tekrar geçerli oldu",
    "INVALID->NOT_FOUND": "İptal/geçersizdi, şimdi KTB'de bulunamadı",
    "NOT_FOUND->VALID": "Belge tekrar bulundu/geçerli",
    "NOT_FOUND->INVALID": "Bulunamıyordu, şimdi iptal/geçersiz görünüyor",
  };
  return map[key] ?? null;
}

export const LICENSE_REVIEW_REASON_LABEL: Record<string, string> = {
  not_found_after_valid: "Önceden geçerliydi, şimdi KTB'de bulunamadı",
  not_found: "KTB'de kayıt bulunamadı — belge numarasını kontrol edin",
  invalid: "KTB kaydı iptal/geçersiz görünüyor",
};

export const LICENSE_REASON_LABEL: Record<string, string> = {
  unsupported_format: "Belge numarası desteklenmeyen formatta",
  parser_unverified: "KTB ayrıştırıcısı henüz doğrulanmadı",
  timeout: "KTB zaman aşımı",
  network_error: "KTB'ye bağlanılamadı",
  http_403: "KTB erişimi reddetti (403)",
  http_429: "KTB istek sınırı (429)",
  http_5xx: "KTB sunucu hatası (5xx)",
  redirect: "KTB beklenmeyen yönlendirme",
  unexpected_content_type: "KTB beklenmeyen yanıt türü",
  response_too_large: "KTB yanıtı çok büyük",
  html_changed: "KTB sayfa yapısı beklenenden farklı",
  query_mismatch: "KTB yanıtı sorgulanan numaraya ait değil",
  unknown_fields: "KTB kaydında tanınmayan alan var",
  unexpected_entries: "KTB filtresiz liste döndürdü",
  ambiguous_result: "KTB'de birebir eşleşen belge numarası yok",
  captcha: "KTB doğrulama/engel sayfası",
  reused_recent_result: "Yakın zamanda kontrol edildi (tekrar sorgulanmadı)",
};
