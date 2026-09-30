# SEC-06: Server-side fiyat doğrulama audit'i (salt okuma)

**Tarih:** 2026-09-24
**Device HEAD:** `2015332 security: harden permissions and remove legacy domains`. Çalışma ağacı temiz; bu audit'te kod değişikliği yok.

**Kapsam:**

- Kod, DB, migration, config, env ve R2 değişmedi.
- Production DB'ye ve production API'ye bağlanılmadı; dış istek atılmadı.
- Commit, push ve deploy yapılmadı.

**Test ortamı:** Tamamen yerel.

- Yerel PostgreSQL'de fixture'dan kopyalanan **`kv_sec06`** DB'si kullanıldı. Bu DB'ye production şemasını taklit eden rezervasyon finansal kolonları ve `039` RPC'leri **yalnız yerel olarak** eklendi.
- Mevcut kodun production build'i (`next start`) çalıştırıldı.
- Gerçek HTTP istekleri gönderildi ve DB'ye yazılan satırlar SQL ile okundu.
- **Kontrollü test villası:** `villa-547` (fiyatlar ve ayarlar yerelde yeniden kuruldu):

  | Ayar | Değer |
  |---|---|
  | Fiyat dönemleri | Haziran 200 EUR, Temmuz 300 EUR, 11 Ağu–30 Eyl 9.000 TRY; 10–15 Eyl'de çakışan 999 EUR dönemi; 1–10 Ağu fiyatsız |
  | Temizlik | 100 GBP, 5 geceden kısa konaklamada |
  | Havuz ısıtma | 50 EUR/gece, Haziran–Ağustos |
  | İndirimler | %10 (10–12 Haziran); "fixed" özel fiyat 150 EUR (10–11 Temmuz) |
  | Diğer | Depozito 5.000, min. konaklama 3 gece, komisyon %20, kapasite 6 kişi |
  | Kurlar | EUR 35,1 · GBP 41,2 · USD 32,5 |

---

## 1. Yönetici özeti

Sistemde **zaten güçlü bir server-authoritative fiyat katmanı var**. `POST /api/public/reservations`, client'ın gönderdiği bütün tutar alanlarını sunucuda **aynı fiyat motoruyla** (`lib/price.engine.ts`) yeniden hesaplıyor ve ezerek DB'ye yazıyor. Bu alanlar: toplam, TRY toplam, orijinal fiyat/para birimi, kur, temizlik, havuz ısıtma, ön ödeme, kalan, indirim snapshot'ı ve `custom_price`. Local testlerde **`total=1`, sahte kur, sahte indirim, sahte ön ödeme ve sahte havuz ısıtma tutarının hiçbiri etkili olmadı** (§10).

Buna rağmen **gerçek açıklar var**:

| # | Bulgu | Şiddet | Kanıt |
|---|---|---|---|
| **F1** | **Tarih formatı ile fiyat hesaplamasını atlatma → 0 TL rezervasyon.** `2027/09/27`, `20270918`, `2027-09-23 00:00` veya `Aug 27 2027` gibi tarihleri PostgreSQL kabul ediyor, fiyat motoru parse edemiyor. Motor 0 gece hesaplıyor ve "fiyat geçerli, toplam 0" döndürüyor. Server bu 0'ı **authoritative** kabul edip yazıyor. **Normal arayüzden de tetiklenebiliyor** (`/rezervasyon/<slug>?start=2027/09/02&end=2027/09/05` → ekranda ₺0, gönderim engellenmiyor) | **Kritik** | T17, T18, T19, T19c: DB'de gerçek tarihler + `total_price_try=0`, `prepayment=0`. UI testinde ₺0 |
| **F2** | **`paid_amount` client'tan kabul ediliyor.** Public istekte `paid_amount: 99999` gönderilince DB'ye aynen yazılıyor. Admin panelindeki "ödeme alınmadan onaylanamaz" kuralı (`canConfirmReservation`) aşılıyor. Müşteri paylaşım sayfası ve voucher "Ödenen 99.999 TL / Kalan 0" gösteriyor | **Yüksek** | T7: `paid_amount=99999` |
| **F3** | **Kur eksikse 1:1 çevrim.** `exchange_rates`'te bir kur yoksa veya okunamazsa `convertPrice` sessizce 1 kullanıyor. Server'ın "authoritative" toplamı çok düşük çıkıyor: 600 EUR, 600 TL olarak yazıldı; doğrusu 21.060 TL. Saldırgan tetikleyemiyor ama TCMB beslemesi veya DB sorunu anında **gerçek düşük fiyatlı rezervasyon** oluşuyor | **Orta** (operasyonel) | T22: toplam 4.720 TL; doğrusu 25.180 TL |
| **F4** | **`damage_deposit` client'tan kabul ediliyor.** Villanın gerçek depozitosu okunmuyor; client ne gönderirse o yazılıyor (0 dahil) ve mail ile voucher'da müşteriye bu gösteriliyor | **Orta–Düşük** | T7: `damage_deposit=0` (gerçek 5.000) |
| **F5** | **Villa ayarı okuma hatası fail-soft.** `findVillaCleaningConfig` hata dönerse temizlik, havuz ve özel ön ödeme oranı sessizce 0/varsayılan oluyor. Ayrıca recompute exception fırlatırsa (fail-open) client tutarları aynen yazılıyor | **Düşük** (tetiklemesi zor) | Kod incelemesi |
| F6 | **Fiyat dışı iş kuralları server'da yok:** minimum konaklama (1 gece kabul edildi), geçmiş tarih (kabul edildi), kapasite (99 kişi kabul edildi). Fiyat doğru hesaplanıyor; yalnız kural ihlali | Düşük | T13, T15, T23 |

**En kritik kombinasyon (F1 + F2):** 0 TL toplamlı ve `paid_amount>0` olduğu için "ödenmiş" görünen, admin'in tek tıkla onaylayabileceği bir rezervasyon.

**Online ödeme sağlayıcısı entegrasyonu yok.** Ödemeler banka havalesi, Western Union veya admin'in elle girdiği ödeme linkiyle alınıyor. "Client'ın gönderdiği tutarın ödeme sağlayıcısına gitmesi" riski bu projede **yok**; ödeme maillerindeki tutarlar DB'den okunuyor (§7). Ancak DB'deki tutar F1 ile 0 olabildiği için, bu maillerde gösterilen ödeme tutarları da etkilenir.

---

## 2. Mevcut fiyat hesaplama mimarisi

### 2.1 Veri kaynakları

| Veri | Tablo / kaynak | Okuyan (server) |
|---|---|---|
| Gecelik fiyat dönemleri | `villa_prices` (`start_date`, `end_date`, `price`, `currency`) | `getVillaPrices` → `villaAdminRepository.findVillaPrices`. `start_date ASC` sıralı; hata olursa `[]` döner |
| İndirim / özel fiyat | `villa_discounts` (`percent` \| `fixed`, `value`, `currency`) | `getVillaDiscounts`; hata olursa `[]` (indirim yok) |
| Temizlik / havuz / ön ödeme oranı | `villa.cleaning_fee`, `cleaning_currency`, `cleaning_limit`, `pool_heating_fee`, `pool_heating_currency`, `pool_heating_months`, `custom_prepayment_rate` | `reservationRepository.findVillaCleaningConfig` (`lib/db/reservation.repository.ts:214`) |
| Genel ön ödeme oranı | `settings.prepayment_rate` | `getPublicSettings` |
| Kurlar | `exchange_rates` (USD/EUR/GBP; TCMB cron'u yazıyor) | `getExchangeRatesMap`; hata olursa `{ rates: {} }` |
| Komisyon | `villa.commission_rate` | `fetchCommissionRate`; hata veya aralık dışı değerde 20 |
| Depozito | `villa.deposit` | **Server'da okunmuyor** (F4) |

### 2.2 Hesaplama kuralları (`lib/price.engine.ts`)

- **Tarihler:** `parseLocalDate` yalnız `YYYY-MM-DD` kabul ediyor (`T` sonrasını atıyor), yerel gece yarısı olarak parse ediyor. Diğer biçimler geçersiz tarih (`NaN`) üretiyor. **F1'in kökü bu.**
- **Gece sayısı:** `calculateNights = ceil((end-start)/1 gün)`.
- **Hangi geceler fiyatlanıyor:** `calculateStayTotal` yarı açık aralıkta döner (`while current < end`). **Check-out günü fiyatlanmıyor.**
- **Günlük fiyat:** `getDailyPrice`, `villa_prices` içinde `start ≤ gün ≤ end` (kapalı aralık) koşulunu sağlayan **ilk** kaydı kullanır; çakışan dönemlerde başlangıcı en erken olan kazanır (T12). Kayıt yoksa o gece "fiyatsız" sayılır.
- **Fiyatsız gece:** `uncoveredNights > 0` ise `priceAvailable=false` olur ve tüm tutarlar 0 döner. Server bu durumda 400 veriyor (T11a/b).
- **İndirim:** `getActiveDiscount` + `applyDiscountToDailyPrice`.
  - `percent` → normal fiyat × (1 − %).
  - `fixed` → **o gecenin nihai özel fiyatı** (düşülmez, yerine geçer). Farklı para birimindeyse `convertPrice` ile çevrilir.
  - Yalnız konaklama bedeline uygulanır; temizlik ve havuz ısıtmayı etkilemez.
- **Temizlik:** `cleaning_limit` 0 ise her zaman alınır; değilse yalnız `gece < limit` olduğunda alınır.
- **Havuz ısıtma:** Seçilmişse **ve** tüm geceler `pool_heating_months` içindeyse gece × ücret; değilse 0.
- **Toplam:** `total = konaklama + temizlik + havuz` (hepsi TRY).
- **Ön ödeme ve kalan:**
  - Ön ödeme = `round((toplam − temizlik − havuz) × oran / 100)`.
  - Oran sırası: `villa.custom_prepayment_rate` → `settings.prepayment_rate` → 20.
  - Kalan = `max(toplam − ön ödeme, 0)`.
- **Kur çevirisi:** `convertPrice` → `tutar × kur`, `toFixed(2)`; TRY pivot. **Kur yoksa, 0 ise veya geçersizse 1 kullanılıyor** (`resolveRate`, `lib/currency.ts:29`). **F3'ün kökü bu.**
- **Yuvarlama:** Her gece `toFixed(2)`, ön ödeme `Math.round`, toplam ondalıklı toplanıyor.
- **Hesaplamada olmayanlar:** Hafta içi/hafta sonu farkı, kişi başı fiyat, kupon, ödeme komisyonu. "Kısa süreli tarihler" sayfası yalnız müsaitlik gösteriyor, fiyat kuralı yok.
- **Komisyon:** `total_price_try × oran`. Server'da, düzeltilmiş toplam üzerinden hesaplanıyor.

**Client ve server aynı motoru kullanıyor.** `calculateGrandTotal` hem `ReservationForm`/`useBookingEngine` hem `price-verify.ts` tarafından çağrılıyor; T0'da server log'u `OK (client == server)`.

---

## 3. Fiyat hesaplama akış haritası (public rezervasyon)

```
Tarayıcı: /rezervasyon/<slug>?start=..&end=..      (tarih URL'den; ReservationPageBody DOĞRULAMIYOR)
  → ReservationForm: calculateGrandTotal(TRY) → buildPublicReservationPayload
  → POST /api/public/reservations  (JSON body; tüm finansal alanlar client'tan)
      1. rate-limit "reservation" (3 istek/10 dk/IP; Upstash yoksa devre dışı)
      2. telefon doğrulama ve normalizasyonu
      3. verifyPublicReservationPrice(body)                        price-verify.ts:512
           recompute: villa_prices + villa_discounts + villa config + kurlar + settings
           → calculateGrandTotal + havuz ısıtma + ön ödeme + indirim snapshot'ı
           → priceAvailable=false ise priceUnavailable=true
           → exception fırlatırsa authoritative=null (FAIL-OPEN)
      4. authoritative varsa → body'deki 22 finansal alan EZİLİR   route.ts:145-182
         (paid_amount, damage_deposit, payment_preference, guests EZİLMEZ)
      5. priceUnavailable → 400                                     route.ts:186
      6. verifyPublicReservationStayRules (yalnız orphan-gap)       route.ts:198
      7. createReservation                                          create.service.ts
           JS Date ile start<end kontrolü (NaN'da geçiyor!) → çakışma RPC'leri
           → komisyon → buildCreateReservationPayload (status="pending" sabit)
           → INSERT (EXCLUDE constraint çakışmayı DB'de engelliyor)
      8. response: { id, reservation_no }
  → POST /api/mail/reservation-request { reservationId }  (public; tutarlar DB'den)
Ödeme (manuel): admin → ödeme linki / havale / Western Union maili (tutarlar DB'den)
  → müşteri harici ödeme yapar → admin paid_amount girer → onay (paid_amount > 0 şartı)
```

---

## 4. Tüm rezervasyon ve fiyat akışları

| Akış | Route | Yetki | Client'ın gönderdiği fiyat alanları | Server'ın yeniden hesapladığı | DB'ye yazılan | Not |
|---|---|---|---|---|---|---|
| Public rezervasyon | `POST /api/public/reservations` | Yok (public) | 22 finansal alan + `paid_amount`, `damage_deposit`, `payment_preference` | 22 finansal alan (fail-open hariç) | Server değeri; **`paid_amount` ve `damage_deposit` client'ın** | F1, F2, F4, F5 |
| Rezervasyon talep maili | `POST /api/mail/reservation-request` | Public (bilinçli) | Yalnız `reservationId` | — | — | Tutarlar DB snapshot'ından |
| Teklif talebi | `POST /api/public/offer-requests` | Public | `budget_currency` (bütçe bilgisi) | — | Teklif talebi (rezervasyon değil) | Fiyat hesabı yok |
| Rezervasyon sorgu / paylaşım | `POST /api/public/reservation-lookup`, `/rezervasyon-kontrol?token=` | Kod + e-posta / token | — | — | Salt okuma | F2'deki sahte "Ödenen" burada görünür |
| Admin rezervasyon oluşturma | `POST /api/admin/reservations` | Aktif admin | Tüm alanlar (özel fiyat dahil) | **Yok (bilinçli)** | Admin'in değeri | §12. İzin kontrolü SEC-03 Faz 2'de |
| Admin rezervasyon düzenleme | `PATCH/PUT /api/admin/reservations/[id]` | Aktif admin | Tüm finansal alanlar, `paid_amount` | Yok (bilinçli) | Admin'in değeri | Onay kuralı `assertCanConfirm` |
| Ödeme linki / havale / WU / ödeme onay mailleri | `/api/mail/{payment-link, bank-transfer-payment, western-union-payment, payment-confirmed}` | Admin | — | — | — | Tutarlar DB'den; ödeme linki admin'in girdiği harici URL |
| Manuel blok | `/api/admin/manual-reservations` | Admin | Fiyat yok | — | Tarih bloğu | Fiyatla ilgisi yok |
| Harici takvim | cron `external-calendar-sync` | Cron secret | Fiyat yok | — | Bloklu geceler | Fiyatla ilgisi yok |
| Online ödeme callback/webhook | — | — | — | — | — | **Projede yok** |

---

## 5. Client → server fiyat alanları (public)

| Alan | Kaynak (client) | Server'da doğrulanıyor mu? | Local test |
|---|---|---|---|
| `total_price`, `total_price_try` | Motor çıktısı | ✅ Eziliyor | T1: 1 → 32.200 |
| `original_price`, `original_currency`, `exchange_rate` | Motor + client kuru | ✅ Eziliyor (server kuru) | T2 |
| `original_cleaning_fee`, `original_cleaning_currency`, `cleaning_fee_try` | Motor | ✅ Eziliyor | T0–T4 |
| `pool_heating_total_try`, `original_pool_heating_*` | Motor | ✅ Eziliyor (ücret villadan, ay kuralı server'da) | T6: 1 → 7.020 |
| `pool_heating_selected` | Kullanıcı tercihi | Tercih olarak kabul ediliyor (bilinçli). Sezon dışında ücret alınmıyor | — |
| `prepayment_amount`, `remaining_payment` | Motor | ✅ Eziliyor | T3 |
| `discount_*`, `original_stay_total_try`, `stay_discount_amount_try` | Motor | ✅ Eziliyor (server kendi `villa_discounts` kaydını okuyor) | T4 |
| `custom_price`, `custom_price_note` | Normalde gönderilmez | ✅ `false` / `null` yapılıyor | T7 |
| `status` | — | ✅ Payload'da `"pending"` sabit | T7: `confirmed` gönderildi, `pending` yazıldı |
| `reservation_commission_amount` | — | ✅ Server hesaplıyor | T7 |
| **`paid_amount`** | Client `0` gönderiyor | ❌ **Ezilmiyor; aynen yazılıyor** | **T7: 99.999 yazıldı** |
| **`damage_deposit`** | Client `villa.deposit` gönderiyor | ❌ **Ezilmiyor** | **T7: 0 yazıldı** |
| **`start_date`, `end_date`** | URL query → form | ❌ **Biçim doğrulanmıyor** | **T17–T19c: 0 TL** |
| `payment_preference` | Kullanıcı tercihi | Allow-list (`full_payment` \| `prepayment`). Bilinçli | T25 |
| `guests`, `guest_names` | Kullanıcı | Kapasite kontrolü yok. Fiyatı etkilemiyor | T23 |
| `payment_method_id` | Kullanıcı | Doğrulanmıyor. Fiyatı etkilemiyor | — |
| `villa_id` | Sayfa | Var olmayan ya da geçersiz UUID → 400. **Pasif villa kabul ediliyor** (özel link akışı için bilinçli) | T20, T21 |

**Hidden input veya query'den fiyat alınmıyor.** Query'den yalnız tarih, kişi sayısı ve havuz tercihi geliyor; fiyat her zaman motor tarafından hesaplanıyor.

---

## 6. Server-side validation durumu

Senaryo: client `{ villaId, checkIn, checkOut, total: 1000 }` gönderiyor.

- **Server `total=1000`'e güveniyor mu?** Hayır. Server `villa_id` ve tarihlerden gerçek fiyatı DB'den yeniden hesaplıyor (**B**). Client ile aynı helper'ı kullanıyor (`calculateGrandTotal`).
- **Güvenin kırıldığı yerler:**
  1. **Tarih biçimi (F1):** Motorun parse edemediği ama PostgreSQL'in kabul ettiği biçimlerde "0 gece → toplam 0" authoritative kabul ediliyor. `createReservation`'daki `start >= end` kontrolü `new Date(...)` kullanıyor; `NaN` karşılaştırması `false` döndüğü için geçersiz tarihler de geçiyor.
  2. **Fail-open (F5):** Recompute exception fırlatırsa client değerleri yazılıyor. Normal girdilerle tetiklenemedi: tüm servisler hataları içeride `[]`/`{}`'e çeviriyor.
  3. **Eksik kur (F3):** Server doğru formülü eksik veriyle çalıştırıp düşük sonuç üretiyor.
  4. **Villa ayarı okunamazsa (F5):** Temizlik ve havuz 0 oluyor.
- **Client/server farkı:** Kurlar aynı tablodan geliyor (`/api/exchange-rates` ve `getExchangeRatesMap`). Fark ancak client'ın kurları yüklediği an ile gönderim arasında kur değişirse oluşur; server güncel kuru yazar (log'lanıyor, bloklanmıyor).

---

## 7. Ödeme tutarı akışı

| Aşama | Değer | Kaynak |
|---|---|---|
| Client toplamı | Görüntü ve payload | Motor (client) |
| Server hesabı | Authoritative | Motor (server) |
| Rezervasyon DB toplamı | `total_price_try`, `prepayment_amount`, `remaining_payment` | Server değeri (F1'de 0) |
| Ödeme tutarı (mailler) | `getPaymentDisplayValues`: `full_payment` → toplam, değilse ön ödeme | **DB** |
| Ödeme sağlayıcısı | **Yok.** Havale / WU / admin'in girdiği harici link | Admin |
| Callback / webhook | **Yok** | — |
| Ödenen tutar | `paid_amount` | **Admin (panel)**; **ama public create'te client'tan da (F2)** |

**Sonuç:** Client'ın tutarı ödeme sağlayıcısına **gitmiyor** (sağlayıcı yok). Ödeme miktarı DB'den türetiliyor; bu yüzden F1 ile 0'a düşen DB değeri ödeme maillerine de 0 olarak yansır. F2 ile "ödenmiş" durumu sahte biçimde oluşturulabiliyor.

---

## 8. Para birimi ve kur akışı

- **DB fiyatı:** `villa_prices.currency` dönem başına (TRY, EUR, USD, GBP). Temizlik ve havuz ısıtmanın kendi para birimleri var.
- **Kur:** Server'da `exchange_rates` tablosundan geliyor (TCMB cron'u yazıyor). Public `GET /api/exchange-rates` salt okuma; **client kur gönderemiyor veya değiştiremiyor.** Gönderdiği `exchange_rate` eziliyor.
- **Görüntü para birimi** (kullanıcı seçimi) yalnız gösterim için. Snapshot her zaman TRY hesaplanıyor. DB'ye **TRY** toplam, orijinal para birimi, orijinal tutar ve rezervasyon anındaki kur yazılıyor.
- **Ödeme:** TRY tutarlar üzerinden (mailler `formatTRY` kullanıyor).
- **Çeviri ve yuvarlama:** `convertPrice` her gece için `toFixed(2)`; ön ödeme `Math.round`.
- **Risk (F3):** Eksik veya geçersiz kurda 1:1 çevrim. Kur verisi TCMB beslemesine bağlı olduğu için veri kesintisinde fiyat sessizce düşüyor.

---

## 9. Edge case'ler (local, mevcut davranış)

| Senaryo | Sonuç | Değerlendirme |
|---|---|---|
| 1 gece (min 3) | 200, fiyat doğru (13.120) | Min. konaklama server'da yok (F6) |
| 3–4 gece | Doğru | ✅ |
| Sezon değişimi (29 Haz – 2 Tem) | 200+200+300 EUR = 28.690 ✅ | Check-out günü fiyatlanmıyor |
| Fiyatsız gece (tamamen veya kısmen) | 400 "fiyat hesaplanamadı" | ✅ Fail-closed |
| Check-in = check-out | 400 "Tarih aralığı hatalı" | ✅ |
| Geçmiş tarih (2026-06) | 200, fiyat doğru | Server'da geçmiş tarih kontrolü yok (F6) |
| Çok uzun (91 gece) | 200, doğru (479.115) | ✅ Üst sınır yok |
| Çakışan fiyat dönemleri | Başlangıcı en erken olan dönem kazanıyor (TRY 9.000) | Mevcut davranış (DB'de çakışma engeli yok) |
| `%10` indirim | Doğru (30.094; indirim snapshot'ı yazıldı) | ✅ |
| Özel fiyat (`fixed`) 150 EUR | Doğru (35.710) | ✅ |
| Havuz ısıtma | Doğru (7.020; client'ın 1'i ezildi) | ✅ |
| ISO + `T` (`2027-08-23T00:00:00`) | Doğru fiyatlandı | ✅ |
| **`YYYYMMDD`, `YYYY/MM/DD`, `YYYY-MM-DD HH:mm`, `Aug 27 2027`** | **200, toplam 0** | **F1** |
| Var olmayan / geçersiz villa | 400 | ✅ |
| Pasif villa (id ile) | 200 | Özel link (`/v/[token]`) akışı pasif villaları kullandığı için bilinçli |

---

## 10. Local manipülasyon testleri (gerçek HTTP → DB)

Beklenen değerler test script'inde motordan bağımsız hesaplandı.

| Test | HTTP | DB toplamı | Beklenen | Ön ödeme | `paid_amount` | Depozito |
|---|---|---|---|---|---|---|
| T0 geçerli (4 gece) | 200 | 32.200 | 32.200 | 5.616 | 0 | 5.000 |
| T1 `total=1` | 200 | **32.200** ✅ | 32.200 | 5.616 | 0 | 5.000 |
| T2 sahte kur / para birimi / orijinal fiyat | 200 | **32.200** ✅ | 32.200 | 5.616 | 0 | 5.000 |
| T3 ön ödeme 1 / kalan 0 | 200 | 32.200 | 32.200 | **5.616** ✅ | 0 | 5.000 |
| T4 sahte indirim alanları | 200 | **32.200** ✅ (indirim yazılmadı) | 32.200 | 5.616 | 0 | 5.000 |
| T5 gerçek %10 indirim | 200 | 30.094 | 30.094 | 5.195 | 0 | 5.000 |
| T6 havuz ısıtma, client toplamı 1 | 200 | **53.260** ✅ | 53.260 | 8.424 | 0 | 5.000 |
| T7 `paid_amount` / depozito / `custom_price` / `status` / komisyon | 200 | 46.240 ✅ | 46.240 | 8.424 | **99.999 ❌** | **0 ❌** |
| T17 `20270918` | 200 | **0 ❌** | ≈40.120 | 0 | 0 | 5.000 |
| T18 `2027-09-23 00:00` | 200 | **0 ❌** | ≈40.120 | 0 | 0 | 5.000 |
| T19 `2027/09/27` | 200 | **0 ❌** | ≈31.120 | 0 | 0 | 5.000 |
| T19c `Aug 27 2027` | 200 | **0 ❌** | ≈40.120 | 0 | 0 | 5.000 |
| T22 EUR kuru silindi (3 gece) | 200 | **4.720 ❌** | 25.180 | 120 | 0 | 5.000 |

Diğer testlerin hepsi beklenen sonucu verdi: sezon sınırı, uzun konaklama, çakışan dönemler, fiyatsız geceler, geçersiz villa, check-in = check-out.

**UI teyidi (F1):** Playwright ile `/rezervasyon/villa-547?start=2027/09/02&end=2027/09/05` açıldı. Ekranda "3 gece", "Toplam Tutar ₺0", ön ödeme ₺0 görünüyor ve "fiyat hesaplanamadı" uyarısı çıkmıyor. `isFormValid` bu durumda gönderimi engellemiyor.

Test kalıntısı: yalnız yerel `kv_sec06` DB'sinde 24 test rezervasyonu var. Silinen EUR kuru geri yüklendi.

---

## 11. Gerçek güvenlik bulguları (ayrıntı)

### F1: Tarih biçimi ile 0 TL rezervasyon (Kritik)

- **Kök neden:**
  - `lib/price.engine.ts` → `parseLocalDate` yalnız `YYYY-MM-DD` parse ediyor. Geçersiz tarihte `calculateStayTotal` içindeki `while (current < endD)` döngüsü (`:345`) hiç dönmüyor. `uncoveredNights=0` olduğu için `priceAvailable=true` (`:680`) ve `total=0`.
  - `price-verify.ts` bunu geçerli authoritative sonuç sayıyor; `route.ts:145` body'yi 0 ile eziyor.
  - `create.service.ts:81-84`: `new Date(...)` ile `start >= end` kontrolü `NaN`'da geçiyor. PostgreSQL `date` kolonu bu biçimleri kabul edip gerçek tarihe çeviriyor.
  - Orphan-gap kontrolü de aynı parse nedeniyle "noop" dönüyor.
- **UI yolu:** `ReservationPageBody.tsx:110-111` query'deki `start`/`end` değerlerini doğrulamadan forma veriyor.
- **Etki:** Gerçek tarihleri bloke eden, toplamı, ön ödemesi ve kalanı 0 olan pending rezervasyon. Mailler de 0 gösterir. F2 ile birleşince "ödenmiş" görünür.

### F2: `paid_amount` client'tan (Yüksek)

- **Kök neden:** `payload-create.ts:157-159` `data.paid_amount` tanımlıysa yazıyor; public route bu alanı ezmiyor.
- **Etki:**
  - Onay kuralı (`status.ts` / `canConfirmReservation`: `paid_amount > 0`) aşılıyor.
  - Paylaşım sayfası (`share.resolve.ts:220`) ve voucher (`voucher/data.ts:257`) "Ödenen" gösteriyor.
  - Ödeme alınmış izlenimiyle sosyal mühendislik ve muhasebe tutarsızlığı mümkün.
- **Not:** Meşru client her zaman `0` gönderiyor (`buildPublicReservationPayload.ts:197`); ezilmesi davranışı değiştirmez.

### F3: Eksik kur → 1:1 (Orta, operasyonel)

- **Kök neden:** `resolveRate` fallback'i 1 (`lib/currency.ts:29-36`). `getExchangeRatesMap` hata veya boş tablo durumunda `{}` döner.
- **Kapsam:** Konaklama, temizlik, havuz ve `fixed` indirim çevirilerinin hepsi etkilenir.
- **Etki:** Kur verisi eksikken oluşan rezervasyonlar ~35 kat düşük fiyatla yazılır. Bunu saldırgan tetikleyemez, ama olduğu anda gerçekleşir.

### F4: `damage_deposit` client'tan (Orta–Düşük)

- **Kök neden:** `payload-create.ts:184` client değerini yazıyor; server `villa.deposit`'i okumuyor.
- **Etki:** Müşteriye gönderilen belgelerde yanlış depozito. Muhasebeye dahil değil (`damage-deposit.helper.ts`: informational).

### F5: Fail-soft / fail-open kalıntıları (Düşük)

- `findVillaCleaningConfig` hatası kontrol edilmiyor (`price-verify.ts:177`): temizlik, havuz ve özel ön ödeme oranı sessizce 0/varsayılan oluyor.
- `verifyPublicReservationPrice` catch dalı (`:591`): client değerleri kalıyor. Normal girdilerle tetiklenemedi; beklenmedik DB exception'ında mümkün.

### F6: Fiyat dışı kurallar (Düşük)

Server'da minimum konaklama, geçmiş tarih ve kapasite kontrolü yok; bunlar yalnız UI'da uygulanıyor. Fiyat doğru hesaplanıyor.

### Ek gözlemler (SEC-06 dışı)

- **Rate-limit IP'si:** `lib/rate-limit.ts` IP olarak `x-forwarded-for`'un **ilk** elemanını kullanıyor. Traefik gerçek IP'yi sona eklediği için ilk eleman istemci kontrolünde olabilir. Rezervasyon bucket'ı (3/10 dk) spoof ile aşılabilir. Ayrıca doğrulanmalı.
- **Admin rezervasyon route'ları:** İzin kontrolü SEC-03 Faz 2'ye bırakılmıştı; her aktif admin fiyatı değiştirebiliyor.

---

## 12. False positive / bilinçli davranışlar

- `total`, `price`, `currency`, `exchange_rate`, `discount*`, `pool_heating*`, `prepayment`/`remaining`, `custom_price` manipülasyonları → **korunuyor** (T1–T6).
- `status` → her zaman `pending`. Komisyon server'da hesaplanıyor.
- **Admin'in fiyatı elle belirlemesi** (`/api/admin/reservations` POST/PATCH, `custom_price`) → bilinçli özellik, güvenlik açığı değil.
- `pool_heating_selected`, `payment_preference`, `guests`, `payment_method_id` → kullanıcı tercihleri. Fiyatı ya etkilemiyor ya da server kuralıyla sınırlanıyor.
- Pasif villa `villa_id` ile rezervasyon → `/v/[token]` özel link akışı pasif villaları bilerek kullanıyor. **Engellenirse özel link rezervasyonları kırılır.**
- Çakışan fiyat dönemlerinde ilk kaydın kazanması → mevcut ürün davranışı.
- Public `reservation-request` maili → bilinçli; tutarlar DB'den.
- Drift log'unun bloklamaması → bilinçli. Güvenlik ezme (override) ile sağlanıyor.

---

## 13. Sistemi bozmadan önerilen minimum fix (UYGULANMADI, onay bekliyor)

Fiyat motoru, tarih mantığı, kur ve yuvarlama, indirim ve ek hizmet davranışı **değişmeyecek**. Yalnız doğrulama ve ezme eklenecek.

1. **F1: Katı tarih doğrulaması (public route).** `verifyPublicReservationPrice`'tan önce `start_date`/`end_date` için `^\d{4}-\d{2}-\d{2}$` kontrolü yapılır. Mevcut davranışı korumak için `T...` sonekine izin verilip ilk 10 karakter alınır. Ayrıca `parseLocalDate` ile geçerli takvim tarihi (gidiş-dönüş eşleşmesi) aranır ve `calculateNights ≥ 1` şartı konur. Aksi halde 400 döner ve body normalize edilmiş `YYYY-MM-DD` ile devam eder.
   - **Defense-in-depth:** `recomputePublicReservationPrice`'ta `nights` finite değilse veya ≤ 0 ise `priceUnavailable` işaretlenir.
   - *(Opsiyonel UX)* `ReservationPageBody` biçimi bozuk query tarihlerini yok sayar. Server fix'i tek başına yeterli.
2. **F2:** Public route'ta `body.paid_amount = 0` sabitlenir. Meşru client zaten 0 gönderiyor, davranış değişmez.
3. **F4:** `findVillaCleaningConfig` projeksiyonuna `deposit` eklenir (tek çağıranı `price-verify`). Authoritative dalda `body.damage_deposit = villa.deposit` yapılır. Meşru client aynı değeri gönderiyor.
4. **F3:** `recomputePublicReservationPrice` içinde, **yalnız bu konaklamada fiilen kullanılan** TRY dışı para birimlerinin kuru kontrol edilir: gecelerin fiyat para birimleri, temizlik alınıyorsa temizliğinki, havuz seçiliyse havuzunki, `fixed` indirimin para birimi. Bunlardan biri için geçerli kur yoksa `priceUnavailable` → 400. `convertPrice` ve `resolveRate` **değişmez**; kurlar mevcutken çıktı birebir aynı kalır.
5. **F5:** `villaRes.error` varsa veya satır yoksa `priceUnavailable` (fail-closed).
   - *(Karar sizin)* Catch dalını da fail-closed yapmak (503): güvenli ama DB kesintisinde rezervasyonları reddeder.
6. *(Opsiyonel, fiyat dışı)* Server'da minimum konaklama, geçmiş tarih ve kapasite kontrolleri. UI zaten uyguluyor; yalnız doğrudan API çağrılarını etkiler. Ayrı karar olarak bırakılabilir.

## 14. Değişmesi gereken dosyalar (öneri)

| Dosya | Değişiklik | Kapsam |
|---|---|---|
| `app/api/public/reservations/route.ts` | Tarih doğrulama ve normalizasyon (F1), `paid_amount=0` (F2), `damage_deposit` ezme (F4) | Yalnız public route (admin akışı etkilenmez) |
| `app/services/reservation/_helpers/price-verify.ts` | `nights ≤ 0` → `priceUnavailable` (F1), eksik kur → `priceUnavailable` (F3), villa config hatası → `priceUnavailable` (F5), deposit'in authoritative'e eklenmesi (F4) | Motor çağrıları aynı kalır |
| `lib/db/reservation.repository.ts` (`findVillaCleaningConfig`) | `select`'e `deposit` eklenir | Tek çağıran `price-verify` |
| `tests/unit/...` (yeni) | Tarih biçimleri, `paid_amount`, depozito, eksik kur, villa config hatası; meşru senaryolarda birebir aynı çıktı | Mevcut testlere dokunulmaz |

Dokunulmayacaklar: `lib/price.engine.ts`, `lib/currency.ts`, `create.service.ts`, `payload-create.ts` (admin ile ortak), `buildPublicReservationPayload.ts`, admin akışları, mail ve voucher.

## 15. Test planı (fix aşaması için)

1. **Birim testleri:** Tarih doğrulayıcı; biçim tablosu (geçerli: `YYYY-MM-DD`, `YYYY-MM-DDT..`; geçersiz: `/`, boşluk, `YYYYMMDD`, metin, `2027-02-31`, eşit veya ters tarih).
2. **`price-verify` testleri:** Kur eksikliği (yalnız kullanılan para biriminde red); villa config hatası; `nights ≤ 0`; deposit.
3. **Mevcut test suite:** Tamamı (`price-verify.discount*`, `pool-heating-verify`, `payload-create*`, `reservation-*` dahil) değişmeden geçmeli.
4. **Local HTTP harness** (bu audit'teki `kv_sec06` ve script'ler):
   - Meşru T0, T5, T6, T8, T9, T10, T12, T16 **birebir aynı** DB değerlerini vermeli.
   - T17–T19c → 400; T7 → `paid_amount=0`, `damage_deposit=5000`; T22 → 400.
   - T19b (ISO + `T`) → aynı fiyat.
5. **UI:** Normal akışta (tarih seçimi → form → gönderim) davranış değişmemeli. Bozuk query URL'inde server 400 döner, form hata gösterir.
6. **Diğer:** TypeScript, ESLint, production build, route tablosu karşılaştırması.

## 16. Riskler

| Risk | Olasılık | Azaltma |
|---|---|---|
| Katı tarih kontrolü meşru bir istemcinin farklı biçimini reddeder | Düşük: `ReservationForm` ve BookingSidebar `YYYY-MM-DD` üretiyor; `T` soneki toleranslı | ISO+`T` desteği; test tablosu |
| Kur eksikken rezervasyon reddedilir (bugün düşük fiyatla kabul ediliyor) | Kur kesintisi anında | Bilinçli trade-off: düşük fiyat yerine açık hata. Yalnız kullanılan para birimleri kontrol edilir |
| Deposit okuma projeksiyon değişikliği | Çok düşük: tek çağıran | Birim testi |
| Catch dalının fail-closed yapılması | DB kesintisinde rezervasyon kaybı | Opsiyonel; kararınıza bırakıldı |
| Admin akışının yanlışlıkla etkilenmesi | Yok: değişiklikler yalnız public route ve `price-verify`'da | `createReservation` ve `payload-create`'e dokunulmuyor |
| Mevcut fiyatların değişmesi | Yok: motor, kur ve yuvarlama kodu aynı; meşru senaryolar birebir karşılaştırılacak | Harness karşılaştırması |

**Audit burada durdu. Fix için onayınızı bekliyorum.**
