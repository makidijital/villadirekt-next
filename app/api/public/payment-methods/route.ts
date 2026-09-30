import { NextResponse } from "next/server";

/* 🛡️ Payment Migration P17 — anon `payment.repository` (dbNative)
   yerine native `payment.repository.server` (P16.5 twin: findPaymentMethodsPublic,
   order'sız `SELECT *`). Route server-only API handler (`"use client"` yok) →
   server-only native repo güvenli. RLS: payment_methods read policy `using(true)`
   (migration 037) koşulsuz → native RLS-free okuma anon ile aynı satır/kolon
   döndürür → veri paritesi korunur. Call-site aynı (alias). HTTP contract AYNEN. */
import { paymentServerRepository as paymentRepository } from "@/lib/db/payment.repository.server";

/* 🛡️ MIGRATION 088 — ADDITIVE çoklu dil. `name` alanı AYNEN korunur
   (bu route'u public rezervasyon formu VE admin rezervasyon oluşturma
   ekranı birlikte kullanıyor; ayrıca canonical `name`
   `lib/payment-link.helper.ts > isWesternUnionMethod` tarafından da
   okunuyor). Cevaba YALNIZ `name_by_locale` EKLENİR. */
import { getCachedSettings } from "@/lib/cache.helpers";
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { getPaymentMethodNamesByLocale } from "@/lib/i18n/get-payment-method-translations.server";

/* ===============================================================
   🛡️ /api/public/payment-methods — PUBLIC PAYMENT METHODS
   ===============================================================
   GET → payment_methods rows (select="*") public booking form'u için.

   AUTH: PUBLIC. Anon db client kullanılır — RLS bu tabloda anon
   read'i hangi alanlar için açtıysa AYNI semantic'le filtrelenir
   (eski client-side `db.from("payment_methods").select("*")`
   ile birebir). service_role KULLANILMAZ; aksi halde RLS bypass
   olur ve admin-only alanlar sızabilir.

   FAZ 2 frontend purge — public ReservationForm bu route'u
   kullanır. Davranış BYTE-IDENTICAL: aynı select shape, aynı RLS
   bağlamı, aynı tablo erişimi.

   🛡️ MIGRATION 088 — ADDITIVE: her satıra `name_by_locale` eklenir
   (`{ en?, de? }`; boş/whitespace çeviriler haritaya girmez). MEVCUT
   ALANLARIN HİÇBİRİ DEĞİŞTİRİLMEZ/KALDIRILMAZ — özellikle `name`
   canonical TR değeri olarak AYNEN döner. Tüketici tarafta görünen
   etiket `resolveTaxonomyName(name, name_by_locale, locale)` ile
   çözülür (admin rezervasyon ekranı bu alanı hiç okumaz → davranışı
   DEĞİŞMEZ).

   SORGU SAYISI: `multilingual_enabled = false` iken çeviri sorgusu HİÇ
   atılmaz (bugünkü davranış birebir). Açıkken locale başına TEK batch
   `.in()` sorgusu (en + de, paralel) — kayıt başına sorgu YOK.
   Çeviri okuma hatası cevabı BOZMAZ (fail-soft → boş harita).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { data, error } = await paymentRepository.findPaymentMethodsPublic();

  if (error) {
    /* Eski client davranışı: hata fırlatılmaz, sadece state boş kalır
       (`setPaymentMethods(data || [])`). Route da aynı davranışı
       koruyor — 200 + empty array (caller hata göstermez). */
    console.error("[public.payment-methods] FAILED", error.message);
    return NextResponse.json({ ok: true, payment_methods: [] });
  }

  const rows = data || [];

  /* 🛡️ ADDITIVE ÇOKLU DİL — `name` alanına DOKUNULMAZ. */
  const namesByLocale = await resolvePaymentMethodNames(rows);

  return NextResponse.json({
    ok: true,
    payment_methods: rows.map((row) => ({
      ...row,
      name_by_locale:
        namesByLocale[String((row as { id?: unknown }).id ?? "")] || {},
    })),
  });
}

/* Fail-soft: çeviri katmanındaki herhangi bir sorun public rezervasyon
   formunu ÇÖKERTMEZ — boş harita döner, tüketici TR'ye düşer. */
async function resolvePaymentMethodNames(
  rows: readonly Record<string, unknown>[]
) {
  try {
    const settings = await getCachedSettings().catch(() => null);
    if (!isMultilingualEnabled(settings)) return {};

    const ids = rows
      .map((row) => String(row?.id ?? ""))
      .filter((id) => id.length > 0);

    return await getPaymentMethodNamesByLocale(ids);
  } catch {
    return {};
  }
}
