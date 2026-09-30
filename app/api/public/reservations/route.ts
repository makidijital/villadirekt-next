import { NextResponse } from "next/server";

import { createReservation } from "@/app/services/reservation.service";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { verifyPublicReservationPrice } from "@/app/services/reservation/_helpers/price-verify";
import { verifyPublicReservationStayRules } from "@/app/services/reservation/_helpers/stay-verify";
import { validatePublicReservationDates } from "@/app/services/reservation/_helpers/date-verify";
import { applyRateLimit } from "@/lib/rate-limit";
/* 🛡️ Uluslararası telefon — TR-only regex KALDIRILDI. Yeni kütüphane YOK. */
import {
  normalizePhone,
  isValidInternationalPhone,
} from "@/lib/phone.helper";
import type { ReservationCreateInput } from "@/app/services/reservation/types";

/* ===============================================================
   🛡️ POST /api/public/reservations — PUBLIC BOOKING CREATE (server)
   ===============================================================
   AMAÇ:
     Public rezervasyon CREATE'i client-side anon yerine SERVER'da
     service_role ile yapar. reservations PHASE 3 (migration 040)
     admin-only RLS sonrası anon INSERT reddedilir; bu route
     `reservationServerRepository` (service_role) ile insert eder →
     RLS bypass + `.insert().select().single()` RETURNING görünür.

   FLOW (createReservation orchestrator BYTE-IDENTICAL):
     - validation (5 throw) — server'da
     - conflict fast-path → check_villa_availability_conflict RPC
     - commission snapshot → villa public read
     - INSERT → service_role (injected)
     - EXCLUDE constraint 23P01 → mapInsertError → "Bu tarihler dolu"

   GÜVENLİK:
     - Yalnız `{ id, reservation_no }` döner — PII (name/phone/email/
       price/commission/payload) RESPONSE'a ASLA girmez.
     - Rate-limit: "availability" bucket (30/dk/IP) — bot/abuse koruması.
     - service_role yalnız server; client'a sızmaz.

   CALLER:
     - app/components/reservation/ReservationForm.tsx (fetch POST)
   =============================================================== */

export async function POST(req: Request): Promise<Response> {
  /* Rate-limit — dedicated "reservation" bucket (3/10dk/IP); booking
     CREATE düşük frekanslı, availability okumalarından izole. */
  const limited = await applyRateLimit(req, "reservation");
  if (limited) return limited;

  let body: ReservationCreateInput;
  try {
    body = (await req.json()) as ReservationCreateInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  /* ═══════════════════════════════════════════════════════════
     🛡️ İKİ TELEFON ZORUNLU — SUNUCU TARAFI ENFORCEMENT
     ═══════════════════════════════════════════════════════════
     Frontend validation'a GÜVENİLMEZ: bu route'a doğrudan istek
     atılsa bile iki telefon da zorunlu ve uluslararası E.164
     kuralına uygun olmalı. Normalize edilmiş değer body'ye geri
     yazılır → DB'ye her zaman "+ülke kodu + rakamlar" saklanır,
     ülke kodu kaybolmaz.

     ⚠️ Bu guard YALNIZ PUBLIC route'tadır. `createReservation`
       service'i admin ile ORTAK olduğu için oraya konulmadı —
       admin tarafında phone2 opsiyoneldir ve eski kayıtlar
       düzenlenebilir kalır. */
  {
    const p1 = normalizePhone(body?.phone);
    const p2 = normalizePhone(body?.phone2);
    if (!p1 || !isValidInternationalPhone(p1)) {
      return NextResponse.json(
        { ok: false, error: "Geçerli bir telefon numarası gir" },
        { status: 400 }
      );
    }
    if (!p2 || !isValidInternationalPhone(p2)) {
      return NextResponse.json(
        { ok: false, error: "Geçerli bir ikinci telefon numarası gir" },
        { status: 400 }
      );
    }
    body.phone = p1;
    body.phone2 = p2;
  }

  /* 🛡️ SEC-06 F1 — SIKI TARİH DOĞRULAMASI (fiyat hesabından ÖNCE).
     Yalnız "YYYY-MM-DD" + gerçek takvim günü + en az 1 gece; tamamı
     geçmişte kalan konaklama reddedilir. Otomatik parse YOK. Mevcut
     datepicker/link akışları zaten bu biçimi üretir → etkilenmez.
     Hata zarfı ({ ok:false, error }, 400) mevcut catch ile AYNI. */
  {
    const dateError = validatePublicReservationDates(
      body?.start_date,
      body?.end_date
    );
    if (dateError) {
      console.error("[api.public.reservations] create FAILED:", dateError);
      return NextResponse.json(
        { ok: false, error: dateError },
        { status: 400 }
      );
    }
  }

  /* 🛡️ SEC-06 F2 — `paid_amount` ASLA client'tan alınmaz. Public
     rezervasyon her zaman ödenmemiş (pending) başlar; tahsilat admin
     tarafından sonradan işlenir. Client zaten 0 gönderiyor
     (buildPublicReservationPayload) ve payload builder'ın alan yokken
     yazdığı değer de 0 → meşru akış için sonuç BİREBİR aynı. */
  body.paid_amount = 0;

  /* 🛡️ SERVER-SIDE PRICE VERIFY + FAZ 3 SERVER-AUTHORITATIVE OVERRIDE.
     Client'ın gönderdiği finansal alanları (total_price / total_price_try /
     original_price / original_currency / exchange_rate / original_cleaning_fee /
     original_cleaning_currency / cleaning_fee_try / prepayment_amount /
     remaining_payment) sunucuda MEVCUT price engine + villa_prices +
     villa_discounts ile yeniden hesaplanır. `comparison` HÂLÂ yalnız
     COMPARE/LOG (drift'i loglar, ASLA booking'i bloklamaz/throw etmez —
     davranış DEĞİŞMEDİ). Asıl güvenlik enforcement'ı YENİ `authoritative`
     alanı ÜZERİNDEN: doluysa (server recompute başarılıysa) `body`'nin
     ilgili finansal alanları server-authoritative değerlerle OVERRIDE
     edilir — pool heating'in ZATEN VAR OLAN 4-kolon override desenini
     BİREBİR TEKRARLAR, yalnız kapsam finansal alanlara genişletildi.
     🛡️ SEC-06 F5: Recompute başarısızsa artık FAIL-CLOSED — aşağıdaki
     try bloğunda rezervasyon reddedilir (client tutarlarına düşülmez).

     🛡️ HAVUZ ISITMA — 6. adım: EXPLICIT ENFORCEMENT (kullanıcı kuralı —
     bu 4 kolon ASLA client'tan güvenilmez). `verification.poolHeating`
     doluysa (server recompute başarılıysa) `body`'nin 4 pool heating
     snapshot alanı server-authoritative değerlerle OVERRIDE edilir —
     `createReservation`'a ve dolayısıyla `create.service.ts`'e (DOKUNULMADI,
     admin path ile paylaşılıyor) bu adımdan SONRA, zaten düzeltilmiş
     `body` geçer. Recompute başarısızsa (SEC-06 F5) rezervasyon
     aşağıda reddedilir. */
  const verification = await verifyPublicReservationPrice(body);
  if (verification.poolHeating) {
    body.pool_heating_selected = verification.poolHeating.pool_heating_selected;
    body.original_pool_heating_total =
      verification.poolHeating.original_pool_heating_total;
    body.original_pool_heating_currency =
      verification.poolHeating.original_pool_heating_currency;
    body.pool_heating_total_try =
      verification.poolHeating.pool_heating_total_try;
  }

  /* 🛡️ FAZ 3 — SERVER-AUTHORITATIVE FİNANSAL ALANLAR (indirim-farkında).
     `verification.authoritative` doluysa (server recompute başarılıysa,
     villa_prices + villa_discounts + cleaning config'ten SUNUCUNUN
     KENDİSİ hesapladığı sonuç) `body`'nin finansal alanları bu değerlerle
     EZİLİR — client'ın gönderdiği `total_price`/`total_price_try`/
     `original_price`/`original_currency`/`exchange_rate`/
     `original_cleaning_fee`/`original_cleaning_currency`/`cleaning_fee_try`/
     `prepayment_amount`/`remaining_payment` ne olursa olsun (sahte düşük
     veya yüksek), DB'ye SUNUCUNUN hesapladığı değer yazılır. Bu atama
     `createReservation`'dan (ve dolayısıyla commission hesabından —
     `create.service.ts` `data.total_price_try`'ı okur, DOKUNULMADI)
     ÖNCE yapılır; commission böylece OTOMATİK olarak düzeltilmiş
     `total_price_try` üzerinden hesaplanır.
     `custom_price`/`custom_price_note` — public akışta client normalde
     bu alanları hiç göndermez (yalnız admin-edit konsepti); güvenlik
     için server recompute başarılıysa yine de false/null'a sabitlenir
     (defense-in-depth; fiyat hesabını ETKİLEMEZ, yalnız admin-only bir
     flag'in public path'ten sızmasını engeller).
     Recompute başarısızsa (SEC-06 F5) rezervasyon aşağıda reddedilir. */
  if (verification.authoritative) {
    body.total_price = verification.authoritative.total_price;
    body.total_price_try = verification.authoritative.total_price_try;
    body.original_price = verification.authoritative.original_price;
    body.original_currency = verification.authoritative.original_currency;
    body.exchange_rate = verification.authoritative.exchange_rate;
    body.original_cleaning_fee = verification.authoritative.original_cleaning_fee;
    body.original_cleaning_currency =
      verification.authoritative.original_cleaning_currency;
    body.cleaning_fee_try = verification.authoritative.cleaning_fee_try;
    body.prepayment_amount = verification.authoritative.prepayment_amount;
    body.remaining_payment = verification.authoritative.remaining_payment;
    body.custom_price = false;
    body.custom_price_note = null;
    // 🛡️ FAZ 4 — İNDİRİM/ÖZEL FİYAT SNAPSHOT (migration 080). Client
    // body'de aynı isimli alanlar varsa (sahte discount_applied/type/
    // value/currency vb.) burada TAMAMEN EZİLİR — server'ın villa_
    // discounts'tan hesapladığı gerçek sonuç yazılır. Discount
    // uygulanmadıysa (discount_applied=false) diğer 5 alan null olur.
    body.discount_applied = verification.authoritative.discount_applied;
    body.discount_type = verification.authoritative.discount_type;
    body.discount_value = verification.authoritative.discount_value;
    body.discount_currency = verification.authoritative.discount_currency;
    body.original_stay_total_try =
      verification.authoritative.original_stay_total_try;
    body.stay_discount_amount_try =
      verification.authoritative.stay_discount_amount_try;
    /* 🛡️ SEC-06 F4 — hasar depozitosu villanın kendi kaydından
       (client formülüyle aynı: Number(villa.deposit) || 0). */
    body.damage_deposit = verification.authoritative.damage_deposit;
  }

  try {
    /* 🛡️ EKSİK SEZON FİYATI GATE
       ===============================================================
       Sunucu, seçilen aralıktaki HER gece için villa_prices'ta bir
       satır bulamadıysa toplam GEÇERSİZDİR (eski davranışta o geceler
       sessizce 0 TL sayılıyor ve düşük tutar authoritative olarak
       yazılıyordu). Burada throw edilir → aşağıdaki catch 400 döner;
       mevcut hata zarfı ({ ok:false, error }) AYNEN kullanılır.

       ⚠️ Recompute'un kendisi patlarsa (`recomputeFailed`) aşağıdaki
       SEC-06 F5 kapısı reddeder. */
    /* 🛡️ SEC-06 F3 — hesapta kullanılan dövizin geçerli kuru yoksa
       (eskiden sessiz 1:1) aynı mesajla reddedilir. */
    if (verification.priceUnavailable || verification.rateUnavailable) {
      throw new Error(
        "Seçilen tarihler için fiyat hesaplanamadı"
      );
    }

    /* 🛡️ SEC-06 F5 — FAIL-CLOSED. Sunucu fiyatı güvenilir şekilde
       hesaplayamadıysa (villa ayarı/settings okunamadı, beklenmeyen
       hata) rezervasyon OLUŞTURULMAZ; client tutarlarına ASLA
       düşülmez. Başarılı hesapta `authoritative` daima doludur. */
    if (verification.recomputeFailed || !verification.authoritative) {
      throw new Error(
        "Fiyat şu anda doğrulanamadı. Lütfen biraz sonra tekrar deneyin."
      );
    }

    /* 🛡️ ORPHAN-GAP GATE — frontend bypass edilirse min-stay'den kısa
       kullanılamaz boşluk bırakan rezervasyon backend'de de reddedilir.
       Ayar kapalı/okunamaz veya veri toplanamazsa BLOKLAMAZ (fail-open);
       yalnız NET orphan ihlali throw eder → aşağıdaki catch 400 döndürür.
       Mevcut overlap/fiyat/create akışına DOKUNMAZ (ayrı, additive).
       createReservation'dan ÖNCE çağrılır. */
    await verifyPublicReservationStayRules({
      villa_id: body?.villa_id,
      start_date: body?.start_date,
      end_date: body?.end_date,
    });

    const created = await createReservation(body, {
      insertRepository: reservationServerRepository,
    });

    const row = created as
      | { id?: string; reservation_no?: string }
      | null;

    return NextResponse.json({
      ok: true,
      reservation: {
        id: row?.id ?? null,
        reservation_no: row?.reservation_no ?? null,
      },
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Rezervasyon oluşturulamadı";
    /* "Bu tarihler dolu" → 409 (conflict); validation/diğer → 400.
       Mesaj createReservation'dan BYTE-IDENTICAL gelir; client catch
       err.message'ı aynen gösterir (UX değişmez). */
    const status = msg === "Bu tarihler dolu" ? 409 : 400;
    console.error("[api.public.reservations] create FAILED:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
