# İndirimli Villa — TAM DOLULUK FİLTRESİ + GEÇMİŞ İNDİRİM TEMİZLİĞİ
## SALT-OKUMA AUDIT

**Tarih:** 2026-09-22 · **HEAD:** `682a822 fix: validate discount villa availability before reservation`
**Durum:** Hiçbir kod/migration/DB değişmedi. Uygulama için onay bekleniyor.
**Yöntem:** Yalnız repo kodu + migration dosyaları. Production DB / Coolify / Hetzner'a **erişilmedi**.

---

# BÖLÜM 1 — TAM DOLULUK FİLTRESİ

## 1.1 Mevcut durum (production'da ne var?)

`682a822` ile şu an çalışan davranış:

```
lib/cache.helpers.ts  getCachedDiscountCollectionVillas
  → selectedDiscount = visibleDiscounts(end_date >= bugün), start_date ASC, İLK
  → pencere gruplama + getBlockedVillaIds(start, end, ids)
  → discount_available: boolean
DiscountCollection.tsx → VillaCard discountAvailable={...}
VillaCard.tsx:~505     → if (discountAvailable === false) return null
                       → router.push(discountReserveHref ?? detailHref)
```

**Eksik olan:** `getBlockedVillaIds` yalnız *"herhangi bir çakışma var mı?"* sorusunu cevaplar. 1/7 gece dolu ile 7/7 gece dolu **aynı** sonucu verir. Bu yüzden "tamamen dolu" ayrımı bugün **yapılamıyor**.

## 1.2 Availability kaynaklarının kapsamı (KANIT)

`db/migrations/_archive/legacy/039_availability_rpc.sql` gövdesi:

| Kaynak | `get_blocked_villa_ids` | `get_villa_blocked_ranges` |
|---|---|---|
| `reservations` **pending** | ✅ | ✅ |
| `reservations` **confirmed** | ✅ | ✅ |
| `reservations` rejected/cancelled | ❌ (bloklamaz — allow-list) | ❌ |
| `manual_reservations` (admin blokları) | ✅ **tümü**, status filtresi yok | ✅ |
| `external_calendar_events` (`is_active=true`) | ✅ | ❌ **DAHİL DEĞİL** (migration 039 satır 24-25, 81) |

Overlap kuralı (her iki RPC + `reservation.service` + DB EXCLUDE constraint'te **birebir aynı**):

```sql
existing.start_date < range.end  AND  existing.end_date > range.start   -- half-open [)
```

→ Bitişik checkout/checkin **çakışma değildir** (1–5 ile 5–10 müsait; 1–5 ile 4–7 dolu).

**Sonuç:** tam doluluk hesabı **yalnız `get_blocked_villa_ids` üzerinden** yapılmalı; `get_villa_blocked_ranges` external takvimleri kaçırır ve CTA kapısıyla asimetri yaratır.

## 1.3 Tam doluluk nasıl hesaplanacak — GECE BAZLI TOPLU TARAMA

Pencere `[S, E)` için N = E − S gece. Mevcut toplu RPC **tek geceye** çağrılır:

```
getBlockedVillaIds(gece, gece+1, adaylar)
```

| Villa | Sonuç |
|---|---|
| Hiçbir gecenin blocked kümesinde değil | **tamamen müsait** → kart göster + CTA rezervasyon |
| Bazı gecelerde var | **kısmen dolu** → kart göster + CTA villa detay |
| **Tüm** gecelerde var | **tamamen dolu** → dönem elenir |

**İki kademe (sorgu tasarrufu):**
1. **Kademe 1 (bugün zaten var):** pencere başına 1 sorgu → blocked villa yoksa o dönem tamamen müsait, gece taraması **hiç çalışmaz**.
2. **Kademe 2 (yeni):** yalnız blocked alt küme için gece gece tarama; her adımda aday kümesi daralır, küme boşalınca **erken çıkış** (`break`).

**Tarih matematiği yeni değil:** gece sınırı `parseLocalDate` + `formatLocalDate` ile üretilir — `lib/stay-rules.helper.ts:85 shiftKey` ve `AramaPageBody:192 shiftYmd` ile aynı desen. **İndirim tarihlerine +1 gün EKLENMEZ**; üretilen gece sınırları yalnız iç hesapta kalır, URL'ye **asla** yazılmaz.

## 1.4 Çoklu indirim dönemi

**Mevcut seçim mantığı** (`cache.helpers.ts:613-631`): `visibleDiscounts` (end_date ≥ bugün) → `start_date` ASC → **İLK** kayıt.

**Önerilen (mevcut mantığı bozmadan, yalnız filtre ekleyerek):**

> `start_date` ASC sırası **aynen korunur**; **tamamen dolu** dönemler atlanır; kalan **EN ERKEN** dönem seçilir.

| Senaryo | Sonuç |
|---|---|
| 10–17 tamamen dolu · 20–27 tamamen müsait | Kart **var**, dönem **20–27**, CTA **rezervasyon** |
| 10–17 tamamen dolu · 20–27 kısmen dolu · 30 Eki–5 Kas tamamen müsait | Kart **var**, dönem **30 Eki–5 Kas**, CTA **rezervasyon** |
| 10–17 tamamen dolu · 20–27 kısmen dolu (başka yok) | Kart **var**, dönem **20–27**, CTA **villa detay** |
| **Tüm** dönemler tamamen dolu | Kart **GİZLENİR** (villa `result`'a hiç eklenmez) |

⚠️ Bu, aday pencere kümesini `selectedDiscount`'tan **tüm `visibleDiscounts`**'a genişletir. Villaların çoğunda tek indirim kaydı olduğu için pratik sorgu farkı ihmal edilebilir.

## 1.5 Filtreleme noktası

**`lib/cache.helpers.ts > getCachedDiscountCollectionVillas` içi** — `discount_available`'ın zaten hesaplandığı yer.

* Repository/SQL katmanında filtrelemek **yeni RPC** gerektirir → yasak.
* `DiscountCollection`'da filtrelemek cache dışına çıkar.
* `VillaCard`'da filtrelemek kart zaten render edildikten sonra olur.
* Cache içinde filtrelenirse **`DiscountCollection.tsx` ve `VillaCard.tsx` HİÇ DEĞİŞMEZ** — `collection` dizisi filtrelenmiş gelir, mevcut `if (collection.length === 0) return null` kendiliğinden çalışır.

## 1.6 Sorgu sayısı / N+1

**W** = distinct `(start_date, end_date)` pencere · **N_w** = pencerenin gece sayısı · **B_w** = pencerede ≥1 blocked villa var mı.

```
Sorgu = W  +  Σ (yalnız B_w=true pencereler) N_w        ← erken çıkış sayesinde pratikte daha az
```

| Senaryo | Hiç dolu yok | En kötü (7 gecelik pencereler) |
|---|---|---|
| 10 villa, 1 pencere | **1** | 1 + 7 = **8** |
| 10 villa, 3 pencere | **3** | 3 + 21 = **24** |
| 100 villa, 20 pencere | **20** | 20 + 140 = **160** |
| **1500 villa, 1 pencere** | **1** | **8** |

➡️ **Villa sayısı sorgu sayısını etkilemez.** N+1 yapısal olarak imkânsız — ölçek yalnız *pencere × gece* ile büyür. Her sorgu `p_villa_ids` ile scope'lu ve migration'daki overlap indekslerini (`idx_reservations_avail`, `idx_manual_reservations_avail`, `external_calendar_events_overlap_idx`) kullanır.

⚠️ **Guard:** çok uzun pencere (örn. 90 gece) tek başına 90 sorgu üretir. `N_w > 31` ise gece taraması atlanıp dönem **"kısmen dolu"** kabul edilmeli → kart gösterilir, CTA detaya gider. Hata **güvenli yönde**: asla yanlışlıkla gizlemez.

## 1.7 Cache / ISR

| Katman | Değer | Değişecek mi? |
|---|---|---|
| `getCachedDiscountCollectionVillas` | `revalidate: 600`, `tags:["discount","villa-reviews"]`, key `["discount-collection:get"]` | **HAYIR** |
| Ana sayfa `/`, `/tr`, `/en`, `/de` | `○` statik prerender, 10 dk | **HAYIR** |
| Admin değişikliği | `revalidateDiscount()` → `revalidateTag("discount",{expire:0})` → anında | **HAYIR** |

🔴 **Doğrulanan bulgu:** rezervasyon oluşturma akışında **hiçbir `revalidateTag` çağrısı yok** (`app/api/public/reservations/route.ts` + `app/services/reservation/**` tarandı, sıfır eşleşme). Dolayısıyla tamamen dolan bir villa **≤10 dakika** içinde (TTL ile) bölümden çıkar; rezervasyon iptal edilince de **≤10 dakika** içinde otomatik geri gelir. Kullanıcının istediği "otomatik geri görünme" davranışı **mevcut mekanizmayla zaten sağlanır.**

**Yeni cache invalidation önerilmiyor:** `revalidateDiscount()`'ı rezervasyon akışına eklemek (a) do-not-touch listesindeki rezervasyon akışına dokunur, (b) yoğun sitede her rezervasyonda ana sayfa cache'ini düşürür.

**Availability ziyaretçi başına ÇALIŞMAZ** — `unstable_cache` + ISR sayesinde 10 dakikada bir, cache regenerasyonunda çalışır.

---

# BÖLÜM 2 — GEÇMİŞ İNDİRİMLERİN FİZİKSEL SİLİNMESİ

## 2.1 "Tamamen geçmiş" ne demek? (gerçek semantik doğrulaması)

Repo kanıtları:

| Kaynak | İfade |
|---|---|
| `db/migrations/079_villa_discounts.sql` "TARİH MANTIĞI" | `start_date`/`end_date` **kapalı interval, ikisi de dahil** (`villa_prices` ile aynı) |
| `lib/price.engine.ts:193-198 getActiveDiscount` | `d >= s && d <= e` |
| `app/components/admin/villa-form/DiscountsSection.tsx:94-100` | `nightsInclusive = (e − s) + 1` → admin ekranında **"N gece"** |
| `lib/cache.helpers.ts:613-622` (public görünürlük) | `end_date >= bugün` → **görünür kalır** |
| `app/services/discount-collection.service.ts:79-91` (admin görünürlük) | `end_date >= bugün` → **görünür kalır** |
| `app/api/cron/villa-prices-cleanup/route.ts` (`villa_prices` temizliği) | `end_date < today` **STRICT `<`** — *"bugün biten sezon KORUNUR; ertesi gün silinir. `<=` KULLANILMAZ."* |

> **Not — end_date semantiği:** repo kodu `end_date`'i *son indirimli gece* olarak yorumlar (migration 079 + price engine + admin "N gece"). Siz ise önceki turda ürün kuralı olarak *çıkış (checkout) tarihi* olduğunu belirttiniz ve CTA buna göre düzeltildi (`682a822`).
> **Temizlik kuralı açısından bu ayrım SONUÇ DEĞİŞTİRMEZ:** her iki okumada da dönem `end_date < bugün` olduğunda tamamen bitmiştir. Ayrıca bu kural, projedeki **mevcut iki görünürlük filtresiyle (`end_date >= bugün` → görünür) tam simetriktir** ve `villa_prices` temizliğinin **birebir aynı** kuralıdır.

### ✅ KESİN KURAL

```
SİL:  villa_discounts.end_date  <  bugün        (STRICT <)
SAKLA: end_date >= bugün  → devam eden VE gelecek tüm indirimler
```

**Sizin örneğiniz doğrulandı:** `start 2026-09-10 / end 2026-09-17` → `2026-09-18` günü `09-17 < 09-18` → **silinir**. `2026-09-17` günü silinmez (o gün hâlâ görünür/geçerli).

**"Bugün" nasıl hesaplanır:** `villa-prices-cleanup` ile birebir — `new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" })` → `"YYYY-MM-DD"`. İndirim tarihleri admin tarafından TR-local girildiği için doğru referans budur.

## 2.2 Mevcut cron/job altyapısı — VAR

`app/api/cron/` altında **beş** çalışan cron route'u:

| Route | Zamanlayıcı | İş |
|---|---|---|
| `external-calendar-sync` | `vercel.json` `0 */4 * * *` | iCal senkron |
| `exchange-rates-refresh` | `vercel.json` `0 6 * * *` | TCMB kurları |
| `mail-logs-cleanup` | `vercel.json` `0 3 * * *` | **fiziksel DELETE** |
| `activity-logs-cleanup` | `vercel.json` `30 3 * * *` | **fiziksel DELETE** |
| `short-gaps-refresh` | **Coolify Scheduled Task** `0 4 * * *` (kod yorumunda) | precompute tazeleme |
| `villa-prices-cleanup` | **Coolify Scheduled Task** `0 0 * * *` (kod yorumunda) | **geçmiş `villa_prices` fiziksel DELETE** |

Ortak desen (hepsi birebir aynı):

```
GET /api/cron/<ad>
  → authorizeCronRequest(req)      lib/cron-auth.ts — Bearer CRON_SECRET, fail-closed
  → <alan>.repository.server.ts    dbAdmin (service-role), "server-only"
  → tek DELETE  .delete({count:"exact"}).lt(...)
  → { ok, deleted, date }          JSON
  → runtime="nodejs", dynamic="force-dynamic"
```

### 🎯 `villa-prices-cleanup` = birebir şablon

```ts
// lib/db/villa-price.repository.server.ts
async deletePastSeasons(today: string) {
  return await dbAdmin.from("villa_prices")
    .delete({ count: "exact" })
    .lt("end_date", today);
}
```

`villa_discounts` için gereken **tam olarak bunun kardeşi**. Yeni mimari, yeni desen, yeni altyapı **yok**.

**Sayfa ziyaretinde DELETE çalıştırma kesinlikle önerilmiyor** — proje bu işi zaten cron'a taşımış; ISR/statik sayfada yan etkili DELETE mimariye aykırı.

## 2.3 DELETE hangi dosyada/katmanda?

```
app/api/cron/villa-discounts-cleanup/route.ts     ← YENİ (thin wrapper, ~60 satır)
lib/db/villa-discount.repository.server.ts        ← MEVCUT dosyaya TEK metod eklenir
      async deletePastDiscounts(today: string) {
        return await dbAdmin.from("villa_discounts")
          .delete({ count: "exact" })
          .lt("end_date", today);
      }
```

`villa-discount.repository.server.ts` zaten `deleteDiscountById` içeriyor → yeni repository **gerekmiyor**, servis katmanı **gerekmiyor** (diğer cleanup cron'ları da servis kullanmıyor).

**Zamanlama:** Coolify Scheduled Task, `villa-prices-cleanup` ile çakışmayacak şekilde (örn. `15 0 * * *`). ⚠️ Coolify konfigürasyonu repoda değil — task'ı **sizin** eklemeniz gerekir; kod tarafı hazır olur.

## 2.4 DB güvenliği — FK / CASCADE / referans analizi

**Tablo tanımı** (`db/migrations/079_villa_discounts.sql:134-160`):

```sql
CREATE TABLE public.villa_discounts (
  id             uuid PRIMARY KEY ...,
  villa_id       uuid NOT NULL REFERENCES public.villa(id) ON DELETE CASCADE,
  start_date date, end_date date, discount_type text, discount_value numeric, currency text,
  CONSTRAINT villa_discounts_valid_range / _type_check / _value_positive /
             _percent_range / _currency_consistency,
  EXCLUDE villa_discounts_no_overlap (gist)
);
```

| Soru | Cevap | Kanıt |
|---|---|---|
| Giden FK var mı? | **Evet, tek:** `villa_id → villa(id) ON DELETE CASCADE`. Bu, *villa silinince indirim silinir* yönünde çalışır. Ters yön **yok** — indirim silmek villayı **etkilemez**. | migration 079:136 |
| **Bu kayda referans veren başka tablo var mı?** | **HAYIR.** `db/` dizini tarandı: `references public.villa_discounts`, `villa_discounts(id)`, `villa_discount_id` → **sıfır eşleşme**. | grep |
| Cascade delete riski? | **Yok.** `villa_discounts` hiçbir şeyin ebeveyni değil. | — |
| Rezervasyonlar etkilenir mi? | **HAYIR.** `reservations` indirimi **snapshot** olarak saklar: `discount_applied`, `discount_type`, `discount_value`, `discount_currency`, `original_stay_total_try`, `stay_discount_amount_try` (migration 080). FK **yok**, denormalize kolonlar. | migration 080:98-112 |
| Raporlama/istatistik bağlı mı? | **Hayır** — geçmiş indirim bilgisi zaten `reservations` snapshot kolonlarında. | migration 080 amaç bölümü |

> Migration 080'in yazılış amacı birebir bu: *"Admin daha sonra `villa_discounts`'taki bir indirimi değiştirir/silerse geçmiş rezervasyonun uygulanmış indirimi değişmesin."* **Yani sistem, geçmiş indirimlerin silinebileceği varsayımıyla tasarlanmış.**

**Diğer tüketiciler ve etkisi:** `price.engine` (yalnız aktif/gelecek hesaplar), `price-verify.ts` (rezervasyon oluşturma anında, gelecek tarihler), `getVillaDiscounts` (villa detay/`/rezervasyon`, gelecek tarihler), admin pricing calendar (geçmişi göstermez), `AramaPageBody`/`BookingSidebar` (gelecek tarihler). → **Geçmiş kaydın silinmesi hiçbirini etkilemez.**

## 2.5 `discount_collections` neden KORUNMALI?

1. **Farklı tablo, doğrudan FK yok.** Bağ yalnız `villa_id` üzerinden dolaylı.
2. **Küratörlük verisi taşır:** `sort_order`, `is_active`, `custom_title`, `custom_cover_image`. Silinirse geri gelmez.
3. **Proje bunu zaten bilinçli olarak korumuş.** `listDiscountCollection` kod yorumu:
   > *"`discount_collections` satırı SİLİNMEZ (yalnız bu okuma sonucunda görünmez kalır; villa'ya ileride yeni bir gelecek-tarihli `villa_discounts` eklenirse **otomatik geri görünür**)."*
4. **Otomatik toparlanma:** villaya yeni indirim eklenince kart kendiliğinden geri gelir — ek admin işi yok.

➡️ `villa_discounts` temizliği `discount_collections`'ı **hiç okumaz, hiç yazmaz**. İki taraf tamamen bağımsız.

## 2.6 İdempotanlık / race / transaction

| Soru | Cevap |
|---|---|
| Aynı kayıt iki kez silinirse? | **Sorun değil.** `WHERE end_date < today` → ikinci çalıştırmada eşleşen satır yok → `deleted: 0`, hata yok. `villa-prices-cleanup` ile aynı garanti. |
| Transaction gerekli mi? | **Hayır.** Tek `DELETE` ifadesi PostgreSQL'de zaten atomiktir. |
| Race condition? | **Pratik risk yok.** Eşzamanlı `replace_villa_discounts` (admin kaydet) `pg_advisory_xact_lock(hashtext('villa_discounts:'||villa_id))` alır ve zaten yalnız geçerli/gelecek kayıtlar yazar. En kötü ihtimalle admin'in aynı anda yazdığı geçmiş tarihli bir satır bir sonraki cron'a kalır. |
| Kilitlenme? | Hayır — tek tablo, tek ifade, kısa süre. |
| Cache invalidation gerekli mi? | **Hayır.** Silinen kayıtlar zaten `end_date >= bugün` filtresiyle hem public hem admin tarafında görünmüyordu. Yine de temizlikten sonra `revalidateDiscount()` **opsiyonel** olarak eklenebilir (zararsız, ama gereksiz). |

---

# BÖLÜM 3 — 21 SORUYA KESİN CEVAPLAR

| # | Soru | Cevap |
|---|---|---|
| 1 | Tamamen dolu villa public'te nasıl filtrelenecek? | `lib/cache.helpers.ts > getCachedDiscountCollectionVillas` içinde, villa `result` dizisine **hiç eklenmez**. `DiscountCollection`/`VillaCard` değişmez. |
| 2 | Kısmen dolu villa hangi CTA'ya? | Mevcut fallback: `detailHref` → `/kiralik-villa/<slug>`. (Bugün de böyle çalışıyor.) |
| 3 | Tamamen müsait villa hangi CTA'ya? | `/rezervasyon/<slug>?start=<start_date>&end=<end_date>` — **tarihler aynen**, +1 gün yok. |
| 4 | Çoklu dönem nasıl seçilecek? | Mevcut `start_date` ASC sırası korunur; **tamamen dolu** dönemler atlanır; kalan en erken dönem seçilir. |
| 5 | Tüm dönemler doluysa? | Villa indirimli koleksiyondan **gizlenir**. `discount_collections` satırı **silinmez**. |
| 6 | Geçmiş indirim ne zaman geçmiş sayılır? | **`end_date < bugün`** (STRICT `<`, Europe/Istanbul takvim günü). `villa_prices` temizliği + iki mevcut görünürlük filtresiyle birebir simetrik. |
| 7 | Mevcut cron altyapısı var mı? | **EVET.** `app/api/cron/*` (6 route) + `lib/cron-auth.ts` (Bearer `CRON_SECRET`) + `vercel.json` crons + Coolify Scheduled Task. |
| 8 | En güvenli mekanizma? | Mevcut desenin kardeşi: yeni `GET /api/cron/villa-discounts-cleanup` + Coolify Scheduled Task. Yeni altyapı yok. |
| 9 | DELETE hangi katmanda? | `lib/db/villa-discount.repository.server.ts` içine `deletePastDiscounts(today)` (mevcut dosya, `dbAdmin`, `server-only`); route yalnız ince sarmalayıcı. |
| 10 | `discount_collections` neden korunmalı? | Küratörlük verisi taşır, doğrudan FK yok, projenin mevcut belgelenmiş kuralı bu, ve yeni indirim eklenince kart otomatik geri gelir. |
| 11 | Cache invalidation nasıl? | **Yeni hiçbir şey gerekmez.** Doluluk filtresi mevcut `revalidate: 600` + tag'lerle taşınır; temizlik zaten görünmeyen kayıtları siler. |
| 12 | Availability sorgu sayısı? | `W + Σ N_w` (yalnız blocked pencere için), erken çıkışla daha az. 10 villa/1 pencere: 1–8. 100 villa/20 pencere: 20–160. |
| 13 | 1500 villada N+1 riski? | **Yok.** Sorgu sayısı villa sayısından **bağımsız**; 1500 villa aynı pencerede → yine 1–8 sorgu. |
| 14 | External calendar events dahil mi? | **EVET** — `get_blocked_villa_ids` `is_active=true` satırları kapsar. (Tekil `get_villa_blocked_ranges` kapsamaz; bu yüzden **kullanılmayacak**.) |
| 15 | FK/cascade riski? | **Yok.** `villa_discounts`'a referans veren tablo yok; tek FK giden yönde (`villa → CASCADE`); rezervasyonlar snapshot kolonları kullanır. |
| 16 | Rezervasyon/fiyat hesabı etkilenir mi? | **Hayır.** `price.engine`, `price-verify`, booking engine, `/rezervasyon` yalnız aktif/gelecek indirimlere bakar; geçmiş rezervasyonlar snapshot'tan okur. |
| 17 | Hangi dosyalar değişecek? | Aşağıdaki tablo. |
| 18 | Hangi dosyalara dokunulmayacak? | Aşağıdaki tablo. |
| 19 | Migration gerekiyor mu? | **HAYIR.** |
| 20 | RPC değişikliği gerekiyor mu? | **HAYIR.** |
| 21 | Hangi testler? | Bölüm 5. |

---

# BÖLÜM 4 — DEĞİŞECEK / DEĞİŞMEYECEK DOSYALAR

## 4.1 Değişecek (toplam 2 kod dosyası + 1 yeni route + testler)

| Dosya | Değişiklik | Büyüklük |
|---|---|---|
| `lib/cache.helpers.ts` | Mevcut availability bloğunun genişletilmesi: çok-dönem aday üretimi, gece bazlı tarama + erken çıkış, gece guard'ı, tamamen dolu dönemin elenmesi, hepsi doluysa villayı `result`'a eklememe | ~70 satır (mevcut blok içinde) |
| `lib/db/villa-discount.repository.server.ts` | **TEK metod ekleme**: `deletePastDiscounts(today)` — `deletePastSeasons`'ın birebir kardeşi | ~8 satır |
| `app/api/cron/villa-discounts-cleanup/route.ts` | **YENİ** — `villa-prices-cleanup` route'unun birebir kardeşi | ~60 satır |
| `tests/unit/discount-collection-availability.test.ts` | Tam/kısmi doluluk, çoklu dönem, sorgu sayısı senaryoları | genişletme |
| `tests/unit/...cleanup...` | Yeni cleanup testi (auth, `.lt` kolonu/değeri, idempotans) | yeni |

**Coolify:** yeni Scheduled Task (`GET /api/cron/villa-discounts-cleanup`, örn. `15 0 * * *`, `Authorization: Bearer $CRON_SECRET`) — **repo dışı, sizin eklemeniz gerekir.**

## 4.2 Kesinlikle dokunulmayacak

`app/components/villa/VillaCard.tsx` (tasarım, className, CTA metni, prop sözleşmesi) · `app/components/home/DiscountCollection.tsx` · `lib/availability.helper.ts` / `.validator.ts` / `.action.ts` · `lib/db/reservation.repository.ts` · `lib/db/discount.repository.ts` · `lib/price.engine.ts` · `lib/stay-rules.helper.ts` · `app/services/reservation/**` · `app/api/public/reservations/route.ts` · `app/components/reservation/**` · `app/components/search/AramaPageBody.tsx` · `app/components/short-gaps/**` · `app/components/villa/booking/**` · villa detay sayfası · **tüm admin tarafı** (`discount-collection` UI, `DiscountsSection`, pricing calendar) · `app/services/discount-collection.service.ts` · `db/migrations/**` · tüm RPC'ler · DB constraint'leri · `lib/cron-auth.ts` · `vercel.json` · mevcut cron route'ları · `revalidate.actions.ts` · cache key/tag/revalidate değerleri · rezervasyon ve villa detay route'ları · `?start=&end=` URL formatı · teknik identifier'lar (`villaId`, `villa_*`, `entity_type`, `permissionKey`).

---

# BÖLÜM 5 — TEST SENARYOLARI

**A) Tam doluluk ayrımı** (7 gecelik pencere 10–17)
1. 0/7 dolu → kart var · `discount_available=true` · CTA rezervasyon `?start=10&end=17`
2. 1/7 dolu (ilk gece) → kart var · CTA detay
3. 1/7 dolu (son gece) → kart var · CTA detay
4. 1/7 dolu (**13–14, kullanıcı örneği**) → kart var · CTA detay
5. **6/7 dolu** → kart **var** · CTA detay ← *"blocked ≠ tamamen dolu" kilidi*
6. 7/7 dolu (tek rezervasyon) → kart **YOK**
7. 7/7 dolu (**bitişik parçalar 10–13 + 13–17**) → kart **YOK** ← *ardışık kapama kilidi*
8. 7/7 dolu kaynak `manual_reservations` → kart **YOK**
9. 7/7 dolu kaynak `external_calendar_events` → kart **YOK** ← *external kapsama kilidi*
10. `pending` rezervasyon bloklar; `cancelled`/`rejected` **bloklamaz**
11. Half-open sınır: 5–10 rezervasyon + 10–17 pencere → çakışma yok · kart var · CTA rezervasyon
12. Half-open sınır: 17–20 rezervasyon → çakışma yok · kart var · CTA rezervasyon

**B) Çoklu dönem**
13. 10–17 tam dolu + 20–27 tam müsait → kart var · dönem **20–27** · CTA rezervasyon
14. 10–17 tam dolu + 20–27 kısmi + 30 Eki–5 Kas tam müsait → dönem **30 Eki–5 Kas** · CTA rezervasyon
15. 10–17 tam dolu + 20–27 kısmi (başka yok) → dönem **20–27** · CTA detay
16. Tüm dönemler tam dolu → kart **YOK**
17. Tek dönem kısmi dolu → dönem değişmez · kart var · CTA detay

**C) Performans**
18. 10 villa aynı pencere, dolu yok → **1 sorgu**
19. 10 villa aynı pencere, ≥1 blocked, 7 gece → **≤8 sorgu**, hepsi `villaIds` scope'lu
20. 100 villa 20 pencere, dolu yok → **20 sorgu**
21. Villa sayısı 10 → 1500 çıkarıldığında **sorgu sayısı sabit**
22. Aday kümesi boşalınca gece taraması **erken çıkar** (çağrı sayısı ölçülür)
23. Uzun pencere guard'ı (`N_w > 31`) → tarama atlanır, kart **gizlenmez**

**D) Kenar / fail-soft**
24. Tek günlük indirim (`start === end`) → sorgu yok · kart **gizlenmez** · davranış öncekiyle birebir
25. Ay/yıl sınırı (28 Ara – 2 Oca) → gece sınırları doğru · URL'de **kaydırma yok**
26. RPC hatası (boş Set) → kart **gizlenmez** · CTA rezervasyon (mevcut davranış)
27. `villa_discounts` boş → kart zaten listelenmez
28. `price`, `currency`, `discount`, sıralama **değişmedi** (regresyon kilidi)
29. Default / curation variant `VillaCard` davranışı **değişmedi**

**E) Geçmiş indirim temizliği**
30. `end_date < bugün` → **silinir**
31. `end_date === bugün` → **SİLİNMEZ** (STRICT `<`)
32. `end_date > bugün` (gelecek) → **SİLİNMEZ**
33. Devam eden indirim (`start < bugün <= end`) → **SİLİNMEZ**
34. Aynı villada geçmiş + gelecek kayıt → **yalnız geçmiş** silinir
35. İkinci çalıştırma → `deleted: 0`, hata yok (**idempotans**)
36. `CRON_SECRET` yok → **503**; yanlış/eksik Bearer → **401**; doğru → 200
37. `discount_collections` satırı **hiç okunmaz/yazılmaz** (repo çağrısı sayısı 0)
38. Silme sonrası `reservations` snapshot kolonları **değişmez**
39. Kolon ve operatör kilidi: `.from("villa_discounts").delete().lt("end_date", today)` — tablo/kolon/operatör regresyon kilidi
40. `today` Europe/Istanbul takvim günü (`en-CA` → `YYYY-MM-DD`) — TZ kilidi

---

# BÖLÜM 6 — FİZİBİLİTE ONAYI

| | İş kuralı | Durum |
|---|---|---|
| **A** | Tamamen müsait → ana sayfada göster + tarihleri aynen rezervasyona taşı | ✅ **Güvenle uygulanabilir.** CTA kısmı `682a822` ile zaten çalışıyor; yalnız "tamamen müsait" ayrımı eklenir. Migration/RPC gerekmez. |
| **B** | Kısmen dolu → ana sayfada göster + villa detayına gönder | ✅ **Zaten çalışıyor.** Mevcut `discountAvailable === false → detailHref` dalı korunur, hiçbir tasarım/class değişmez. |
| **C** | Tamamen dolu → ana sayfada gösterme | ✅ **Güvenle uygulanabilir.** Gece bazlı toplu tarama, mevcut `get_blocked_villa_ids` RPC'siyle; filtreleme cache içinde; `DiscountCollection`/`VillaCard` değişmez; N+1 yok. |
| **D** | Tamamen geçmiş indirim → `villa_discounts` kaydını fiziksel sil | ✅ **Güvenle uygulanabilir.** `villa-prices-cleanup`'ın birebir kardeşi; FK/cascade riski **yok**; rezervasyon snapshot'ları etkilenmez; `discount_collections` korunur; idempotent; transaction gerekmez. Tek dış bağımlılık: Coolify Scheduled Task'ın sizin tarafınızdan eklenmesi. |

**Açık kalan iki karar:**
1. Uzun pencere guard eşiği (öneri: 31 gece).
2. Cleanup cron saati (öneri: `15 0 * * *`, `villa-prices-cleanup`'ın 15 dk sonrası).

**Doğrulanamayan:** production DB şeması ve Coolify Scheduled Task konfigürasyonu (kural gereği erişilmedi). Tüm iddialar migration dosyaları ve repo kodundan alıntıyla kanıtlanmıştır; indeks/şema hakkında varsayım yapılmamıştır.
