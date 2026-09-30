# İndirimli Kart "Hemen Rezervasyon Yap" — MÜSAİTLİK KONTROLÜ SALT-OKUMA AUDIT

**Tarih:** 2026-09-22 · **HEAD:** `50358b5 fix: preserve discount reservation checkout date`
**Durum:** KOD DEĞİŞTİRİLMEDİ. Onay bekleniyor.
**Yöntem:** Yalnız repo kodu + migration dosyaları. DB/production/Supabase/Coolify'a **erişilmedi**.

---

## 1) Villa müsaitliği nerede hesaplanıyor?

Projede **TEK** müsaitlik semantiği var, iki farklı erişim şekliyle:

| Katman | Fonksiyon | RPC | Kapsam |
|---|---|---|---|
| **TOPLU (bulk)** | `lib/availability.helper.ts > getBlockedVillaIds(start, end, villaIds?)` | `get_blocked_villa_ids(p_start, p_end, p_villa_ids)` | Bir tarih aralığı için **BLOCKED villa_id Set'i** |
| **TEKİL (per-villa takvim)** | `lib/villa-availability.helper.ts > fetchVillaAvailability(villaId)` | `get_villa_blocked_ranges(p_villa_id)` | Tek villanın tüm dolu aralıkları (takvim boyama) |

Her ikisi de **SECURITY DEFINER** RPC (migration 039), PII döndürmez.

### Blocking kuralları (migration 039, `get_blocked_villa_ids` gövdesi)

```sql
reservations            status IN ('pending','confirmed')
manual_reservations     TÜM satırlar (status filtresi yok)
external_calendar_events is_active = true          -- Airbnb/Booking/VRBO
-- half-open [) overlap:
   start_date < p_end  AND  end_date > p_start
-- p_villa_ids verilirse: villa_id = ANY(p_villa_ids)   → scope, predicate aynı
```

> ⚠️ `get_villa_blocked_ranges` (tekil) **external_calendar_events'i İÇERMEZ**;
> `get_blocked_villa_ids` (toplu) içerir. Yani toplu RPC **daha katı/güvenli** olandır.

---

## 2) Rezervasyonların çakışma kontrolü nerede?

Üç katman, üçü de aynı half-open `[)` semantiğinde:

1. **Fast-path (UX)** — `app/services/reservation/_helpers/conflict.ts` (`createReservation` içinden).
2. **Orphan-gap kuralı** — `app/services/reservation/_helpers/stay-verify.ts` (`get_villa_blocked_ranges` + min-stay).
3. **ATOMİK GARANTİ** — DB `EXCLUDE` constraint `reservations_no_overlap` (migration 001).

➡️ **Gerçek overbooking koruması 3. katmandır.** Bu auditte önerilen kontrol yalnız
**UX/ön-filtre**dir; 1–3'e dokunulmayacak.

---

## 3) `start/end` için kullanılması DOĞRU olan fonksiyon

### ✅ `getBlockedVillaIds(start, end, villaIds)` — `lib/availability.helper.ts:117`

Gerekçeler:

* **Semantik birebir uyuyor.** RPC `start_date < p_end AND end_date > p_start` kullanıyor; bu tam olarak
  *check-in = `start`, check-out = `end`* olan bir rezervasyonun çakışma testidir. Bizim ürettiğimiz URL de
  `?start=discount.start_date&end=discount.end_date`. **Dönüştürme/±1 gün YOK.**
* **Toplu çalışır** — `p_villa_ids` ile scope'lanır (N+1 yok).
* **Zaten public + admin tarafından kullanılıyor** (aşağıda §5) → yeni sistem kurulmuyor.
* **Fail-soft**: RPC hata verirse boş Set döner (permissive) — mevcut davranış korunur.

### ❌ Kullanılmaması gerekenler
* `fetchVillaAvailability` / `get_villa_blocked_ranges` → **per-villa**, external'i içermiyor, N+1 üretir.
* `/api/public/villas/[id]/availability` → client modal için, villa başına bir HTTP isteği.
* Yeni bir RPC / migration → **gereksiz**, mevcut RPC yeterli.

---

## 4) Diğer akışlar müsaitliği nasıl kontrol ediyor?

| Akış | Yöntem | Not |
|---|---|---|
| **/arama** (`AramaPageBody.tsx:885`) | `getBlockedVillaIds(start, end, candidateIds)` → **server-side**, blocked olanlar listeden **çıkarılır** | Esnek arama (`:927`) aynı helper'ı `Promise.all` ile **N farklı pencere** için çağırır — çoklu-pencere deseni zaten mevcut |
| **Kısa süreli tarihler** (`ShortGapsPageBody`) | **Canlı kontrol YOK** — `villa_short_gaps` precompute tablosu (migration 053/055, cron `refresh_villa_short_gaps`) | Boşluklar tanımı gereği müsait; `gap_nights = gap_end - gap_start` |
| **Villa detay** (`useBookingEngine` / `BookingSidebar`) | **Client-side** `GET /api/public/villas/[id]/blocked-ranges` → `get_villa_blocked_ranges` | Takvimde dolu günleri boyar/seçtirmez |
| **Rezervasyon oluşturma** | `conflict.ts` + `stay-verify.ts` + DB EXCLUDE | HTTP 409 → `dict.reservation.form.errorDatesUnavailable` = **"Bu tarihler dolu"** |

---

## 5) Admin takvimi ile public aynı kaynağı mı kullanıyor?

**EVET — aynı iki RPC, aynı tablolar, aynı half-open semantik.**

| Ekran | Çağrı |
|---|---|
| Public `/arama` | `getBlockedVillaIds` → `get_blocked_villa_ids` |
| **Admin `/maki-admin/villa-listesi`** | `getBlockedVillaIdsAction` (`lib/availability.action.ts`) → **aynı** `getBlockedVillaIds` |
| Public villa detay takvimi | `get_villa_blocked_ranges` |
| Admin rezervasyon ekle/düzenle takvimi | `get_villa_blocked_ranges` |

Tek fark: `external_calendar_events` yalnız **toplu** RPC'de. (Kod yorumlarında bilinçli/belgelenmiş.)

---

## 6) `villa_discounts` tarihleri ile availability nasıl birleştirilir? (EN GÜVENLİ YOL)

İndirim penceresi **kart başına farklıdır** — tek bir global aralık yok. En güvenli ve en ucuz birleşim:

1. `getCachedDiscountCollectionVillas()` sonucundaki kartları **(start_date, end_date) çiftine göre grupla**.
2. Her **DISTINCT pencere** için **bir** `getBlockedVillaIds(start, end, [o gruptaki villa id'leri])` çağrısı.
3. Hepsini `Promise.all` ile paralel çalıştır — bu, `/arama`'nın `:926-928` satırındaki **mevcut, kanıtlanmış desen**.
4. Sonuç Set'ine göre karta `discountAvailable: boolean` bilgisi yaz.

⚠️ **Envelope (min(start)…max(end)) ile tek sorgu YAPILMAMALI** — Kasım'da dolu olan bir villa,
Ekim indirimi için yanlışlıkla "dolu" işaretlenir. Bilinçli olarak reddedildi.

⚠️ `getBlockedVillaIds` `start < end` şartını arıyor (`:125`). `start_date == end_date` olan bir indirim
zaten **0 gecelik** rezervasyon demektir → bu durumda CTA'nın tarih taşımaması (mevcut fallback) doğru davranış.

---

## 7) Server-side mi, client-side mi?

**SERVER-SIDE. Tartışmasız.**

* Kartlar zaten **RSC** (`DiscountCollection.tsx` `async function`).
* `getBlockedVillaIds` `server-only` (`reservation.repository.ts:1`) — client'tan çağrılamaz.
* Client-side yapılsaydı: her kart için bir HTTP isteği (**N+1 network**), CTA'da flash/gecikme,
  ve `/arama`'nın server-side deseninden sapma.
* `VillaCard` bir client component; ona **hazır bir boolean prop** geçilir — yeni fetch **eklenmez**.

---

## 8) Cache ve sayfa performansı etkisi

| Katman | Mevcut durum | Etki |
|---|---|---|
| `getCachedDiscountCollectionVillas` | `unstable_cache`, `tags: ["discount","villa-reviews"]`, `revalidate: 600` | Kontrol buraya konursa **istek başına sıfır** ek sorgu; 10 dk'da bir yenilenir |
| Ana sayfa route'ları | Build çıktısı: `○ / , /tr , /en , /de` → **statik prerender, revalidate 10m** | Sayfa zaten 10 dk boyunca statik HTML. **Yani tazelik sınırı cache seçiminden değil, sayfanın kendisinden geliyor.** |

**Sonuç:** kontrol cache'in **içine** konsun. Cache dışına konması tazeliği **artırmaz** (sayfa yine 10 dk statik),
ama cache'lenmemiş bir DB çağrısını her regenerasyona sokar.

**Kabul edilen sınır:** 10 dakikaya kadar bayat müsaitlik. Bu, **/arama hariç** sitedeki tüm statik
sayfalarla aynı sınırdır ve overbooking riski yaratmaz (gerçek koruma DB EXCLUDE constraint).
İstenirse `revalidateTag("discount")` rezervasyon oluşturma akışına eklenebilir — **ama bu rezervasyon
akışına dokunmak demektir; bu auditte ÖNERİLMİYOR, ayrı karar olarak bırakılıyor.**

---

## 9) N+1 riski — 1500 villa meselesi

### 🔑 Kritik tespit: bu bölüm 1500 villa render ETMİYOR.

`DiscountCollection`, `villa` tablosunu değil **`discount_collections`** küratörlü tablosunu okur
(`lib/db/discount.repository.ts:61-104`): `.eq("is_active", true).order("sort_order")`.
Yani kart sayısı = **admin'in İndirimli Koleksiyon'a eklediği satır sayısı**, villa sayısı değil.
(Kartlar ayrıca `end_date >= bugün` filtresinden geçer — `cache.helpers.ts:613-622`.)

### Sorgu sayısı

```
Sorgu sayısı = DISTINCT (start_date, end_date) pencere sayısı      ≤ kart sayısı
```

* Tüm kartlar aynı kampanya penceresini paylaşıyorsa → **1 sorgu**.
* Her kartın penceresi farklıysa → kart sayısı kadar sorgu, **paralel** (`Promise.all`), her biri
  `p_villa_ids` ile o gruba **scope'lanmış** (RPC tüm tabloyu taramaz).
* Ve bunlar **10 dakikada bir** çalışır, ziyaretçi başına değil.

### ❌ Kesinlikle yapılmayacak
```
for each villa: checkAvailability(villa)      // 1500 sorgu — YAPILMIYOR
```
Zaten mimari buna izin vermiyor: kartlar küratörlü, kontrol pencere bazında gruplanıyor.

---

## 10) Mevcut mimaride toplu kontrol mekanizması var mı?

**VAR ve hazır:**

* `lib/availability.helper.ts > getBlockedVillaIds(start, end, villaIds?)`
* `lib/db/reservation.repository.ts:283 > getBlockedVillaIdsRpc`
* `db/migrations/_archive/legacy/039_availability_rpc.sql > get_blocked_villa_ids`
* Çoklu pencere için `Promise.all` deseni: `AramaPageBody.tsx:926-928`

➡️ **Yeni repository, yeni servis, yeni RPC, yeni migration, yeni availability sistemi GEREKMİYOR.**

---

## "DOLU" durumunda davranış — mevcut projede ne var?

| Yer | Davranış |
|---|---|
| `/arama` | Dolu villa **listeden çıkarılır**; `?flexible=N` ile "±3 gün içinde müsait" rozeti |
| Villa detay takvimi | Dolu günler **seçilemez** (disabled) |
| Rezervasyon formu | Sunucu 409 → **"Bu tarihler dolu"** (`tr.ts:724`) |
| Kart üzerinde "Dolu" rozeti | **YOK** — projede böyle bir desen hiç yok |

### ✅ ÖNERİLEN: CTA mevcut fallback'ine düşsün (yeni UI YOK)

Kod **zaten** bunu destekliyor — `VillaCard.tsx:1201`:

```tsx
router.push(discountReserveHref ?? detailHref);
```

Dolu ise `discountReserveHref` **null** olur → CTA villa detay sayfasına gider, kullanıcı takvimde
kendi müsait tarihini seçer. Sıfır yeni dictionary anahtarı, sıfır tasarım değişikliği, sıfır yeni dal.

**Alternatifler (önerilmiyor, kararınıza bırakıldı):**
* **B — Kartı tamamen gizle:** `/arama` deseni ama küratörlü bir pazarlama kartını yok eder; admin "neden görünmüyor" der.
* **C — CTA'yı disabled + "Dolu" metni:** 3 dilde yeni sözlük anahtarı + buton tasarım varyantı gerektirir → "tasarımı değiştirme" kuralına aykırı.

---

## ÖNERİLEN MİNİMUM DEĞİŞİKLİK

**3 dosya, tek yeni boolean alan. Yeni sorgu tipi, yeni RPC, yeni component YOK.**

### 1. `lib/cache.helpers.ts` (server, cache içi)
* `HomepageCollectionVilla` tipine opsiyonel `discount_available?: boolean` ekle.
* `getCachedDiscountCollectionVillas` sonunda, `result` hazırken:
  * kartları `(start_date, end_date)` çiftine göre grupla,
  * `Promise.all(groups.map(g => getBlockedVillaIds(g.start, g.end, g.ids)))`,
  * `start >= end` veya geçersiz tarihli gruplar için sorgu **atma** → `discount_available = false`,
  * her karta `discount_available` yaz.
* `import { getBlockedVillaIds } from "@/lib/availability.helper";` (her ikisi de `server-only`, cycle yok).
* ⚠️ `unstable_cache` anahtarı/tag'leri/revalidate **değişmez**.

### 2. `app/components/home/DiscountCollection.tsx`
* `<VillaCard ... discountAvailable={c.discount_available} />` — tek prop geçişi.

### 3. `app/components/villa/VillaCard.tsx`
* `discountAvailable?: boolean` prop'u (default `undefined` → **mevcut davranış**, geriye dönük uyumlu).
* `discountReserveHref` IIFE'sinin başına **tek satır**: `if (discountAvailable === false) return null;`
* Başka hiçbir satır değişmez.

### 4. `tests/unit/discount-card-reserve-href.test.tsx` (mevcut dosya)
* "dolu → detailHref'e düşer", "müsait → rezervasyon URL'i", "prop verilmezse eski davranış" testleri.
* Yeni bir test dosyası: gruplama/sorgu sayısı kilidi (`getBlockedVillaIds` mock'lanıp **çağrı sayısı**
  ve **argümanları** doğrulanır → N+1 regresyon kilidi).

---

## DEĞİŞMEYECEK olanlar (koruma listesi)

| Alan | Durum |
|---|---|
| `getBlockedVillaIds` / `get_blocked_villa_ids` RPC | **Dokunulmaz** (sadece çağrılır) |
| `get_villa_blocked_ranges`, `fetchVillaAvailability` | Dokunulmaz |
| `createReservation`, `conflict.ts`, `stay-verify.ts`, EXCLUDE constraint | Dokunulmaz |
| `/arama` availability filtresi ve esnek pencere mantığı | Dokunulmaz |
| `ShortGapsPageBody`, `villa_short_gaps`, cron | Dokunulmaz |
| Villa detay / `useBookingEngine` / `BookingSidebar` takvimi | Dokunulmaz |
| Admin takvimleri, admin villa-listesi | Dokunulmaz |
| `price.engine`, fiyat/indirim hesabı | Dokunulmaz |
| DB şeması, migration, R2 | Dokunulmaz |
| CTA tasarımı, `className`, buton metni, `type`, `router.push` deseni | Dokunulmaz |
| `detailHref`, `reserveInfo`/`reserveBlock` (kısa-süreli tarihler) | Dokunulmaz |
| Default / curation variant kartlar | Dokunulmaz |
| Tarih semantiği (`+1 gün` YOK) | Dokunulmaz |
| `unstable_cache` tag/revalidate ayarları | Dokunulmaz |

---

## Bilinen sınırlar (şeffaflık)

1. **≤10 dk bayatlık.** Ana sayfa statik ISR olduğu için kaçınılmaz; overbooking riski yok (DB EXCLUDE).
2. **Ön-filtre, garanti değil.** Kullanıcı rezervasyon sayfasında da 409 alabilir — mevcut davranış korunur.
3. **Kısmen dolu pencere.** RPC "aralıkta herhangi bir çakışma var mı" der; kısmen boş bir indirim penceresi
   **dolu** sayılır (CTA detay sayfasına düşer, kullanıcı orada uygun aralığı seçer). Daha ince bir
   davranış istenirse ayrı iş olarak konuşulmalı — bu auditte **önerilmiyor**.
4. **Production DB doğrulanamadı.** İndex durumu hakkında varsayım yapılmadı; RPC'nin mevcut `/arama`
   ve admin villa-listesi yüklerinde zaten kullanıldığı kod üzerinden kanıtlıdır.
