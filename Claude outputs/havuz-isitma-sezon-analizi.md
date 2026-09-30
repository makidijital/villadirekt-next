# Havuz Isıtma — Aylık Sezon Kuralı: Mevcut Sistem Analizi

**Kapsam:** Bu doküman SADECE analizdir. Hiçbir dosya değiştirilmedi, migration oluşturulmadı, commit/push yapılmadı. Tüm dosya/fonksiyon/kolon isimleri gerçek kod tabanından (`tatilin-yeri-next`) doğrulanarak alınmıştır.

**Önemli düzeltme:** Talepte "PostgreSQL + Drizzle/pg mimarisi" ifadesi geçiyor — kod tabanında **Drizzle YOK**. Gerçek mimari: ham PostgreSQL (`pg` paketi) üzerine yazılmış, fluent (chain) API sunan özel bir query builder (`lib/db/query-builder.ts`, `query-compiler.ts`, `native-db.provider.ts`, `pg.client.ts`). Repository'ler `db.from("tablo").select("...").eq(...).maybeSingle()` şeklinde çağrılıyor ama arkada gerçek `pg` çalışıyor. Bu, aşağıdaki DB önerisini doğrudan etkiliyor (bkz. Bölüm 2 ve 10).

---

## 1. Mevcut Pool Heating Zinciri (dosya dosya, doğrulanmış)

| Aşama | Dosya | Fonksiyon/Alan |
|---|---|---|
| Villa DB (şema) | `db/migrations/074_villa_pool_heating.sql` | `villa.pool_heating_fee numeric NULL`, `villa.pool_heating_currency text DEFAULT 'TRY'` |
| Villa DB tip | `types/database.ts` (`VillaRow`, satır 77-78) | `pool_heating_fee: number \| null`, `pool_heating_currency: string \| null` |
| Admin villa formu (state) | `app/(admin)/maki-admin/villas/_types/villa-form-data.ts` (satır 81-82, 165-166) | `VillaFormData.pool_heating_fee/_currency` |
| Admin villa formu (UI) | `app/components/admin/villa-form/PricingStep.tsx` (satır ~158-196, bu oturumda az önce restyle edildi) | "Havuz Isıtma Ücreti" input + currency select |
| Admin form → payload | `app/services/villa-admin/_helpers/normalizers.ts` → `normalizePoolHeatingFee` | `""/null/undefined → null`, `0` literal korunur, aksi `Number(raw)` |
| Payload builder | `app/services/villa-admin/_helpers/payload.ts` → `buildVillaCorePayload` (satır 87-88, 176-179) | `VillaCorePayload.pool_heating_fee/_currency` |
| Villa service (yazma) | `app/services/villa-admin/create.service.ts` (`createVillaFull`) ve `update.service.ts` (`updateVillaFull`) | ikisi de `buildVillaCorePayload(...)` çağırır |
| Repository (yazma) | `lib/db/villa.repository.server.ts` → `villaAdminRepository.insertVilla` / `.updateVillaById` | generic `.insert()/.update(payload)` — alan adı hardcode yok |
| Repository (okuma — public booking) | `lib/db/villa.repository.server.ts` → `findAvailabilityConfigById` (satır 175-183) | SELECT'e `pool_heating_fee, pool_heating_currency` dahil (8 alanlı projeksiyon) |
| Repository (okuma — admin reservation context) | `lib/db/villa.repository.server.ts` → `findContextById` (satır 1319) | aynı 2 alan dahil |
| Repository (okuma — public server verify) | `lib/db/reservation.repository.ts` → `findVillaCleaningConfig` (satır 205-215) | aynı 2 alan dahil, **tek call site: `price-verify.ts`** |
| Repository (okuma — reservation detail embed) | `app/services/reservation/_helpers/select-shapes.ts` → `SELECT_RESERVATION_DETAIL` | `villa:villa_id(... pool_heating_fee, pool_heating_currency)` embed |
| Public villa DTO mapper | `app/services/villa.service.ts` (satır ~230-236 tip, ~432-436 mapping) | NULL passthrough korunur (cleaning_fee'nin aksine `?? 0` fallback YOK) |
| Public API (modal) | `app/api/public/villas/[id]/availability/route.ts` (satır 65-66, 103-104, 195-201) | `config.pool_heating_fee/_currency` — `findAvailabilityConfigById`'ın TEK tüketicisi |
| Booking engine (public, hook) | `app/components/villa/booking/useBookingEngine.ts` (satır 128-129, 226-227, 284, 700-710) | `poolHeatingSelected` state, `poolHeatingTotal = result.poolHeating` (calculateGrandTotal'dan türetilir) |
| Villa detay sayfası | `app/(public)/kiralik-villa/[slug]/page.tsx` (satır 855-856) | `villa.pool_heating_fee/_currency` → `<BookingSidebar>` prop |
| Private-token sayfası | `app/(public)/v/[token]/page.tsx` (satır 751-752) | AYNI `<BookingSidebar>` — ayrı kod yolu değil |
| BookingSidebar | `app/components/villa/BookingSidebar.tsx` (satır 385-389) | prop'ları `<BookingSummary>`'ye aktarır, kendi hesap/gate'i yok |
| VillaCardBookingModal | `app/components/villa/VillaCardBookingModal.tsx` (satır 629-633) | AYNI `<BookingSummary>`, `apiData.config.pool_heating_fee` kaynaklı |
| **Tek görünürlük/checkbox gate'i (public)** | `app/components/villa/booking/BookingSummary.tsx` **satır 129** | `typeof poolHeatingFee === "number" && poolHeatingFee > 0` — BookingSidebar VE VillaCardBookingModal'ın TEK ortak checkbox'ı |
| Public `/rezervasyon/[slug]` sayfası | `app/components/reservation/ReservationForm.tsx` (satır 56-59, 555) | `poolHeatingSelected` PROP olarak gelir (URL `?poolHeating=1/0`'dan `useBookingEngine`'in ürettiği linkten — satır 786), kendi checkbox'ı YOK, salt display gate: `(result?.poolHeating \|\| 0) > 0` |
| Public payload builder | `app/components/reservation/_helpers/buildPublicReservationPayload.ts` | `pool_heating_selected/_total/_currency` alanlarını body'ye yazar (client tarafı, GÜVENİLMEZ) |
| Public API route | `app/api/public/reservations/route.ts` (satır 70-78) | `verifyPublicReservationPrice(body)` çağırır, dönen `poolHeating` snapshot'ıyla `body`'nin 4 alanını **OVERRIDE EDER** |
| **Server doğrulama (fiyat, compare/log)** | `app/services/reservation/_helpers/price-verify.ts` → `recomputePublicReservationPrice` / `verifyPublicReservationPrice` | `calculateGrandTotal` genel toplamda **COMPARE/LOG ONLY** (enforcement yok, fail-open); pool heating AYRI ele alınır |
| **Server doğrulama (havuz ısıtma, ENFORCE)** | `app/services/reservation/_helpers/pool-heating-verify.ts` → `computeAuthoritativePoolHeatingSnapshot` | Tek gerçek server-authoritative nokta — client'ın `pool_heating_selected` TERCİHİNE güvenir, TUTARA güvenmez; villanın gerçek fee'siyle YENİDEN hesaplar |
| Fiyat motoru (tek hesaplama noktası) | `lib/price.engine.ts` → `calculatePoolHeatingFee` (satır 257-274), `calculateGrandTotal` (satır 278+, dahili çağrı satır 366) | **`calculatePoolHeatingFee(...)` TÜM KOD TABANINDA yalnız 2 yerden çağrılıyor**: `price.engine.ts` (calculateGrandTotal içinde) ve `pool-heating-verify.ts` |
| Admin rezervasyon oluştur | `app/(admin)/maki-admin/reservations/ekle/page.tsx` (satır 580, 594-596) | `calculateGrandTotal` çağırır, `selectedVilla.pool_heating_fee` villa listesinden gelir |
| Admin rez. oluştur UI (checkbox) | `app/components/admin/reservation-form/PriceStep.tsx` (satır 206-239) | gate: `typeof selectedVilla?.pool_heating_fee === "number" && selectedVilla.pool_heating_fee > 0` — interaktif switch |
| Admin rez. detay/edit | `app/(admin)/maki-admin/reservations/[id]/_helpers/computeReservationPriceRecalc.ts`, `computeCustomPriceToggle.ts` | `calculateGrandTotal` çağırır; **`pool_heating_selected` mevcut rezervasyondan OKUNUR ve KORUNUR** — admin edit ekranında bunu değiştiren bir checkbox YOK |
| Admin rez. detay UI (salt-okunur) | `app/(admin)/maki-admin/reservations/[id]/_components/PriceCard.tsx` (satır 333-334) | `!!data.pool_heating_selected && pool_heating_total_try > 0` — yalnız GÖSTERİR, toggle YOK |
| Admin canlı özet | `app/components/admin/reservation-form/LiveDatePriceSummary.tsx` (satır 127) | `poolHeatingTRY > 0` — salt display, hesap yok |
| Reservation snapshot (DB) | `db/migrations/075_reservations_pool_heating.sql` | `reservations.pool_heating_selected/original_pool_heating_total/_currency/pool_heating_total_try` |
| Admin create/update payload | `app/services/reservation/_helpers/payload-create.ts` (satır 81-90), `payload-update.ts` (satır 83-96) | **DOĞRUDAN `data.pool_heating_*`'ı geçirir — server recompute YOK** |
| Admin create/update API route | `app/api/admin/reservations/route.ts`, `app/api/admin/reservations/[id]/route.ts` | `createReservation`/`updateReservationFull`'u DOĞRUDAN çağırır — `verifyPublicReservationPrice`/`pool-heating-verify` çağrısı YOK |
| Reservation Share görünümü | `app/(public)/rezervasyon-kontrol/ReservationShareView.tsx` (satır 244-258), `share.resolve.ts` (satır 157-222) | SADECE stored snapshot'ı (`pool_heating_selected`, `pool_heating_total_try`) gösterir — YENİDEN HESAPLAMA YOK |
| `/v/[token]` (booking görünümü) | `app/(public)/v/[token]/page.tsx` | Yeni rezervasyon akışı — `BookingSidebar` ile AYNI kod yolu |
| PDF / Email / Webhook / CSV | — | **Hiçbiri pool heating'e dokunmuyor** (repo genelinde grep — hiçbir mail template, PDF, webhook, CSV export dosyasında `pool_heating`/`poolHeating` geçmiyor) |

---

## 2. Ay Bilgisi Nerede Tutulmalı?

### Seçenekler

**A) `villa.pool_heating_months` — villa tablosunda tek kolon**
**B) Ayrı relation tablosu `villa_pool_heating_months` (villa_id, month)**
**C) JSON/array — Option A'nın bir alt-varyantı**

### Kod tabanındaki gerçek emsaller

Villa'da "çoklu seçim" ihtiyacı iki farklı şekilde çözülmüş, ve HANGİSİNİN kullanıldığı veriye bağlı:

1. **Relation tablosu deseni** — `villa_type_relation`, `villa_feature_relation`, `villa_rule_relation`, `villa_price_include_relation` (`types/database.ts`'te `VillaTypeRelationRow`, `VillaFeatureRelationRow` vb.). Bunların HEPSİ, admin'in kendi başına CRUD yapabildiği, zamanla BÜYÜYEN, isimlendirilmiş bir "master liste"ye (villa_type, villa_feature, villa_rule_item, price_include_item tabloları) işaret eder.
2. **JSONB kolon deseni** — `villa.bedroom_layout` / `villa.bathroom_layout` (migration 047) ve `villa.youtube_videos` (migration 033) ve `pages.sections` (migration 014). Bunların HEPSİ: sabit/kapalı bir şekil, admin'in ayrı bir CRUD ekranı açmadığı, sorgu/filtre/index İHTİYACI OLMAYAN, application-layer'da normalize edilen yapılar. Migration 047'nin kendi gerekçesi: *"Index YOK — bu alanlarla query/sort/filter yapılmaz; saklama amaçlı."*

**"Ay" burada ikinci kategoriye girer**: 12 ayın listesi sabit, kapalı, hiç büyümeyecek bir küme — admin'in "yeni bir ay ekle" diye bir CRUD ekranına ihtiyacı yok. Bu yüzden relation tablosu (B) mimari olarak YANLIŞ emsal; JSONB/array kolon (A/C) DOĞRU emsal.

### Kritik, kod-spesifik bir detay: `lib/db/pg-array-columns.ts`

Bu proje, `pg`'nin JS dizilerini nasıl serialize ettiğini YÖNETEN özel bir dosyaya sahip:

- **Gerçek Postgres array tipi** (`text[]`, `uuid[]`) kolonlar `REAL_ARRAY_COLUMNS` adlı bir allowlist'te AÇIKÇA kayıtlı olmalı (şu an yalnız 6 kolon: `admin_activity_logs.diff_summary`, `offer_requests.region_tokens/villa_type_tokens/feature_tokens`, `shared_favorite_lists.villa_ids`, `shared_villa_lists.villa_ids`).
- Bu listede OLMAYAN her kolon için, bir JS dizisi/objesi query-compiler tarafından **varsayılan olarak `jsonb`** kabul edilir.

**Sonuç:** Eğer `pool_heating_months` gerçek bir Postgres `smallint[]`/`integer[]` kolonu olarak eklenirse, `lib/db/pg-array-columns.ts`'e `"villa.pool_heating_months"` satırının EKLENMESİ GEREKİR — aksi halde admin formu bu alanı kaydettiğinde query-compiler diziyi yanlış tipte serialize eder ve INSERT/UPDATE muhtemelen tip hatası verir. Bu, kolayca gözden kaçacak, bu projeye ÖZGÜ bir tuzak.

Buna karşılık, `jsonb` tipi seçilirse **hiçbir ek dosya değişikliği gerekmez** — `bedroom_layout`/`youtube_videos` ile birebir aynı, zaten var olan varsayılan yol kullanılır.

### Karşılaştırma tablosu

| Kriter | A) `villa.pool_heating_months` (JSONB) | B) `villa_pool_heating_months` (relation) | C) gerçek `smallint[]`/`integer[]` |
|---|---|---|---|
| Sorgulama kolaylığı | Application-layer'da trivial (`months.includes(m)`); DB'de filtre gerekmiyor (mevcut kullanım şekli zaten application-layer'da hesaplanıyor, cleaning_fee gibi) | JOIN gerekir; bu ölçekte (1595 villa, 12 olası ay) gereksiz karmaşıklık | Application-layer aynı A gibi kolay; DB'de `ANY()` ile de sorgulanabilir ama ihtiyaç yok |
| Migration kolaylığı | Tek `ADD COLUMN ... DEFAULT NULL` — 074/075 ile birebir aynı desen | Yeni tablo + FK + (muhtemelen) unique constraint + cleanup mantığı — çok daha fazla yüzey | Tek `ADD COLUMN` ama + `pg-array-columns.ts` güncellemesi zorunlu |
| Validation | `lib/villa-layout.helper.ts` desenindeki gibi tek bir `normalizePoolHeatingMonths` fonksiyonu (1-12 aralığı, tekrar yok, sort) | Her INSERT için N satır validate edilmeli, orphan/duplicate risk | Aynı A gibi ama tip uyumsuzluğu riski (bkz. yukarı) |
| Admin formu | Basit: bir sayı dizisi state'i, tek input alanı | Daha karmaşık: ayrı bir alt-liste yönetimi (ekle/sil), gereksiz | Aynı A |
| Performans | Villa zaten tek satır olarak okunuyor (`findAvailabilityConfigById` vb.) — ek alan sıfır maliyetli | Ekstra JOIN/round-trip her booking-config okumasında | Aynı A |
| İleride sezon/tarih aralığı ekleme ihtimali | JSONB esnek — `[{month:1,active:true}]` yerine gelecekte `[{from:"12-15",to:"01-15"}]` gibi bir şekle GENİŞLEYEBİLİR (migration 047'nin YouTube/layout deseniyle aynı esneklik felsefesi) | Relation tablosu da genişleyebilir ama şema migration'ı gerektirir (yeni kolon + veri taşıma) | Native array'de "tarih aralığı" gibi zengin bir şekle geçmek şema değişikliği + veri taşıma gerektirir (array → jsonb dönüşümü) |
| 1595 mevcut villanın etkilenmesi | `DEFAULT NULL` — ADD COLUMN anında otomatik, backfill YOK (074/075 ile birebir aynı) | Relation tablosu boş başlar, hiç satır yok — "kayıt yok" durumunun anlamını NET tanımlamak gerekir (aşağıya bkz.) | Aynı A |
| Mevcut mimariye uygunluk | ✅ `bedroom_layout`/`bathroom_layout`/`youtube_videos` ile birebir aynı desen | ❌ Bu desen yalnız "admin'in büyütebildiği master liste" senaryosunda kullanılmış, burada yok | ⚠️ Aynı sonucu verir ama gereksiz bir allowlist dosyası dokunuşu ister |

### Öneri

**Seçenek A, `jsonb` tipiyle**: `villa.pool_heating_months JSONB NULL DEFAULT NULL`, değer `[1,2,3,4,5,9,10,11,12]` gibi ay numaralarının (1=Ocak...12=Aralık) bir JS/JSON dizisi. `bedroom_layout`/`youtube_videos` ile AYNI desen; `pg-array-columns.ts`'e dokunmaya gerek yok.

---

## 3. Geriye Dönük Uyumluluk

Mevcut 1595 villa için üç durum var:
- `pool_heating_fee` NULL → villa zaten "havuz ısıtma hizmeti sunmuyor" (migration 074 semantiği, `calculatePoolHeatingFee`'de `!poolHeatingFee → 0`). Ay bilgisi bu villalar için **anlamsız** — hiçbir zaman checkbox gösterilmiyor zaten (`BookingSummary.tsx:129` gate'i `poolHeatingFee > 0` şartını arıyor).
- `pool_heating_fee > 0` VE `pool_heating_months` NULL (yeni kolon eklendiğinde HEPSİ bu durumda olacak) → **NULL = "kısıtlama yok" anlamına gelmeli, "hiçbir ay aktif değil" DEĞİL.** Bunun nedeni: bugün zaten fee>0 olan her villa 12 ay boyunca ısıtma sunuyor (mevcut davranış — hiçbir ay filtresi yok). Eğer NULL "hiç ay aktif değil" olarak yorumlanırsa, mevcut çalışan (ve muhtemelen ödeme alınan) rezervasyon akışları aniden kırılır — bu KESİNLİKLE kabul edilemez bir regresyon olur.
- Varsayılan olarak düşünülen "Ocak-Mayıs + Eylül-Aralık" YALNIZCA yeni kaydedilecek/admin'in bilinçli olarak dokunacağı villalar için bir UI varsayımı olabilir; DB seviyesinde mevcut kayıtlara bu değer BACKFILL edilmemeli.

### Önerilen en güvenli semantik

```
pool_heating_months = NULL  →  "kısıtlama YOK, 12 ay da aktif" (mevcut davranışla BYTE-IDENTICAL)
pool_heating_months = []    →  (yazılabilir ama önerilmez; admin formu muhtemelen hiç bu durumu üretmeyecek)
pool_heating_months = [1,2,3,4,5,9,10,11,12]  →  yalnız bu aylarda aktif
```

Bu, migration 074'ün kendi felsefesiyle birebir aynı: *"Mevcut 1595 villa kaydı için varsayılan: pool_heating_fee NULL (hizmet yok)... geriye dönük davranış etkilenmez (yeni kolonlar henüz hiçbir okuma/yazma path'i tarafından kullanılmıyor)."* Aynı cümleyi `pool_heating_months` için de aynen tekrarlayabiliriz: **backfill YOK, DEFAULT NULL, "NULL = sınırsız/tüm aylar" application-layer'da netleştirilir.**

Admin panelinde "Isıtma Uygulanan Aylar" paneli, hâlâ hiç dokunulmamış (`pool_heating_months IS NULL`) bir villa için varsayılan olarak **tüm 12 kutucuğu işaretli** göstermelidir (UI-level default, DB-level NULL) — bu, "Varsayılan olarak düşündüğümüz durum" (Ocak-Mayıs + Eylül-Aralık) ile ÇELİŞİR: o varsayılan yalnız YENİ oluşturulan bir villa için (create formunda ilk state) mantıklı olur, MEVCUT villalar için "hepsi açık" (= bugünkü davranış) olmalı. Bu ayrımı admin formunun ilk-yükleme (`initialVillaFormData`) ile mevcut-villa-hydrate (`hydrate.ts`) mantığında netleştirmek gerekecek — hydrate tarafında `pool_heating_months: row.pool_heating_months` (NULL ise NULL kalır → UI "tümü açık" gösterir), create tarafında `initialVillaFormData`'da opsiyonel olarak `[1,2,3,4,5,9,10,11,12]` varsayılanı KULLANILABİLİR (bu, DB'de NULL kaydetmekten farklı — yalnız admin formunun ilk açılışındaki checkbox durumu).

---

## 4. Rezervasyon Tarihi Ay Kontrolü

Örnekler (villa aktif ayları: Ocak, Şubat, Mart, Nisan, Mayıs, Eylül, Ekim, Kasım, Aralık — Haziran/Temmuz/Ağustos pasif):

| Rezervasyon | Kapsadığı ay(lar) | Kullanıcının tercihi (TÜM geceler aktif olmalı) uygulanırsa |
|---|---|---|
| 10 Temmuz → 15 Temmuz | Yalnız Temmuz (pasif) | **Gösterilmez** — net, tartışmasız |
| 10 Ekim → 15 Ekim | Yalnız Ekim (aktif) | **Gösterilir, seçilebilir, hesaba dahil** — net |
| 28 Mayıs → 3 Haziran | Mayıs (aktif) + Haziran (pasif) | Kullanıcı kuralına göre: **gösterilmez** (bir gece bile pasif ayda ise tüm rezervasyon kapatılır) |
| 30 Haziran → 5 Temmuz | Haziran (pasif) + Temmuz (pasif) | **Gösterilmez** — net |
| 28 Ağustos → 3 Eylül | Ağustos (pasif) + Eylül (aktif) | Kullanıcı kuralına göre: **gösterilmez** |
| 30 Aralık → 3 Ocak | Aralık (aktif) + Ocak (aktif) | **Gösterilir** — her iki ay da aktif olduğu için kural çelişmiyor, net evet |

### Teknik değerlendirme: "tüm geceler aktif ayda olmalı" kuralı fiyat motoruna göre doğru mu?

**Evet, mevcut mimariye göre bu kural teknik olarak en doğru ve en düşük riskli seçenek.** Gerekçe:

1. `calculatePoolHeatingFee(nights, poolHeatingFee, selected)` — **gece bazında KISMİ hesap YAPMIYOR.** Fonksiyon `nights × poolHeatingFee` şeklinde TEK bir çarpım; "5 gecenin 3'ü aktif ayda, ısıtma ücretini yalnız o 3 gece için hesapla" gibi bir gece-bazlı kısmi mantık YOK ve bunu eklemek `calculateCleaningFee`/`calculatePoolHeatingFee`'nin bugünkü "tek toplam" sözleşmesini kırar, ayrıca `original_pool_heating_total`/`pool_heating_total_try` (migration 075) snapshot kolonlarının "kaç gece" bilgisini AYRICA saklamayan tasarımıyla (migration 075'in kendi notu: *"Gece sayısı için AYRI bir snapshot kolonu EKLENMEZ... start_date/end_date'ten her zaman türetilebilir"*) çelişir — kısmi ay hesaplaması olsaydı, hangi GECELERİN ısıtmalı olduğunu ayrıca saklamak gerekirdi, bu da migration 075'in TASARIM FELSEFESİNE aykırı bir genişleme olurdu.
2. "Tüm geceler aktif olmalı" kuralı → basit bir **boolean** üretir (aktif mi/değil mi), mevcut `selected: boolean` parametresiyle DOĞRUDAN uyumlu — `calculatePoolHeatingFee`'nin imzasını DEĞİŞTİRMEDEN, yalnızca ona giden `selected` değerini `selected && isActiveForRange(...)` şeklinde AND'lemek yeterli.
3. Kısmi ay kuralı (örn. "3/5 gece aktif, ücretin 3/5'ini al") teknik olarak da mümkün ama EK bir hesaplama katmanı (hangi gecelerin aktif olduğunu date-by-date saymak) ve EK bir snapshot alanı (kaç gece ısıtmalıydı) gerektirir — bu, "sadece frontend'de değil server'da da" güvenlik hedefiyle birlikte düşünüldüğünde gereksiz karmaşıklık ve yeni bir migration-genişletme riski taşır.

**Sonuç:** Kullanıcının tercihi ("bütün geceler aktif değilse seçenek sunulmasın") hem UX açısından en basit/en az kafa karıştırıcı, hem de mevcut `calculatePoolHeatingFee`/migration 075 tasarımıyla EK bir alan/parametre olmadan uyumlu tek seçenek.

---

## 5. Fiyat Motoru — Kontrolün Yeri

`calculatePoolHeatingFee(...)` çağrıları kod tabanında TAM OLARAK 2 yerde:

1. `lib/price.engine.ts` satır 366, `calculateGrandTotal` içinde — **TÜM client-side/shared hesaplama** (public `ReservationForm.tsx`, `useBookingEngine.ts` → BookingSidebar/VillaCardBookingModal, admin `reservations/ekle/page.tsx`, admin `computeReservationPriceRecalc.ts`, `computeCustomPriceToggle.ts`) buradan geçiyor.
2. `app/services/reservation/_helpers/pool-heating-verify.ts` satır 62, `computeAuthoritativePoolHeatingSnapshot` içinde — **yalnız public reservation create'in server-authoritative override'ı** (`app/api/public/reservations/route.ts` tarafından kullanılır).

Bu, "10 farklı yerde kopyalama" riskinin ZATEN BUGÜN minimize edilmiş olduğu anlamına geliyor — kontrolü BU İKİ NOKTAYA eklemek, dolaylı olarak YUKARIDAKİ TABLODA sayılan HER surface'i (public + admin, UI + server) kapsar, çünkü hepsi bu iki fonksiyondan birine (ya da her ikisine) bağımlı.

- **UI katmanı**: `calculateGrandTotal`'a eklenecek kontrol sayesinde otomatik doğru sonuç üretir (`result.poolHeating` zaten 0 döner) — AMA checkbox'ın GÖRÜNÜRLÜĞÜ ayrı bir konu (bkz. Bölüm 6/7), çünkü `BookingSummary.tsx:129` ve `PriceStep.tsx:206-207` gate'leri yalnız `fee > 0`'a bakıyor, `calculateGrandTotal`'ın SONUCUNA değil.
- **Booking engine**: `useBookingEngine.ts` zaten `calculateGrandTotal`'ı çağırıyor — otomatik kapsanır, YALNIZ checkbox visibility'yi ayrıca güncellemek gerekir.
- **Server verification**: `pool-heating-verify.ts` DEĞİŞTİRİLMELİ (yeni parametreler: tarih aralığı + villanın `pool_heating_months`'ü) — bu, mevcut "server client'a güvenmez" felsefesinin DOĞAL devamı.
- **Reservation snapshot**: Ayrı bir kontrol GEREKMİYOR — snapshot zaten `computeAuthoritativePoolHeatingSnapshot`'ın ÇIKTISINI (public create'te) veya admin formunun `calculateGrandTotal` çıktısını (admin create/edit'te) DB'ye yazıyor; kontrol kaynakta doğru olduğu sürece snapshot otomatik doğru olur.

---

## 6. Tek Merkezi Kural

Mantıksal olarak (kod YAZILMADI) İKİ küçük, saf fonksiyon önerilir, ikisi de `lib/price.engine.ts` içine (mevcut `calculatePoolHeatingFee`'nin hemen yanına — aynı dosyada zaten `calculateNights`, `calculateCleaningFee`, `calculatePoolHeatingFee` gibi saf tarih/fiyat fonksiyonları bir arada tutuluyor, dosyanın kendi organizasyon felsefesiyle uyumlu):

- **`getMonthsInRange(start: string, end: string): number[]`** (veya benzeri bir iç yardımcı) — rezervasyonun kapsadığı GECELERİN (check-out hariç, check-in dahil — `calculateNights`'ın zaten kullandığı aralık yarı-açık mantığıyla AYNI) hangi takvim aylarına denk geldiğini döner.
- **`isPoolHeatingActiveForRange(start: string, end: string, activeMonths: number[] | null | undefined): boolean`** — `activeMonths` NULL/undefined ise `true` (geriye dönük uyumluluk, bkz. Bölüm 3); aksi halde `getMonthsInRange(...)`'in DÖNDÜRDÜĞÜ her ayın `activeMonths` içinde olup olmadığını kontrol eder (kullanıcının "TÜM geceler aktif olmalı" kuralı — Bölüm 4).

**Kullanım noktaları (yalnız 2 mevcut call site'a entegre edilir, YENİ call site YARATILMAZ):**
1. `calculateGrandTotal` içinde, `calculatePoolHeatingFee(...)` çağrılmadan HEMEN ÖNCE: `pool_heating_selected && isPoolHeatingActiveForRange(start, end, pool_heating_months)` şeklinde yeni bir opsiyonel parametre (`pool_heating_months?: number[] | null`) ile.
2. `computeAuthoritativePoolHeatingSnapshot` (`pool-heating-verify.ts`) içinde — `PoolHeatingSnapshotInput`'a `startDate`/`endDate` (şu an yok, yalnız `nights` var) VE `villaPoolHeatingMonths` eklenir; `calculatePoolHeatingFee`'ye geçirilen `selected` parametresi aynı şekilde AND'lenir.

Bu iki fonksiyon de YENİ bir "10. kopya" olmaz — MEVCUT iki merkezi noktanın (Bölüm 5) girdisine eklenen KÜÇÜK bir ön-kontrol katmanıdır.

**Ayrıca gerekli (ama hesaplama değil, görünürlük):** `BookingSummary.tsx` (satır 129) ve `PriceStep.tsx` (admin create, satır 206-207) checkbox gate'lerine AYNI `isPoolHeatingActiveForRange` sonucunu ekleme — bunlar `calculateGrandTotal`'dan BAĞIMSIZ, saf `fee > 0` kontrolleri oldukları için hesaplama motorundaki düzeltme onları OTOMATİK düzeltmez (checkbox görünür kalır, yalnızca tutar 0 olur — kullanıcının "seçilebilir olmamalı" isteğini karşılamaz).

---

## 7. Admin UI (`PricingStep.tsx`)

Bu oturumda az önce restyle edilen mevcut 5 kolonlu grid (`grid-cols-1 md:grid-cols-5`) korunuyor; "Havuz Isıtma Ücreti" halihazırda kendi hücresinde (`<div className="space-y-2">` içinde `Label` + `1fr_88px` alt-grid input/select). Yeni "Isıtma Uygulanan Aylar" bileşeni bu HÜCRENİN İÇİNE, mevcut hint paragrafının ALTINA eklenebilir — grid yapısını (5 kolon sayısını) BOZMADAN, çünkü:

- İstenen davranış zaten "kapalıyken küçük bir satır" — yani VARSAYILAN yükseklik değişmez, yalnızca aynı hücrenin içine bir `<button>` (örn. "Ayları Göster ▼") ve onun altına conditional-render bir panel (`{open && (<div>...</div>)}`) eklenir. Bu, `PricingStep.tsx`'in zaten kullandığı "conditional render + state" desenine (örn. `showCleaningCurrency ? (...) : (...)`) uygun.
- Panel AÇILDIĞINDA hücrenin (ve dolayısıyla TÜM grid satırının, çünkü CSS grid satırları eşit yükseklikte olur) yüksekliği artar — bu KAÇINILMAZ bir CSS grid davranışı, ancak yalnız panel açıkken; kapalıyken sıfır ek yükseklik.
- 12 ay checkbox'ı için `grid grid-cols-3 gap-2` (3x4) gibi kompakt bir mini-grid mantıklı — panel zaten dar bir hücre (1/5 genişlik) içinde açılacağı için ayları YATAY sığdırmak (kullanıcının çizdiği "3'lü satırlar" mockup'ı) pratik.
- "Tümünü Seç"/"Tümünü Kaldır" iki küçük buton, panelin altında.
- Mobilde (`grid-cols-1`): hücre zaten tam genişlik alıyor (dikey stack), panel açıldığında mobilde de aynı 3 sütunlu mini-grid çalışır (Tailwind `grid-cols-3` responsive'e bağlı değil, sabit kalabilir — mobil genişlikte 3 sütun hâlâ okunaklı, `Ocak/Şubat/Mart` gibi kısa kelimeler için sorun yok).

**Sonuç: Mevcut 5 kolonlu tasarımı BOZMUYOR** — yeni UI, "Havuz Isıtma Ücreti" hücresinin İÇİNDE, dikey olarak genişleyen ek bir alt-bölüm; grid'in kolon sayısı/genişliği/diğer 4 alan ETKİLENMEZ.

---

## 8. Tüm Görünürlük Noktaları

| Yer | Sezon kuralı UYGULANMALI mı? | Gerekçe |
|---|---|---|
| Villa detay `BookingSidebar` | ✅ Evet | `BookingSummary.tsx:129` gate'i güncellenmeli |
| `VillaCardBookingModal` | ✅ Evet (otomatik) | AYNI `BookingSummary.tsx`'i kullanıyor — tek dokunuşla ikisi de düzelir |
| `/rezervasyon/[slug]` (`ReservationForm.tsx`) | ✅ Evet | Kendi `calculateGrandTotal` çağrısı + display gate (satır 555) güncellenmeli; ayrıca URL `?poolHeating=1` manipülasyonuna karşı server tarafı (Bölüm 9) ZATEN devrede |
| Admin `/rezervasyon ekle` | ✅ Evet | `PriceStep.tsx` (satır 206-207) checkbox gate'i + `calculateGrandTotal` çağrısı |
| Admin `/rezervasyon/[id]` | ⚠️ Kısmen | Bugün burada interaktif bir checkbox YOK (`pool_heating_selected` korunuyor, değiştirilmiyor) — ama villa/tarih DEĞİŞİRSE (`computeReservationPriceRecalc.ts`/`computeVillaChangeReset.ts`) `calculateGrandTotal` yeniden çalışır; bu YENİDEN hesaplama da yeni kurala tabi olmalı (aksi halde admin tarihi Temmuz'a çekerse sistem hâlâ ısıtma ücreti hesaplamaya devam eder) |
| `LiveDatePriceSummary` | ✅ Evet (otomatik) | Yalnız `priceDetail.poolHeating`'i gösteriyor — `computeReservationPriceRecalc.ts` düzeltilince otomatik doğru değer gösterir, ayrı bir dokunuş GEREKMEZ |
| `ReservationShareView` | ❌ Hayır | Yalnız STORED snapshot'ı gösterir, yeniden hesaplama yapmaz — rezervasyon oluşturulduğu anda zaten doğru/yanlış karar verilmiş olacak |
| `/v/[token]` | ✅ Evet (otomatik) | AYNI `BookingSidebar` kod yolu |
| PDF | ❌ Kapsam dışı | Havuz ısıtmayı hiç göstermiyor (bugün de göstermiyor) |
| Email | ❌ Kapsam dışı | Aynı — hiçbir mail template'i pool heating içermiyor |
| Webhook | ❌ Kapsam dışı | Repo genelinde webhook + pool_heating kesişimi YOK |
| CSV | ❌ Kapsam dışı | Aynı |

---

## 9. Server Güvenliği

Mevcut mimari İKİ FARKLI güvenlik seviyesinde çalışıyor — bunu net ayırmak önemli:

1. **Public reservation create** (`app/api/public/reservations/route.ts`): `verifyPublicReservationPrice` çağrılır; genel toplam (`total_price_try` vb.) yalnız **compare/log** (enforcement YOK, fail-open — kod içindeki kendi yorumu: *"Hiçbir şeyi reject etmez... booking AYNEN sürer"*). AMA havuz ısıtmanın 4 snapshot kolonu (`pool_heating_selected`, `original_pool_heating_total`, `original_pool_heating_currency`, `pool_heating_total_try`) **AÇIKÇA override edilir** (route satır 71-78) — client'ın gönderdiği DEĞİL, `computeAuthoritativePoolHeatingSnapshot`'ın villa'nın GERÇEK `pool_heating_fee`'siyle YENİDEN hesapladığı değer DB'ye yazılır. **Bu, kullanıcının "manuel payload ile poolHeating=1 gönderilse bile" endişesini BUGÜN BİLE (ay kuralı olmadan) zaten karşılayan bir tasarım** — `useBookingEngine.ts`'in ürettiği `?poolHeating=1` URL'i manipüle edilse dahi, server SONUÇ TUTARINI kendi hesaplar.
   - Ay kuralı eklendiğinde: `computeAuthoritativePoolHeatingSnapshot`'a `startDate`/`endDate` + villa'nın `pool_heating_months`'u eklenir, `isPoolHeatingActiveForRange` sonucu `selected` ile AND'lenir → client "seçtim" dese bile, sezon dışıysa server 0 yazar. **Bu TAM OLARAK istenen "server tarafı da bu bilgiyi dikkate almalı" davranışı.**
2. **Admin reservation create/update** (`app/api/admin/reservations/route.ts`, `.../[id]/route.ts`): `createReservation`/`updateReservationFull` DOĞRUDAN çağrılır — **HİÇBİR server-side recompute/verify YOK**, `payload-create.ts`/`payload-update.ts` admin formunun gönderdiği `pool_heating_*` değerlerini AYNEN yazar. Bu, admin'in yetkili/güvenilir kullanıcı olduğu varsayımıyla BİLİNÇLİ bir tasarım (public flow'daki gibi bir "client'a güvenme" endişesi admin için düşünülmemiş).
   - **Karar gerektiren nokta:** Kullanıcının talebi "server tarafındaki doğrulama" derken YALNIZ public flow'u mu kastediyor, yoksa admin panelinde de (örn. bir personel yanlışlıkla/bilerek sezon dışı bir tarihte ısıtma işaretlerse) aynı enforcement isteniyor mu? Mevcut kod hiçbir admin-tarafı server enforcement'ı OLMADIĞI için, bu YENİ bir karar gerektirir — mevcut sistemi "yeniden tasarlamadan" en düşük riskli yol, admin tarafında da AYNI `isPoolHeatingActiveForRange` kontrolünü `computeReservationPriceRecalc.ts`/`computeCustomPriceToggle.ts` gibi CLIENT-SIDE recompute noktalarına eklemektir (bunlar zaten `calculateGrandTotal`'ı çağırıyor, madde 5'teki düzeltme onları OTOMATİK kapsar) — admin API route'larına AYRI bir server-verify katmanı eklemek, mevcut admin mimarisinde (client-trusted) BÜYÜK bir mimari değişiklik olur ve bu analizin/isteğin kapsamını aşar.

**Reservation snapshot ile client payload/server verification arasındaki akış:** client (ister public ister admin formu) `pool_heating_selected` + hesapladığı tutarı gönderir → public route'ta server bu tutarı YOK SAYIP kendi hesabını yazar (enforcement) → admin route'ta server client'ın hesabına GÜVENİR (bugünkü tasarım, değişmiyor önerilen planda) → her iki durumda da DB'ye yazılan値, kaynağında (`calculateGrandTotal` ya da `computeAuthoritativePoolHeatingSnapshot`) ay kuralını uyguladığı sürece SONUÇ doğru olur.

---

## 10. DB Migration

**Migration GEREKLİ** — mevcut `villa` tablosunda ay bilgisini tutacak bir alan yok.

- **Tablo:** `villa`
- **Kolon:** `pool_heating_months`
- **Tip:** `jsonb` (Bölüm 2'deki gerekçeyle — `text[]`/`smallint[]` DEĞİL, `pg-array-columns.ts` dokunuşundan kaçınmak için)
- **Default:** `NULL` (backfill YOK — migration 074/075 ile birebir aynı felsefe: *"Backfill YOK; DEFAULT değerler ALTER anında otomatik uygulanır"*)
- **1595 mevcut villa için:** Hiçbiri etkilenmez — `pool_heating_months IS NULL` → application-layer'da "kısıtlama yok, 12 ay aktif" olarak yorumlanır (Bölüm 3), mevcut davranış BYTE-IDENTICAL kalır.
- **Idempotent:** `ADD COLUMN IF NOT EXISTS` (074/075 ile aynı desen).
- **RLS/GRANT:** 074/075'in kendi gerekçesiyle aynı — satır-seviyesi RLS kolon eklemekten etkilenmez, tablo-seviyesi GRANT'lar otomatik kapsar; EK RLS/GRANT GEREKMEZ.
- **`reservations` tablosu:** Yeni bir kolon GEREKMİYOR — Bölüm 4'te açıklandığı gibi, "hangi gecelerin ısıtmalıydı" bilgisi ayrıca saklanmıyor (migration 075'in felsefesiyle tutarlı); mevcut 4 snapshot kolonu (`pool_heating_selected`, `original_pool_heating_total`, `original_pool_heating_currency`, `pool_heating_total_try`) YETERLİ — sezon kuralı yalnızca bu kolonlara YAZILACAK DEĞERİ etkiler, şemayı değil.

**HENÜZ migration dosyası oluşturulmadı** (talimat gereği).

---

## 11. Dosya Etki Analizi

### A) Muhtemelen değişmesi gereken dosyalar

| Dosya | Neden |
|---|---|
| `db/migrations/0XX_villa_pool_heating_months.sql` (yeni) | Yeni kolon |
| `types/database.ts` (`VillaRow`) | Yeni alan tipi |
| `lib/price.engine.ts` | `isPoolHeatingActiveForRange` (yeni saf fonksiyon) + `calculateGrandTotal`'a yeni opsiyonel parametre |
| `app/services/reservation/_helpers/pool-heating-verify.ts` | `PoolHeatingSnapshotInput`'a tarih + ay listesi eklenmesi, server-authoritative kontrol |
| `app/services/reservation/_helpers/price-verify.ts` | `computeAuthoritativePoolHeatingSnapshot`'a yeni girdileri geçirmek (villa'nın `pool_heating_months`'unu `findVillaCleaningConfig`'den okumak) |
| `lib/db/reservation.repository.ts` (`findVillaCleaningConfig`) | SELECT projeksiyonuna `pool_heating_months` eklenmesi |
| `lib/db/villa.repository.server.ts` (`findAvailabilityConfigById`, `findContextById`) | Aynı SELECT genişlemesi |
| `app/services/villa.service.ts` | VillaDTO tipi + mapper'a `pool_heating_months` passthrough (NULL-safe, cleaning_fee değil pool_heating_fee deseniyle) |
| `app/api/public/villas/[id]/availability/route.ts` | `config` shape'ine yeni alan |
| `app/services/villa-admin/types.ts`, `_helpers/normalizers.ts` (yeni `normalizePoolHeatingMonths`), `_helpers/payload.ts` (`VillaCorePayload` + `buildVillaCorePayload`) | Admin form → DB yazma zinciri |
| `app/(admin)/maki-admin/villas/_types/villa-form-data.ts` | `VillaFormData` tipi + `initialVillaFormData` |
| `app/components/admin/villa-form/types.ts` | Aynı form tipi (paylaşılan create/edit tipi) |
| `app/components/admin/villa-form/PricingStep.tsx` | Yeni "Isıtma Uygulanan Aylar" açılır paneli UI |
| `app/(admin)/maki-admin/villas/_helpers/hydrate.ts` | Mevcut villa satırından `pool_heating_months` hydrate |
| `app/components/villa/booking/BookingSummary.tsx` | Checkbox gate'ine sezon kontrolü eklenmesi |
| `app/components/villa/booking/useBookingEngine.ts` | Yeni villa alanını kabul etmek + `calculateGrandTotal`'a geçirmek |
| `app/components/reservation/ReservationForm.tsx` | Aynı — kendi `calculateGrandTotal` çağrıları + display gate |
| `app/components/admin/reservation-form/PriceStep.tsx` | Admin create checkbox gate'i |
| `app/(admin)/maki-admin/reservations/[id]/_helpers/computeReservationPriceRecalc.ts`, `computeCustomPriceToggle.ts`, `computeVillaChangeReset.ts` | `calculateGrandTotal`'a yeni parametre geçirmek (villa/tarih değişince doğru yeniden hesap) |
| `app/services/reservation/_helpers/select-shapes.ts` (`SELECT_RESERVATION_DETAIL`) | Villa embed'ine `pool_heating_months` eklenmesi (admin detay sayfasının villa context'i için) |
| `app/(admin)/maki-admin/reservations/ekle/page.tsx` | `calculateGrandTotal` çağrısı + `selectedVilla.pool_heating_months` |
| Test dosyaları (`tests/unit/*pool-heating*`, `price-engine.test.ts` vb.) | Yeni davranış için ek testler / mevcutların güncellenmesi |

### B) Kesinlikle değişmemesi gereken dosyalar

| Dosya | Neden |
|---|---|
| `db/migrations/074_villa_pool_heating.sql`, `075_reservations_pool_heating.sql` | Tarihsel migration'lar, geriye dönük değiştirilmez |
| `lib/price.engine.ts` → `calculatePoolHeatingFee` **imzası** | Değişmez; yalnız ona giden `selected` parametresi çağıran taraf tarafından AND'lenir |
| `reservations` tablosu / migration | Yeni kolon GEREKMİYOR (Bölüm 10) |
| `app/(public)/rezervasyon-kontrol/ReservationShareView.tsx`, `share.resolve.ts` | Salt stored-snapshot görüntüleyici, yeniden hesap yapmıyor |
| `app/(admin)/maki-admin/reservations/[id]/_components/PriceCard.tsx` | Salt-okunur gösterim; `pool_heating_selected` zaten korunuyor, kurala göre yeniden hesaplanan DEĞER otomatik yansır — component'in kendisi değişmez |
| `app/components/admin/reservation-form/LiveDatePriceSummary.tsx` | Salt display, otomatik doğru değer alır |
| Mail template'leri, PDF, webhook, CSV export | Pool heating'e hiç dokunmuyorlar bugün de |
| `app/services/villa-admin/create.service.ts`, `update.service.ts` | `buildVillaCorePayload`'ı ÇAĞIRIYORLAR ama kendileri alan-bazlı bir mantık içermiyor — payload helper'ı değiştiği için OTOMATİK kapsanırlar, kendi kod satırları değişmez |
| `lib/db/villa.repository.server.ts` → `insertVilla`/`updateVillaById` | Generic `.insert()/.update(payload)` — yeni alan payload objesinde geldiği için repository METODU değişmez (yalnız SELECT metodları değişir, INSERT/UPDATE metodları değişmez) |
| `app/(admin)/maki-admin/reservations/[id]/_components/DateRangeCard.tsx` | Zaten hesaplanmış `priceDetail.poolHeating`'i geçiriyor, kendi mantığı yok |
| `db/migrations/073_villa_pool_sheltered.sql` ve diğer ilgisiz migration'lar | Konu dışı |

---

## 12. Uygulama Planı (gerçek koda göre, spekülatif değil)

1. **DB alanı** — `db/migrations/0XX_villa_pool_heating_months.sql`: `ALTER TABLE villa ADD COLUMN IF NOT EXISTS pool_heating_months jsonb NULL;` (074/075 formatıyla birebir aynı doc-comment üslubu).
2. **Type/DTO** — `types/database.ts` (`VillaRow`), `app/services/villa.service.ts` (VillaDTO tipi + mapper, NULL passthrough), `app/services/villa-admin/types.ts`.
3. **Merkezi helper** — `lib/price.engine.ts`'e `isPoolHeatingActiveForRange` (+ gerekiyorsa dahili `getMonthsInRange`) eklenmesi, `calculateGrandTotal` imzasına opsiyonel `pool_heating_months` parametresi.
4. **Server verification** — `pool-heating-verify.ts` (`PoolHeatingSnapshotInput`'a tarih + ay listesi) ve `price-verify.ts` (`findVillaCleaningConfig` SELECT genişletme + yeni alanları geçirme).
5. **Repository SELECT genişletmeleri** — `findAvailabilityConfigById`, `findContextById` (villa.repository.server.ts), `findVillaCleaningConfig` (reservation.repository.ts), `SELECT_RESERVATION_DETAIL` (select-shapes.ts).
6. **Admin villa formu (yazma zinciri)** — `normalizers.ts` (yeni `normalizePoolHeatingMonths`), `payload.ts` (`VillaCorePayload` + `buildVillaCorePayload`), `villa-form-data.ts`/`villa-form/types.ts` (form state tipi), `hydrate.ts` (mevcut villa → form state).
7. **Admin villa formu UI** — `PricingStep.tsx`'e "Isıtma Uygulanan Aylar" açılır/kapanır panel (Tümünü Seç/Kaldır dahil), mevcut 5 kolonlu grid'i bozmadan.
8. **Public booking UI** — `useBookingEngine.ts` (yeni villa alanını kabul + `calculateGrandTotal`'a geçir), `BookingSummary.tsx` (checkbox gate'ine sezon kontrolü), `/api/public/villas/[id]/availability/route.ts` (config shape), `kiralik-villa/[slug]/page.tsx` + `v/[token]/page.tsx` (villa alanını `BookingSidebar`'a geçirme).
9. **Public `/rezervasyon/[slug]`** — `ReservationForm.tsx`'in kendi `calculateGrandTotal` çağrıları + display gate (satır 555).
10. **Admin reservation create/edit UI** — `PriceStep.tsx` (create, checkbox gate), `computeReservationPriceRecalc.ts`/`computeCustomPriceToggle.ts`/`computeVillaChangeReset.ts` (edit, `calculateGrandTotal` parametre geçişi), `reservations/ekle/page.tsx`.
11. **Testler** — mevcut `tests/unit/*pool-heating*.test.ts` dosyaları (zaten 15+ test dosyası var) güncellenir/genişletilir + `price-engine.test.ts`'e `isPoolHeatingActiveForRange`/ay-sınırı testleri (28 Mayıs→3 Haziran gibi sınır durumları dahil) eklenir.
12. **Doğrulama** — `npx tsc --noEmit`, ilgili ESLint, `git diff --check`, tüm `*pool-heating*` testlerinin çalıştırılması, ayrıca mevcut (bu konuşma boyunca birkaç kez rastlanan) pre-existing başarısız testlerin (`saveAllOrchestrationContract`, `updateVillaPageOrchestrationContract`) bu değişiklikten ETKİLENMEDİĞİNİN `git stash` ile doğrulanması.

Bu sıralama, önce veri modelini + merkezi kuralı sağlamlaştırıp, sonra dıştan içe (server → booking engine → UI'lar) ilerleyecek şekilde, her adımın bir öncekine bağımlı olduğu gerçek bağımlılık grafiğine göre kurulmuştur.

---

## ÖNERİLEN ÇÖZÜM

`villa` tablosuna `pool_heating_months jsonb NULL DEFAULT NULL` kolonu eklenir (074/075 ile aynı idempotent/backfill'siz desen). `NULL` = "kısıtlama yok, 12 ay aktif" (mevcut 1595 villa BYTE-IDENTICAL kalır). Sezon kontrolü TEK bir saf fonksiyon olarak (`lib/price.engine.ts`'e, kavramsal ad: `isPoolHeatingActiveForRange`) yazılır ve YALNIZ kod tabanındaki gerçek 2 merkezi hesaplama noktasına (`calculateGrandTotal` ve `computeAuthoritativePoolHeatingSnapshot`) bir ön-koşul olarak eklenir — bu iki nokta zaten TÜM public/admin UI ve server akışlarını besliyor, bu yüzden "10 yerde kopyalama" riski yok. Kural: rezervasyonun kapsadığı TÜM gecelerin takvim ayı `pool_heating_months` içinde olmalı (kısmi ay desteklenmez — mevcut `nights × fee` tek-çarpım tasarımıyla ve migration 075'in "gece bazlı ek kolon yok" felsefesiyle uyumlu tek seçenek). Ayrıca checkbox GÖRÜNÜRLÜĞÜ için `BookingSummary.tsx` (public, tek nokta — Sidebar+Modal ortak) ve `PriceStep.tsx` (admin create) gate'lerine AYNI kontrol eklenir. Admin panelinde "Isıtma Uygulanan Aylar" mevcut 5 kolonlu "Ekstra Ücretler" grid'ini bozmadan, "Havuz Isıtma Ücreti" hücresinin içinde açılır/kapanır bir panel olarak eklenir.

## DEĞİŞECEK DOSYALAR
Bölüm 11-A'daki ~25 dosya — migration, tipler, merkezi helper (`price.engine.ts`), server verification (`pool-heating-verify.ts`, `price-verify.ts`), 4 repository SELECT projeksiyonu, admin villa formu zinciri (normalizer/payload/tip/hydrate/UI), public booking zinciri (`useBookingEngine`, `BookingSummary`, availability route, iki villa-detay sayfası), public `/rezervasyon/` sayfası, admin reservation create/edit hesap dosyaları, ilgili testler.

## DEĞİŞMEYECEK DOSYALAR
Bölüm 11-B — mevcut migration'lar (074/075), `calculatePoolHeatingFee`'nin imzası, `reservations` tablosu/şeması, salt-okunur/salt-display bileşenler (`ReservationShareView`, `share.resolve.ts`, `PriceCard.tsx`, `LiveDatePriceSummary.tsx`), mail/PDF/webhook/CSV (zaten pool heating'e dokunmuyorlar), villa create/update servis fonksiyonlarının kendi kod satırları, villa repository'nin INSERT/UPDATE metodları.

## DB DEĞİŞİKLİĞİ
Tek migration: `villa.pool_heating_months jsonb NULL DEFAULT NULL` (idempotent `ADD COLUMN IF NOT EXISTS`, backfill YOK). `reservations` tablosunda YENİ KOLON GEREKMİYOR. `jsonb` seçildiği için `lib/db/pg-array-columns.ts`'e dokunmaya gerek YOK (gerçek Postgres array tipi seçilseydi gerekirdi — bu proje-özgü tuzak analiz sırasında tespit edildi).

## MERKEZİ KURAL
`lib/price.engine.ts` içinde tek bir saf fonksiyon (`isPoolHeatingActiveForRange` kavramı), yalnız kod tabanındaki GERÇEK 2 çağrı noktasına (`calculateGrandTotal`, `computeAuthoritativePoolHeatingSnapshot`) eklenir. Checkbox görünürlüğü için AYRICA `BookingSummary.tsx` ve `PriceStep.tsx` (admin create) gate'lerine aynı kontrol taşınır (hesaplama motoru düzelmesi checkbox'ı otomatik gizlemez, ayrıca dokunulmalı).

## REZERVASYON TARİHİ KURALI
Rezervasyonun kapsadığı TÜM geceler `pool_heating_months` içinde olmalı; tek bir gece bile dışarıdaysa (örn. 28 Ağustos→3 Eylül, 28 Mayıs→3 Haziran) ısıtma seçeneği tamamen kapanır. Bu, kullanıcının tercihiyle örtüşüyor VE `calculatePoolHeatingFee`'nin "tek toplam, gece bazlı kısmi hesap yok" tasarımıyla + migration 075'in "ek gece-snapshot kolonu yok" felsefesiyle tek uyumlu seçenek.

## GERİYE DÖNÜK DAVRANIŞ
`pool_heating_months IS NULL` (mevcut 1595 villanın TAMAMI, migration sonrası) = "kısıtlama yok, 12 ay aktif" — bugünkü davranışla BYTE-IDENTICAL. "Ocak-Mayıs + Eylül-Aralık" varsayımı yalnızca YENİ villa formunun (create) ilk UI state'i için düşünülebilir; DB'de mevcut kayıtlara BACKFILL EDİLMEMELİ.
