# İndirimli Villa — P3 (DÖNEM BAŞINA AYRI KART) + ADMIN DÖNEM SEÇİMİ
## UYGULAMA ÖNCESİ TEKNİK PLAN / SALT-OKUMA AUDİT

**Tarih:** 2026-09-22 · **HEAD:** `4be3920 feat: handle discount villa availability and cleanup`
**Durum:** Hiçbir kod/migration/DB/dosya değişmedi. Yalnız plan.
**Yöntem:** Repo kodu + migration dosyaları. Production DB'ye **erişilmedi**.

---

# 1. MEVCUT MİMARİNİN ÖZETİ

## 1.1 Veri modeli

```
discount_collections                    villa_discounts
  id            uuid PK                   id             uuid PK   ⚠️ KALICI DEĞİL
  villa_id      uuid FK→villa CASCADE     villa_id       uuid FK→villa CASCADE
  sort_order    int                       start_date     date  ─┐  KAPALI interval
  is_active     bool                      end_date       date  ─┘  (ürün: end = çıkış)
  custom_title  text                      discount_type  text  'percent'|'fixed'
  custom_cover_image text                 discount_value numeric
  created_at    timestamptz               currency       text
                                          created_at     timestamptz
  UNIQUE (villa_id)   ← villa başına TEK satır
  INDEX (is_active, sort_order)           EXCLUDE villa_discounts_no_overlap (gist)
```

* **İki tablo arasında FK YOK.** Tek bağ `villa_id` üzerinden dolaylı.
* Bir villada **sınırsız** indirim dönemi olabilir; tek şart **çakışmama** (EXCLUDE).
* `villa_discounts`'a **referans veren başka tablo yok** (`db/` tarandı).
* `reservations` indirimi **snapshot** tutar (migration 080) → FK yok, geçmiş bozulmaz.

## 1.2 Public zincir ve tek-kart kısıtının tam yeri

```
discount.repository.ts > findActivePublicCards   (.eq is_active, .order sort_order,
                                                  embed villa → villa_discounts TÜMÜ)
  → lib/cache.helpers.ts > getCachedDiscountCollectionVillas
        unstable_cache(["discount-collection:get"], tags:["discount","villa-reviews"], revalidate:600)
        ├─ visibleDiscounts = normalizedDiscounts.filter(end_date >= bugün)     :631
        ├─ selectedDiscount = [...visibleDiscounts].sort(start_date ASC)[0]     :641
        ├─ discountCandidates.set(villaId, { periods, priceForDiscount })       :684
        ├─ result.push({ …, discount: selectedDiscount })       ← VİLLA BAŞINA 1 KAYIT
        └─ POST-PASS (availability):
             windowGroups (start|end) → Kademe 1 overlap → Kademe 2 gece taraması
             overlapKeys / fullyBlockedKeys  anahtar: `villaId|start|end`
             usable = periods.find(!fullyBlocked)                               :905
             usable yoksa → hiddenVillaIds → kart gizlenir
  → DiscountCollection.tsx
        getVillaBadgesByLocale(collection.map(c => c.id), locale)               :57
        <HorizontalCarousel> … {collection.map(c => <li key={c.slug || c.id}>   :224-226
  → VillaCard variant="discount"   discount={c.discount}  discountAvailable={c.discount_available}
```

## 1.3 🔑 Planın dayandığı en önemli tespit

**`HomepageCollectionVilla` zaten "TEK KARTLIK VERİ"dir.**
İçinde tekil bir `discount` objesi, tekil `discount_available`, tekil `price`/`currency` taşır.

➡️ **P3 = aynı tipten villa başına N adet üretmek.** Tip değişmez, `VillaCard` değişmez.
➡️ Tek kısıt, `DiscountCollection.tsx:226`'daki React key'in villa bazlı olması.

---

# 2. P3 MEVCUT SİSTEME NASIL OTURUYOR?

| Katman | P3 için ne oluyor |
|---|---|
| `findActivePublicCards` | **Değişmez** — zaten villanın TÜM `villa_discounts` kayıtlarını embed ediyor (tarih filtresi yok). Yeni sorgu/embed gerekmez |
| `visibleDiscounts` | **Değişmez** (`end_date >= bugün`) |
| **Admin seçimi** | `visibleDiscounts` üzerine **tek bir `.filter()`** |
| `selectedDiscount` (`:641`) | Artık yalnız **geriye dönük uyum** için anlamlı; P3'te `result.push` sırasında geçici değer olarak kalır, post-pass onu **çoğaltarak** değiştirir |
| `discountCandidates` | **Değişmez** — zaten villa başına dönem listesi + fiyat türetici taşıyor |
| Availability post-pass (Kademe 1/2, guard, anahtar şeması) | **Değişmez** — anahtarlar zaten `villaId\|start\|end`, yani **(villa, dönem) çifti başına** karar üretiyor |
| Post-pass çıktısı | `usable = periods.find(...)` **tek dönem** yerine `usableList = periods.filter(!fullyBlocked)` **tüm uygun dönemler** → her biri için bir kayıt |
| `DiscountCollection` | **1 satır**: React key |
| `VillaCard` | **0 satır** |

### Üç davranış (değişmeden korunur)

| Dönem durumu | Kart | CTA |
|---|---|---|
| 0/N gece dolu | **üretilir** | `/rezervasyon/<slug>?start=&end=` (tarihler **aynen**, +1 gün yok) |
| 1..N−1 gece dolu | **üretilir** | `/kiralik-villa/<slug>` (mevcut `detailHref` fallback) |
| N/N gece dolu | **ÜRETİLMEZ** (yalnız o dönem) | — |

Villa A: 10–17 Ekim tamamen dolu + 20–27 Ekim tamamen müsait (ikisi de seçili)
→ 10–17 kartı **yok**, 20–27 kartı **var** + rezervasyon CTA. Villa kaybolmaz. ✅
Seçili tüm dönemler tamamen doluysa → o villadan **hiç kart üretilmez**. ✅

---

# 3. ADMIN SEÇİM MODELİ — ÖNERİLEN VERİ YAPISI

## 3.1 Seçenekler ve karar

| | Model | Migration | Çoklu | `id` kararlılığı | Not |
|---|---|---|---|---|---|
| **C′** | `discount_collections.selected_discount_ranges jsonb NULL` | 1× ADD COLUMN | ✅ | **✅ (tarih çifti)** | **ÖNERİLEN** |
| C | jsonb **id** dizisi | 1× ADD COLUMN | ✅ | ❌ | replace-all seçimi siler |
| B | join tablo `discount_collection_discounts` | CREATE TABLE + 2 FK + UNIQUE + index | ✅ | ❌ (FK id'ye bağlı) | FK'siz tarih çiftiyle kurulursa C′'nin normalize hâli — ekstra tablo, aynı garanti |
| A | `villa_discount_id uuid` | ADD COLUMN | ❌ | ❌ | Çoklu seçimi desteklemez |
| D | UNIQUE(villa_id) DROP + satır/dönem | DROP INDEX + kolon | ✅ | ❌ | **Koruma listeniz `discount_collections_villa_unique`'i koru diyor → ELENDİ** |
| E | Migration'sız (`villa_discounts` sil) | — | — | — | **REDDEDİLDİ** — fiyat motorunun kaynağını siler |

### "Migration gerektirmeyen bir çözüm mümkün mü?" → **HAYIR**

`discount_collections` kolonları: `id, villa_id, sort_order, is_active, custom_title, custom_cover_image, created_at`. **Boşta/çok amaçlı kolon yok**; `custom_title` ve `custom_cover_image` gerçek kullanımda. Seçimi saklayacak hiçbir yer yok.
Tek migration'sız yol `villa_discounts` satırlarını silmektir — **sizin de yasakladığınız** ve fiyat motorunu (`price.engine > getActiveDiscount`, `/rezervasyon`, `price-verify`, admin fiyat takvimi) bozan yoldur.

## 3.2 Önerilen kolon

```sql
-- additive · nullable · backfill YOK · rollback: DROP COLUMN
ALTER TABLE public.discount_collections
  ADD COLUMN IF NOT EXISTS selected_discount_ranges jsonb;
```

**Değer formatı** (okunabilir, genişletilebilir):
```json
[{ "start": "2026-10-10", "end": "2026-10-17" },
 { "start": "2026-11-01", "end": "2026-11-08" }]
```

**Şemada emsal:** `villa.youtube_videos`, `villa.bedroom_layout`, `pages.sections`, `admin_users.sidebar_permissions` jsonb. Native compiler dizi/objeyi `::jsonb` olarak serialize ediyor (`lib/db/query-compiler.ts:196`) → yeni altyapı gerekmez.

## 3.3 Boş seçim davranışı (NULL / `[]` ayrımı)

| Değer | Anlam | Davranış |
|---|---|---|
| **NULL** | Legacy / hiç seçim yapılmamış | **Tüm görünür dönemler** → migration öncesi davranış |
| **`[]`** | Admin tüm kutuları kaldırdı | **Önerilen: NULL ile AYNI (tüm dönemler)** |
| **`[{…}]`** | Açık seçim | Yalnız seçilenler |
| Seçim var ama **hiçbiri eşleşmiyor** (cleanup / replace sonrası) | Orphan | **Tüm dönemlere düş (fail-safe)** |

**Neden `[]` = tüm dönemler?**
1. "Bu villayı hiç gösterme" isteği **zaten** `is_active = false` (Pasif) ile karşılanıyor — ikinci bir yol gerekmiyor.
2. P3'te tüm kutuların yanlışlıkla kaldırılması olası; `[]` = "hiçbiri" olsaydı kart **sessizce** kaybolurdu.
3. Her hata yolu (NULL, `[]`, orphan) aynı güvenli noktaya düşer → **public bölümün boşalması yapısal olarak imkânsız**.

⚠️ `[]` = "hiçbiri" isterseniz teknik olarak mümkün; o zaman admin UI'da **onay/uyarı** şart ve "kart kaybolabilir" riski kabul edilmiş olur. **Kararı size bırakıyorum — önerim `[]` = tüm dönemler.**

---

# 4. MIGRATION GEREKİYOR MU?

**EVET — tam olarak 1 adet.**

| Kriter | Durum |
|---|---|
| Additive | ✅ `ADD COLUMN IF NOT EXISTS` |
| Nullable | ✅ default yok → mevcut satırlar NULL |
| Mevcut kayıtları bozar mı | ❌ Hayır — NULL = bugünkü davranış |
| Backfill | ❌ **Gerekmez** |
| Rollback | ✅ `ALTER TABLE … DROP COLUMN IF EXISTS selected_discount_ranges;` |
| Idempotent | ✅ |
| Index | ❌ Gerekmez (aynı satırda kolon, ek sorgu yok) |
| Constraint | ❌ Gerekmez (şekil doğrulaması uygulama katmanında) |
| Mevcut migration'lara dokunma | ✅ Hiçbiri değişmez |

---

# 5. `replace_villa_discounts` İLE SEÇİMLER NEDEN KAYBOLMAZ?

**Sorun:** `saveDiscountData` → `replace_villa_discounts(p_villa_id, p_discounts jsonb)` **DELETE + INSERT** yapıyor. Admin fiyat ekranında herhangi bir şeyi kaydettiğinde o villanın tüm `villa_discounts` satırları **yeni `id`** alıyor.

**Çözüm:** seçim `id` ile değil **`(start_date, end_date)` çifti** ile saklanıyor.

**Neden bu çift kararlı ve benzersiz:**
* `EXCLUDE villa_discounts_no_overlap` (migration 079) aynı villada **çakışan** aralığı DB seviyesinde yasaklıyor → bir villada aynı `(start,end)` çifti **iki kez var olamaz**.
* Replace-all işlemi tarihleri değil **satır kimliklerini** değiştirir. Admin 10–17 Ekim dönemini silmediyse, replace sonrası yine `start=10-10, end=10-17` olan bir satır vardır → seçim **eşleşmeye devam eder**.
* Admin o dönemi gerçekten silerse eşleşme kaybolur → o dönem için kart üretilmez (**doğru davranış**), diğer seçimler çalışmaya devam eder.

➡️ Bu, C (id dizisi), B (FK) ve A seçeneklerinin **tamamında** var olan sessiz-seçim-kaybı riskini **tamamen** ortadan kaldırır.
➡️ Ek bonus: `cache.helpers` zaten `start|end` anahtar şemasını kullanıyor (`overlapKeys`, `fullyBlockedKeys`) → seçim eşleştirmesi **aynı anahtar diliyle** yapılır.

---

# 6. PUBLIC'TE AYNI VİLLANIN N KART OLARAK ÜRETİMİ

## 6.1 Üretim noktası: `getCachedDiscountCollectionVillas` post-pass

Bugünkü post-pass (özet):
```
for (const c of result) {
  usable = ctx.periods.find(d => !isFullyBlocked(d))     // TEK dönem
  if (!usable) hiddenVillaIds.add(c.id)
  else { c.discount = usable; c.price/currency = priceForDiscount(usable)
         c.discount_available = !overlapKeys.has(key) }
}
return result.filter(...)
```

P3'te olacak (kavramsal):
```
expanded = []
for (const c of result) {                        // result sırası = sort_order ASC (repo .order)
  usableList = ctx.periods                       // periods ZATEN start_date ASC
                  .filter(d => selectionMatches(d))       // ← admin seçimi (§3)
                  .filter(d => !isFullyBlocked(d))        // ← tamamen dolu ELENİR
  for (const d of usableList) {
    expanded.push({ ...c,
      discount: { …d },
      price/currency: ctx.priceForDiscount(d),            // AYNI mevcut kural
      discount_available: (d.start < d.end) ? !overlapKeys.has(`${c.id}|${d.start}|${d.end}`) : undefined
    })
  }
  // usableList boşsa → o villadan HİÇ kart üretilmez (mevcut gizleme davranışı)
}
return expanded
```

**Tip değişmiyor:** her `expanded` elemanı yine bir `HomepageCollectionVilla` — tekil `discount`, tekil `discount_available`.

## 6.2 Kart anahtarı (stable card key)

`DiscountCollection.tsx:226` bugün: `key={c.slug || c.id}` → aynı villadan N kart olunca **duplicate key**.

İki alternatif:
* **(a) Inline birleştirme (en küçük):** `key={`${c.id}|${c.discount?.start_date ?? ""}|${c.discount?.end_date ?? ""}`}` — **1 satır**.
* **(b) `card_key` alanı:** `cache.helpers` her kayda `card_key` yazar, `DiscountCollection` onu kullanır — yine **1 satır** değişiklik ama anahtar üretimi tek yerde toplanır ve test edilebilir olur.

**Öneri: (b).** Anahtar mantığı server tarafında tek noktada kalır, `DiscountCollection` "verilen anahtarı kullanan" aptal bileşen olur, ve ileride P3 dışındaki tüketiciler de aynı anahtarı alır.

## 6.3 `VillaCard`'a dokunmak gerekiyor mu? → **HAYIR**

Kanıt:
* `id` prop'u yalnız iki yerde: `FavoriteButton` (`:688`) ve `VillaCardBookingModal` (`:1581`). Aynı villanın N kartında **aynı villa id** olması **semantik olarak doğru** (favori villanın kendisine ait).
* `FavoriteButton` içinde **hiç DOM `id=` / `aria-controls` / `htmlFor` yok** → id çakışması **yok**.
* Modal state'i her `VillaCard` örneğinde **kendi `useState`**'i — kart başına bağımsız.
* `discount`, `discountAvailable`, `price`, `currency` prop'ları zaten **tekil** → her kart kendi dönemini alır.

➡️ **`VillaCard.tsx` = 0 satır değişiklik.** Tasarım, className, CTA metni, discount variant aynen korunur.

## 6.4 `DiscountCollection`'a dokunmak gerekiyor mu? → **EVET, 1 SATIR**

React key o dosyada yazılı olduğu için kaçınılmaz. Bunun dışında:
* `renderCard` prop listesi **değişmez**,
* `<HorizontalCarousel>`, `<li>` class'ları, `<style>` bloğu, başlık/alt başlık **değişmez**,
* `getVillaBadgesByLocale(collection.map(c => c.id))` — fonksiyon **kendi içinde `Set` ile tekilleştiriyor** (`get-villa-badge-translations.server.ts:29`) → **duplicate villa id güvenli, değişiklik gerekmez**,
* `if (collection.length === 0) return null` — artık "hiç kart yok" anlamına gelir, **doğru davranış**.

---

# 7. SIRALAMA

| Katman | Kaynak | P3'te |
|---|---|---|
| Villalar arası | `discount_collections.sort_order ASC` (repo `.order("sort_order")`) | **Korunur** — `result` zaten bu sırada |
| Villa içi dönemler | `discountCandidates.periods` = `visibleDiscounts` **`start_date` ASC** (`:679`) | **Korunur** |

**Nihai sıra: `(sort_order ASC, start_date ASC)`** — tamamen deterministik.
Villa içi eşit `start_date` **imkânsız** (EXCLUDE no_overlap) → ek tie-break gerekmez.
Sonuç: bir villanın kartları carousel'de **yan yana ve tarih sırasında** görünür; koleksiyon kürasyon sırası bozulmaz.

---

# 8. AVAILABILITY ALGORİTMASININ KORUNMASI

**Dokunulmayacaklar:** `getBlockedVillaIds`, `get_blocked_villa_ids` RPC, Kademe 1 (pencere bazlı overlap), Kademe 2 (gece bazlı tarama + aday daralması + erken çıkış), `MAX_NIGHT_SWEEP_NIGHTS = 31` guard, fail-soft, half-open `[)` semantiği.

**Kapsam aynen korunur:** `reservations` (pending + confirmed), `manual_reservations` (tümü), `external_calendar_events` (`is_active = true`) — hepsi RPC'nin içinde, kod tarafında değişiklik yok.

**Tek entegrasyon noktası:** pencere grupları artık **admin seçiminden geçmiş** dönemlerden kurulur.

```
for (const [villaId, ctx] of discountCandidates)
  for (const d of ctx.periods)
    if (!selectionMatches(villaId, d)) continue     // ← TEK YENİ SATIR
    if (!(d.start_date < d.end_date)) continue      // 0 gecelik → sorgu yok
    windowGroups.add(`${d.start_date}|${d.end_date}`, villaId)
```

➡️ **Seçilmeyen dönem availability sorgusuna GİRMEZ** (test #19/#40).
➡️ Post-pass'in kalan tüm mantığı (`overlapKeys`, `fullyBlockedKeys`, guard) **bit düzeyinde aynı**.

---

# 9. CACHE / ISR ETKİSİ

| Öğe | Durum |
|---|---|
| Cache key `["discount-collection:get"]` | **Değişmez** |
| Tags `["discount","villa-reviews"]` | **Değişmez** |
| `revalidate: 600` | **Değişmez** |
| Ana sayfa `○ / , /tr , /en , /de` statik ISR 10 dk | **Değişmez** |
| Admin mutation → `revalidateDiscount()` | **Zaten var** — seçim kaydı da aynı yolu kullanır, yeni invalidation **gerekmez** |
| Cache'in döndürdüğü dizi | Uzunluğu artar (villa başına N kayıt). Kayıt **şekli** aynı |
| Rezervasyon akışı | **Dokunulmaz** — yeni `revalidateTag` eklenmez; ≤10 dk tazelik davranışı aynen |

---

# 10. N+1 ANALİZİ

**Formül (değişmiyor):**
```
Sorgu = W + Σ (yalnız blocked pencereler için) N_w
W   = SEÇİLİ dönemlerin distinct (start_date, end_date) sayısı
N_w = o pencerenin gece sayısı (≤ 31 guard)
```

### Sizin senaryonuz: 1500 villa · bir villanın 8 dönemi · 100 villa **aynı** 8 dönemi kullanıyor

| Adım | Sonuç |
|---|---|
| Distinct pencere | **8** (100 villa aynı pencereleri paylaşıyor → tek grup) |
| Kademe 1 | **8 sorgu**, her biri `p_villa_ids = [o pencereyi seçen 100 villa]` ile scope'lu |
| Kademe 2 | yalnız blocked villa bulunan pencerelerde; en kötü 8 × ≤31 gece, aday kümesi daraldıkça erken çıkış |
| **100 villa için 100 ayrı sorgu** | ❌ **OLUŞMAZ** |
| **8 dönem için 8×N sorgu** | ❌ **OLUŞMAZ** — 8 pencere toplam |
| Üretilen kart sayısı | Sorgu sayısını **etkilemez** (kart üretimi bellek içi) |

**Sorgu sayısı villa sayısından tamamen bağımsız.** 1500 villa aynı 8 pencereyi kullansa da **8 (+gece taramaları)**.
**Admin seçimi sorgu sayısını artırmaz, azaltır** — seçilmeyen dönemler `W`'ye hiç girmez.

⚠️ **Yeni ölçek riski (sorgu değil, DOM):** 100 villa × 8 seçili dönem = **800 kart** tek carousel'de. Bu bir **UX/DOM** riski (§15-R3). Kart üretimi için opsiyonel bir üst sınır düşünülebilir — **karar sizin, bu planda önerilmiyor**.

---

# 11. REACT KEY ANALİZİ

| Nokta | Bugün | P3'te |
|---|---|---|
| `DiscountCollection.tsx:226` | `key={c.slug || c.id}` | ⚠️ **Duplicate** — aynı villanın N kartı aynı slug'a sahip |
| Çözüm | — | `card_key` = `` `${villa_id}|${start_date}|${end_date}` `` (server'da üretilir) |
| Benzersizlik garantisi | — | `(villa_id, start, end)` bir villada benzersiz (**EXCLUDE no_overlap**) + villalar arası `villa_id` ayırıyor → **global benzersiz** |
| Determinizm | — | Tarihlerden türetilir; render'lar arası **stabil** (index tabanlı key kullanılmaz) |
| `VillaCard.id` (FavoriteButton / modal) | villa id | **Aynen villa id** — aynı villanın kartları aynı favori durumunu paylaşır (**doğru**) |
| DOM `id` / `aria-controls` çakışması | — | **Yok** — `FavoriteButton`'da DOM id attribute'u yok; modal state kart-yerel |

---

# 12. CLEANUP İLE İLİŞKİ

Cron: `GET /api/cron/villa-discounts-cleanup` → `DELETE FROM villa_discounts WHERE end_date < today` (STRICT `<`). `discount_collections`'a **dokunmaz**. **Bu davranış değişmeyecek.**

Seçim tarih aralığıyla tutulduğunda cleanup sonrası akış:

```
1) cron 10–17 Eylül satırını siler (18 Eylül'de)
2) findActivePublicCards embed'i artık o satırı getirmez
3) visibleDiscounts (end_date >= bugün) zaten elerdi — çift emniyet
4) selectionMatches: seçimdeki {start:09-10,end:09-17} hiçbir döneme eşleşmez
     → ORPHAN, sessizce YOK SAYILIR (hata yok, exception yok)
5) Kalan seçili dönemler normal çalışır
6) Hiç eşleşme kalmazsa → fail-safe: TÜM görünür dönemler (§3.3)  → kart kaybolmaz
7) Admin ekranı: loadDiscountData güncel satırları döner; orphan seçim
     checkbox listesinde KARŞILIĞI OLMADIĞI için hiç render edilmez → ÇÖKMEZ
8) Admin bir sonraki kaydetmede diziyi güncel hâliyle yeniden yazar (otomatik budama)
```

**Reservation snapshot** (migration 080) etkilenmez — FK yok, denormalize kolonlar.
**`discount_collections` satırı** hiçbir koşulda silinmez; `sort_order`/`is_active`/`custom_title`/`custom_cover_image` **korunur**.

---

# 13. DOSYA BAZINDA KARAR

## 13.1 DEĞİŞECEK

| # | Dosya | Değişiklik | Büyüklük |
|---|---|---|---|
| 1 | `db/migrations/0XX_discount_collection_selected_ranges.sql` | **YENİ** — `ADD COLUMN IF NOT EXISTS selected_discount_ranges jsonb` | ~25 satır (çoğu yorum) |
| 2 | `lib/db/discount.repository.ts` | `LIST_SELECT`'e ve `findActivePublicCards` select'ine **1 kolon** | +2 satır |
| 3 | `app/services/discount-collection.service.ts` | `DiscountCollectionItem` tipine alan; `updateDiscountCollectionItem` patch'ine alan (mevcut `updateById` yolu) | +~15 satır |
| 4 | `app/(admin)/maki-admin/discount-collection/discount-collection.action.ts` | **YENİ ince action**: `listVillaDiscountPeriodsAction(villaId)` — `requirePermission("discount_collection")` + **mevcut** `villaDiscountRepository.findDiscountsByVillaId`; ayrıca update action patch tipine alan | +~20 satır |
| 5 | `app/(admin)/maki-admin/discount-collection/page.tsx` | `SortableRow` içine genişletilebilir "İndirim dönemleri" checkbox bölümü + kaydet | +~90 satır |
| 6 | `lib/cache.helpers.ts` | (a) seçim filtresi, (b) post-pass'in **tek dönem → N kayıt** üretmesi, (c) `card_key` alanı | ~+60/−25 satır |
| 7 | `app/components/home/DiscountCollection.tsx` | **1 SATIR** — `key={c.card_key ?? (c.slug \|\| c.id)}` | +1/−1 |
| 8 | `types/database.ts` | `DiscountCollectionRow` tipi varsa alan (repoda bu tip **bulunamadı** → muhtemelen gerekmez) | 0–2 satır |
| 9 | `tests/unit/discount-collection-availability.test.ts` | P3 + seçim senaryoları | genişletme |
| 10 | `tests/unit/discount-collection-selection.test.ts` | **YENİ** — seçim eşleştirme, NULL/`[]`/orphan, key benzersizliği | yeni |

### ⚠️ #4 neden gerekli — permission uyumsuzluğu (yeni tespit)

* `discount-collection.action.ts` → `requirePermission("discount_collection")`
* `app/components/admin/villa/discount.action.ts > loadDiscountData` → `requirePermission("villas")`

Yalnız `discount_collection` yetkisi olan bir admin `loadDiscountData`'yı çağırırsa **403 throw** alır. Bu yüzden dönem listesini **kendi ekranının yetki anahtarıyla** okuyan ince bir action gerekir. **Yeni repository/servis YOK** — mevcut `findDiscountsByVillaId` yeniden kullanılır.

## 13.2 DEĞİŞMEYECEK (tek tek doğrulandı)

| Dosya / Varlık | Neden değişmiyor |
|---|---|
| **`app/components/villa/VillaCard.tsx`** | Kart başına veri şekli **aynı** (tekil `discount`); `id` yalnız favori+modal, DOM id çakışması yok → **0 satır** |
| `lib/db/villa-discount.repository.server.ts` | `findDiscountsByVillaId` ve `deletePastDiscounts` **olduğu gibi** kullanılır |
| `app/components/admin/villa/discount.action.ts` | Yalnız referans alınır; değişmez |
| `lib/availability.helper.ts` / `.validator.ts` / `.action.ts` | Availability katmanı **dokunulmaz** |
| `lib/db/reservation.repository.ts`, RPC'ler (`get_blocked_villa_ids`, `get_villa_blocked_ranges`, `check_villa_availability_conflict`) | **Dokunulmaz** |
| `app/api/cron/**` (cleanup cron dahil) | **Dokunulmaz** |
| `lib/price.engine.ts`, `lib/stay-rules.helper.ts`, `lib/date-format.ts` | **Dokunulmaz** |
| `app/services/reservation/**`, `app/api/public/reservations/**`, `app/components/reservation/**` | Rezervasyon sistemi **dokunulmaz** |
| `app/components/search/**`, `app/components/short-gaps/**`, `app/components/villa/booking/**` | **Dokunulmaz** |
| `lib/db/relation-metadata.ts` | Yeni embed/relation **gerekmez** (kolon, ilişki değil) |
| `app/services/revalidate.actions.ts` | **Dokunulmaz** |
| Mevcut migration dosyaları · `discount_collections_villa_unique` · `replace_villa_discounts` · DB constraint'leri | **Dokunulmaz** |
| Cache key / tag / revalidate · `?start=&end=` URL formatı · villa detay & rezervasyon route'ları | **Dokunulmaz** |
| Admin permission/auth sistemi | **Dokunulmaz** (mevcut `requirePermission` kullanılır) |
| Admin villa picker + `usedVillaIds` + DnD + `is_active` + `custom_title` + `custom_cover_image` + `sort_order` | **Dokunulmaz** |

---

# 14. 40 MADDELİK TEST PLANI

## Admin (1–11)
| # | Senaryo | Beklenen | Nasıl |
|---|---|---|---|
| 1 | Villa 1 döneme sahip | Liste 1 satır | action mock |
| 2 | Villa 8 döneme sahip | Liste 8 satır, `start_date` ASC | action mock |
| 3 | 8'den 2'si seçildi | Payload'da 2 aralık | service birim |
| 4 | Seçim kaydediliyor | `updateById` **yalnız** yeni alanla çağrılır | repo spy |
| 5 | Sayfa yenilendi | Liste seçimi `checked` gösterir | round-trip |
| 6 | Seçim korunuyor | DB değeri aynen döner | service birim |
| 7 | Seçilmeyen dönem public'te yok | Kart üretilmez | cache birim |
| 8 | `villa_discounts` silinmiyor | Delete çağrısı **0** | repo spy |
| 9 | `replace_villa_discounts` sonrası (id'ler değişti, tarihler aynı) | Seçim **korunur** | tarih-eşleşme testi |
| 10 | Migration sonrası eski kayıt (NULL) | Bugünkü davranış | cache birim |
| 11 | Hiç seçim yapılmamış (NULL/`[]`) | Tüm görünür dönemler | cache birim |

## Public / P3 (12–22)
| # | Senaryo | Beklenen |
|---|---|---|
| 12 | 2 seçili dönem | **2 kart** |
| 13 | 8 seçili dönem | **8 kart** |
| 14 | 1 dönem tamamen dolu | O dönemin kartı **yok**, diğerleri var |
| 15 | 1 dönem kısmen dolu | Kart var, `discount_available=false` → detay CTA |
| 16 | 1 dönem tamamen müsait | Kart var, `discount_available=true` → `?start=&end=` **aynen** |
| 17 | Aynı villanın 3 dönemi | 3 farklı `card_key` |
| 18 | Duplicate key yok | `new Set(keys).size === keys.length` |
| 19 | Seçilmeyen dönem sorguya girmiyor | `getBlockedVillaIds` çağrı argümanlarında **yok** |
| 20 | Tüm seçili dönemler tamamen dolu | O villadan **hiç kart yok** |
| 21 | Biri dolu, biri müsait | Yalnız müsait olan gösterilir |
| 22 | Biri kısmi, biri müsait | **İkisi de** gösterilir, CTA'ları **farklı** |

## Availability (23–30)
| # | Senaryo | Beklenen |
|---|---|---|
| 23 | `getBlockedVillaIds` korunuyor | Dosya diff'i **0**; çağrı sözleşmesi aynı |
| 24 | External calendar kapsamı | source-lock: `public.external_calendar_events` + `e.is_active = true` |
| 25 | Manual reservations kapsamı | source-lock: `public.manual_reservations`, status filtresi **yok** |
| 26 | Pending/confirmed kapsamı | source-lock: `status in ('pending','confirmed')` |
| 27 | Half-open checkout/checkin | 5–10 ve 17–20 → çakışma **yok** |
| 28 | Gece bazlı tam doluluk | Bitişik 10–13 + 13–17 → **tamamen dolu** |
| 29 | 6/7 dolu | Kart **var** + detay CTA |
| 30 | 7/7 dolu | Kart **yok** |

## Cleanup (31–35)
| # | Senaryo | Beklenen |
|---|---|---|
| 31 | Geçmiş dönem siliniyor | `end_date < today` → silinir |
| 32 | Bugün biten dönem | **Silinmez** (STRICT `<`) |
| 33 | Orphan seçim | Hata **yok**; sessizce yok sayılır; admin ekranı çökmez |
| 34 | Reservation snapshot | **Etkilenmez** (migration 080 kanıt testi) |
| 35 | `discount_collections` | **Silinmez**; kürasyon alanları korunur |

## Performans (36–40)
| # | Senaryo | Beklenen |
|---|---|---|
| 36 | Aynı pencere | **1** availability sorgusu |
| 37 | 100 villa aynı pencere | **1** pencere sorgusu, `villaIds` 100 elemanlı |
| 38 | 8 dönem | **8** distinct pencere (8×N değil) |
| 39 | N+1 yok | 1500 villa → sorgu sayısı **sabit** |
| 40 | Seçilmeyen dönem | Sorguya **dahil edilmiyor** (çağrı argümanı doğrulaması) |

**Ek regresyon:** `discount-collection-visibility.test.ts` ve `villa-discounts-cleanup-cron.test.ts` **assertion'ları değişmeden** geçmeli; `VillaCard.tsx` diff'i **0 satır** olmalı (source-lock).

---

# 15. RİSKLER

| # | Risk | Şiddet | Azaltma |
|---|---|---|---|
| **R1** | **Permission uyumsuzluğu** — `loadDiscountData` `villas` yetkisi istiyor, ekran `discount_collection` | **Yüksek** | §13.1-#4: ekranın kendi yetki anahtarıyla ince action; mevcut repo metodu yeniden kullanılır |
| **R2** | `[]` "hiçbiri" olarak yorumlanırsa kart sessizce kaybolur | **Yüksek** | `[]` = tüm dönemler (§3.3); "gösterme" için `is_active=false` |
| **R3** | **Kart patlaması** — 100 villa × 8 dönem = 800 kart tek carousel'de (DOM/UX) | **Orta-Yüksek** | Sorgu değil DOM riski. Opsiyonel üst sınır (villa başına veya toplam) **kararınıza bırakıldı** |
| **R4** | Aynı villanın kartları yan yana → carousel monotonlaşabilir | Orta | `(sort_order, start_date)` deterministik; alternatif serpiştirme **önerilmiyor** (kürasyon sırasını bozar) |
| **R5** | Post-pass `result` mutasyonundan **yeni dizi üretimine** geçiyor | Orta | Mevcut testler + `price`/`currency`/`discount` alan bütünlüğü regresyon testleri (#14 test 14/15) |
| **R6** | jsonb'de referans bütünlüğü yok (orphan aralıklar) | Düşük | Eşleşme filtresi inert kılıyor; `end_date >= bugün` çift emniyet; admin kaydetmesi otomatik buduyor |
| **R7** | `card_key` alanı tipe eklenince başka tüketiciler | Düşük | Alan **opsiyonel**; `getCachedHomepageCollectionVillas` bu alanı set etmez → homepage-collection kartları etkilenmez |
| **R8** | Admin ekranında dönem listesi yüklemesi | Düşük | Yalnız bölüm açılınca (lazy) → ilk yüklemede N+1 yok |
| **R9** | Migration üretimde elle uygulanıyor (Coolify/Hetzner) | Düşük | Additive + `IF NOT EXISTS` + rollback `DROP COLUMN` |
| **R10** | **Production DB doğrulanamadı** | — | Tüm şema iddiaları migration dosyalarından; varsayım yapılmadı |

---

# 16. EN KÜÇÜK VE EN GÜVENLİ UYGULAMA PLANI

## Faz 0 — Karar (kod yok)
1. `[]` davranışı: **tüm dönemler** (önerilen) mi, "hiçbiri" mi?
2. Kart sayısı üst sınırı istiyor musunuz (R3)?
3. `card_key`: server'da alan (önerilen) mı, `DiscountCollection`'da inline mı?

## Faz 1 — Veri modeli (public/admin davranışı DEĞİŞMEZ)
* Migration: `ADD COLUMN IF NOT EXISTS selected_discount_ranges jsonb`
* `discount.repository.ts`: iki select'e kolon
* `discount-collection.service.ts`: tip + update patch
* **Doğrulama:** tüm testler yeşil, `VillaCard`/`DiscountCollection`/cache davranışı **birebir aynı** (kolon okunur ama **kullanılmaz**).
* ✅ Bu faz tek başına **tamamen risksiz** — davranış değişmiyor.

## Faz 2 — Admin seçim UI'ı (public DEĞİŞMEZ)
* `discount-collection.action.ts`: `listVillaDiscountPeriodsAction` (R1 çözümü) + update patch
* `page.tsx`: `SortableRow` içinde genişletilebilir checkbox bölümü
* **Doğrulama:** seçim kaydedilir/okunur; `villa_discounts` **silinmez**; DnD/toggle/başlık/kapak **etkilenmez**; public çıktı hâlâ **birebir aynı** (seçim henüz okunmuyor).
* ✅ Geri alınabilir: seçim yazılsa bile public etkilenmez.

## Faz 3 — Public seçim filtresi (hâlâ TEK kart)
* `cache.helpers.ts`: `selectionMatches` filtresi `discountCandidates.periods` üretiminde
* Davranış: seçili dönemler içinden **en erken uygun** (bugünkü kural)
* **Doğrulama:** test 7, 10, 11, 19, 40; availability sorgu sayısı **azalır**
* ✅ P3 olmadan da tutarlı bir ara durum — burada durulabilir.

## Faz 4 — P3 çoğaltma
* `cache.helpers.ts`: post-pass **tek dönem → N kayıt** + `card_key`
* `DiscountCollection.tsx`: **1 satır** key
* **Doğrulama:** test 12–22, 17/18 key benzersizliği, `VillaCard.tsx` diff **0**
* ✅ Faz 3'e geri dönüş tek commit ile mümkün.

## Faz 5 — Doğrulama
`tsc --noEmit` · `eslint .` (0 error / 199 warning baseline) · 4 parçada tam test paketi · `next build --webpack` (offline font mock) · route tablosu baseline karşılaştırması · `git diff --stat` ile koruma listesi doğrulaması (VillaCard, availability, cron, price engine, reservation, cache ayarları → **0 değişiklik**).

---

## ÖZET CEVAPLAR

| Soru | Cevap |
|---|---|
| Yapılabilir mi? | **Evet.** |
| Migration gerekiyor mu? | **Evet, 1 adet** — additive, nullable, backfill'siz, rollback'li. Migration'sız çözüm **yok** (tek alternatif `villa_discounts` silmek → yasak ve yıkıcı). |
| `VillaCard`'a dokunmak gerekiyor mu? | **HAYIR — 0 satır.** |
| `DiscountCollection`'a dokunmak gerekiyor mu? | **EVET — tam 1 satır** (React key). Başka yolu yok; key o dosyada yazılı. |
| Mevcut `discount` tekil yapı korunuyor mu? | **Evet** — P3, aynı tipten N kayıt üreterek yapılıyor; tip değişmiyor. |
| Seçimler `replace_villa_discounts`'tan etkilenir mi? | **Hayır** — `(start_date, end_date)` çifti EXCLUDE constraint sayesinde kararlı ve benzersiz. |
| Availability bozuluyor mu? | **Hayır** — tek yeni satır pencere kurulumunda; Kademe 1/2, guard, kapsam, half-open **aynen**. |
| N+1 var mı? | **Yok** — 100 villa × 8 ortak dönem = **8 pencere sorgusu**. Sorgu villa sayısından bağımsız. |
| `discount_collections_villa_unique` korunuyor mu? | **Evet** — villa başına tek satır; N kart **tek satırdan** üretiliyor. |
| Cleanup bozuluyor mu? | **Hayır** — cron aynen; orphan seçim sessizce yok sayılır; kürasyon korunur. |

**Onayınızı bekliyorum.** Özellikle Faz 0'daki üç karar netleşmeden koda başlamayacağım.
