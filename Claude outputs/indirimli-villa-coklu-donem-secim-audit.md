# İndirimli Villa — ÇOKLU İNDİRİM DÖNEMİ SEÇİMİ
## SALT-OKUMA MİMARİ AUDİTİ

**Tarih:** 2026-09-22 · **HEAD:** `4be3920 feat: handle discount villa availability and cleanup`
**Durum:** Hiçbir kod/migration/DB değişmedi. Yalnız analiz.
**Yöntem:** Repo kodu + migration dosyaları. Production DB'ye **erişilmedi**.

---

# 1. MEVCUT VERİ MODELİ

## 1.1 `discount_collections` (migration `_archive/legacy/062_discount_collections.sql:35-49`)

```sql
CREATE TABLE discount_collections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id           UUID NOT NULL REFERENCES villa(id) ON DELETE CASCADE,
  sort_order         INT  NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  custom_title       TEXT,
  custom_cover_image TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX discount_collections_villa_unique ON discount_collections (villa_id);
CREATE INDEX        discount_collections_active_sort  ON discount_collections (is_active, sort_order);
```

### 🔴 EN KRİTİK KISIT
**`discount_collections_villa_unique`** → **bir villa koleksiyonda EN FAZLA BİR SATIR.**
"Her indirim dönemi için ayrı satır" fikri bu index kaldırılmadan **imkânsızdır** (migration gerektirir).
Admin UI de buna göre yazılmış: `usedVillaIds` ile zaten koleksiyonda olan villa picker'dan gizleniyor (`page.tsx:120-135`).

## 1.2 `villa_discounts` (migration `079_villa_discounts.sql:134-163`)

```sql
CREATE TABLE villa_discounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id       uuid NOT NULL REFERENCES villa(id) ON DELETE CASCADE,
  start_date     date NOT NULL,     -- kapalı interval
  end_date       date NOT NULL,     -- (ürün kuralı: çıkış tarihi)
  discount_type  text NOT NULL,     -- 'percent' | 'fixed'
  discount_value numeric NOT NULL,
  currency       text,              -- 'fixed' → zorunlu, 'percent' → NULL
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date), CHECK (discount_type IN ('percent','fixed')),
  CHECK (discount_value > 0), CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (currency tutarlılığı),
  EXCLUDE villa_discounts_no_overlap (gist)   -- aynı villada ÇAKIŞAN dönem YASAK
);
```

## 1.3 İlişki durumu — kesin cevap

| Soru | Cevap |
|---|---|
| İki tablo arasında FK var mı? | **HAYIR.** Tek bağ `villa_id` üzerinden **dolaylı**. |
| `discount_collections` bir `villa_discounts` kaydını işaret ediyor mu? | **HAYIR.** Böyle bir kolon yok. |
| Bir villada kaç `villa_discounts` kaydı olabilir? | **Sınırsız** — tek şart: aralıklar çakışmayacak (EXCLUDE). Yani 10–17 Ekim, 20–27 Ekim, 1–8 Kasım… hepsi bir arada olabilir. |
| Bir villa koleksiyonda kaç satır olabilir? | **Tam olarak 1** (UNIQUE index). |
| `villa_discounts`'a referans veren başka tablo? | **YOK** (önceki auditte `db/` tarandı: sıfır eşleşme). |
| İndirim yazma yolu | `replace_villa_discounts(p_villa_id, p_discounts jsonb)` — **DELETE + INSERT replace-all** (`discount.action.ts > saveDiscountData`). ⚠️ **Bu, kayıt `id`'lerinin her kaydetmede DEĞİŞTİĞİ anlamına gelir.** |
| Geçmiş indirim temizliği | `/api/cron/villa-discounts-cleanup` → `DELETE FROM villa_discounts WHERE end_date < today` (STRICT `<`). |

### ⚠️ Sessiz ama belirleyici bulgu: `id` kalıcı DEĞİL

`replace_villa_discounts` atomic replace-all yapıyor. Admin bir villanın indirim ekranında **tek bir satırı** değiştirip kaydederse, o villanın **TÜM** `villa_discounts` satırları silinip yeniden INSERT edilir → **yeni `id`'ler**.
Dolayısıyla seçimi **`villa_discounts.id` ile saklayan her çözüm** (A, B, C), admin fiyat ekranında kaydet'e bastığında seçimi **kaybedebilir**.
Bu, aşağıdaki mimari kararın **en önemli girdisidir** ve bir "dönem kimliği" alternatifi gerektirir (bkz. §4.5).

## 1.4 "Admin belirli bir `villa_discounts` kaydını nasıl seçebilir?" — şemanın verdiği imkânlar

Mevcut şemada **hiçbir** yol yok; seçimi saklamak için **mutlaka** şunlardan biri gerekir:
1. `discount_collections`'a yeni bir kolon (tekil id, id dizisi, ya da tarih-aralığı dizisi),
2. yeni bir ilişki tablosu,
3. UNIQUE(villa_id) index'inin kaldırılıp satır başına dönem modeline geçilmesi.

Üçü de **migration** demektir. Migration'sız tek "çözüm" admin'in `villa_discounts` kayıtlarını **silmesi**dir — bu fiyat motorunu da etkiler, yani küratörlük ile fiyatlandırmayı birbirine karıştırır → **reddedilmelidir** (bkz. §4.6).

---

# 2. ADMIN AKIŞI

```
app/(admin)/maki-admin/discount-collection/page.tsx   (client, 468 satır, dnd-kit)
  ├─ load(): listDiscountCollectionAction()  +  adminFetch("/api/admin/villas?activeOnly=1&hasDiscount=1")
  ├─ handleAdd(villa_id)      → addToDiscountCollectionAction
  ├─ handleRemove(item)       → removeFromDiscountCollectionAction   (HARD DELETE satır)
  ├─ handleToggle(item)       → toggleDiscountCollectionActiveAction (is_active)
  ├─ handleSaveTitle(item)    → updateDiscountCollectionItemAction   (custom_title / custom_cover_image)
  └─ handleDragEnd()          → reorderDiscountCollectionAction      (sort_order = index)
        ↓ hepsi
  discount-collection.action.ts ("use server")
        ↓
  app/services/discount-collection.service.ts
        ↓
  lib/db/discount.repository.ts  (LIST_SELECT / findActivePublicCards / insert / updateById / deleteById)
        ↓
  dbNative → discount_collections
  ve her mutation sonrası → revalidateDiscount() → revalidateTag("discount")
```

**Admin liste embed'i** (`discount.repository.ts:27-35`): `villa_discounts ( end_date )` — **yalnızca `end_date`**.
`listDiscountCollection` (service:62-92) bu alanla tarih filtresi yapıyor: en az bir `end_date >= bugün` yoksa item listeden **çıkarılır** (satır SİLİNMEZ).

**Villa seçim havuzu:** `/api/admin/villas?activeOnly=1&hasDiscount=1` → yalnız `villa_discounts` kaydı olan villalar. Zaten koleksiyonda olanlar `usedVillaIds` ile elenir (UNIQUE index'in UI yansıması).

## 2.1 "Villa ekliyor" → "villa + seçilmiş dönem" mümkün mü?

**Evet, mümkün — ve şaşırtıcı derecede az ek altyapı gerekiyor:**

* Bir villanın dönem listesini okumak için **zaten hazır bir server action var**:
  `app/components/admin/villa/discount.action.ts:93 > loadDiscountData(villaId)` →
  `requirePermission("villas")` + `findDiscountsByVillaId` + `start_date` ASC sıralı `VillaDiscountRow[]`.
  ➡️ **Yeni endpoint / yeni repository / yeni servis GEREKMİYOR.**
* Eksik olan tek şey: seçimin **nereye yazılacağı** (§4).
* `handleAdd` bugün tek argüman alıyor (`villa_id`); seçim eklenince ya ikinci argüman alır ya da ekleme sonrası ayrı bir "dönem seç" adımı gelir (§6).

---

# 3. PUBLIC VERİ AKIŞI ve TEK DÖNEM KISITININ KAYNAĞI

```
discount_collections
  → discount.repository.ts > findActivePublicCards
      .eq("is_active", true).order("sort_order")
      embed: villa:villa_id ( …, villa_discounts ( start_date, end_date,
                                discount_type, discount_value, currency ) )
      ⚠️ TARİH FİLTRESİ YOK — villanın TÜM indirim kayıtları gelir.
  → lib/cache.helpers.ts > getCachedDiscountCollectionVillas
      unstable_cache(["discount-collection:get"], tags:["discount","villa-reviews"], revalidate:600)
  → app/components/home/DiscountCollection.tsx   (RSC)
  → app/components/villa/VillaCard.tsx           variant="discount"
```

## 3.1 Tek dönem kısıtının TAM YERİ

Üç ardışık nokta, hepsi `lib/cache.helpers.ts` içinde:

| Satır | Kod | Etki |
|---|---|---|
| ~631 | `normalizedDiscounts.filter(end >= today)` → **`visibleDiscounts`** | Geçmiş dönemler elenir |
| ~641 | `[...visibleDiscounts].sort(start_date ASC)[0]` → **`selectedDiscount`** | **TEK dönem seçilir** |
| ~905 | `ctx.periods.find(d => !isFullyBlocked(d))` → **`usable`** | Tamamen dolu dönemler atlanır, kalan **EN ERKEN** dönem seçilir |
| ~915-929 | `c.discount = { …usable }` | Karta **TEK** `discount` objesi yazılır |

Ve tip tarafında:
* `HomepageCollectionVilla.discount?: { start_date, end_date, discount_type, discount_value, currency } | null` — **tekil obje**.
* `VillaCard` prop'u da **tekil**: `discount?: {...} | null`.

➡️ **Tek dönem gösterimi ne DB'den ne admin'den geliyor — tamamen `cache.helpers` seçim mantığından ve tekil `discount` prop tipinden kaynaklanıyor.**
➡️ Bu aynı zamanda **iyi haber**: admin seçimi eklemek, bu zincire **tek bir `.filter()`** koymak demektir (§11).

## 3.2 Korunacak mevcut availability davranışı (DOKUNULMAYACAK)

| Durum | Kart | CTA |
|---|---|---|
| 0/N gece dolu | göster | `/rezervasyon/<slug>?start=&end=` (tarihler **aynen**, +1 gün yok) |
| 1..N−1 gece dolu | göster | `/kiralik-villa/<slug>` (mevcut `detailHref` fallback) |
| N/N gece dolu | **o dönem elenir**; başka uygun dönem yoksa **kart yok** | — |

Mekanizma: Kademe 1 (pencere başına 1 `getBlockedVillaIds`) → Kademe 2 (yalnız blocked alt küme için gece bazlı tarama, aday kümesi daralır, erken çıkış) → `overlapKeys` / `fullyBlockedKeys` (anahtar: `villaId|start|end`) → guard `MAX_NIGHT_SWEEP_NIGHTS = 31`.

---

# 4. SEÇİLEN DÖNEM NASIL SAKLANMALI? — 5 ALTERNATİF

> Ortak varsayım: **"seçim yok" = mevcut davranış (tüm görünür dönemler aday)**. Bu, geriye dönük uyumluluğun anahtarıdır (§7).

## Seçenek A — `discount_collections.villa_discount_id uuid NULL REFERENCES villa_discounts(id) ON DELETE SET NULL`

| Kriter | Değerlendirme |
|---|---|
| DB değişikliği / migration | **Evet** — ADD COLUMN (additive, nullable) + FK |
| Mevcut kayıtlar | NULL → mevcut davranış. **Backfill gerekmez** |
| Mevcut admin kayıtları bozulur mu? | Hayır |
| Public sorgu değişimi | `findActivePublicCards` select'ine 1 kolon |
| **Çoklu seçim** | ❌ **DESTEKLEMEZ** — tek dönem |
| sort_order / custom_title / custom_cover_image | Aynı satırda kalır, **korunur** |
| Aynı dönem iki kez seçilebilir mi? | Konu dışı (tekil) |
| Villa silinirse | `discount_collections` zaten CASCADE ile gider |
| İndirim silinirse | `ON DELETE SET NULL` → seçim temizlenir, **kürasyon korunur** ✅ |
| Cleanup cron | Uyumlu — geçmiş dönem silinince seçim otomatik NULL'a düşer |
| Availability | Aday havuzu 1 döneme iner; mekanizma aynı |
| Cache | Değişmez |
| N+1 | Yok (aynı satırda kolon) |
| Testler | Düşük etki |
| **Sonuç** | Basit ve güvenli **ama istenen "2 dönem seç" senaryosunu karşılamıyor.** |

## Seçenek B — Ayrı ilişki tablosu `discount_collection_discounts`

```sql
CREATE TABLE discount_collection_discounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_collection_id uuid NOT NULL REFERENCES discount_collections(id) ON DELETE CASCADE,
  villa_discount_id      uuid NOT NULL REFERENCES villa_discounts(id)      ON DELETE CASCADE,
  UNIQUE (discount_collection_id, villa_discount_id)
);
CREATE INDEX ON discount_collection_discounts (discount_collection_id);
```

| Kriter | Değerlendirme |
|---|---|
| DB değişikliği / migration | **Evet** — CREATE TABLE + 2 FK + UNIQUE + index |
| Mevcut kayıtlar | Satır yok → "seçim yok" → mevcut davranış. **Backfill gerekmez** |
| Public sorgu değişimi | `findActivePublicCards`'a **yeni embed** + `relation-metadata.ts`'e yeni relation kaydı (`discount_collections → discount_collection_discounts`) |
| **Çoklu seçim** | ✅ Tam destek |
| sort_order / custom_title / cover | Ana satırda kalır, **korunur** |
| Aynı dönem iki kez | **UNIQUE** ile DB seviyesinde engellenir ✅ |
| Villa silinirse | villa → collection CASCADE → link CASCADE. Temiz |
| İndirim silinirse | `villa_discount_id` CASCADE → **yalnız link satırı gider**, `discount_collections` satırı ve kürasyon **korunur** ✅✅ |
| Cleanup cron | **Mükemmel uyum** — cron `villa_discounts` sildikçe linkler kendiliğinden temizlenir; kod değişikliği gerekmez |
| Availability | Aday havuzu link'lerle kesişir; mekanizma aynı |
| Cache | Değişmez (embed aynı cache'in içinde) |
| N+1 | Yok — embed `json_agg` korelasyonlu subquery (mevcut `villa_discounts` embed'iyle aynı sınıf), **satır başına ek sorgu YOK** |
| Testler | Orta — repo/service/admin/cache testleri |
| Ek yük | `relation-metadata` kaydı + yeni repository metodları (link ekle/sil/replace) + admin write akışı |
| **Sonuç** | **En temiz ilişkisel model**; en yüksek kod yüzeyi. |

## Seçenek C — `discount_collections.selected_discount_ids jsonb NULL`

```sql
ALTER TABLE discount_collections
  ADD COLUMN IF NOT EXISTS selected_discount_ids jsonb;   -- NULL = seçim yok = tüm dönemler
```

| Kriter | Değerlendirme |
|---|---|
| DB değişikliği / migration | **Evet** — tek ADD COLUMN (additive, nullable) |
| Şemada emsal var mı? | **Evet, yerleşik desen**: `villa.youtube_videos`, `villa.bedroom_layout`, `pages.sections`, `admin_users.sidebar_permissions` jsonb. Native compiler dizi/obje → `::jsonb` serialize ediyor (`query-compiler.ts:196`) |
| Mevcut kayıtlar | NULL → mevcut davranış. **Backfill gerekmez** |
| Public sorgu değişimi | Select'e **1 kolon** — yeni embed/relation **YOK** |
| **Çoklu seçim** | ✅ Tam destek |
| sort_order / custom_title / cover | Aynı satır, **korunur** |
| Aynı dönem iki kez | Uygulama katmanında `Set` ile tekilleştirilir (DB garantisi yok) |
| Villa silinirse | `discount_collections` CASCADE ile gider |
| İndirim silinirse | ⚠️ FK yok → **id dizide "ölü" kalır**. Ama zararsız: `cache.helpers` seçimi **mevcut embed satırlarıyla KESİŞTİRİR** → eşleşmeyen id hiçbir şey yapmaz. Kürasyon korunur ✅ |
| Cleanup cron | Uyumlu (ölü id'ler inert). İstenirse admin ekranı her kaydetmede diziyi tazeler |
| Availability | Aday havuzu kesişimle daralır; mekanizma aynı |
| Cache | Değişmez |
| N+1 | Yok |
| Testler | **En düşük etki** |
| **Sonuç** | **Çoklu seçimi en az değişiklikle veren seçenek.** Tek zayıflığı referans bütünlüğünün uygulamada olması. |

## Seçenek D — UNIQUE(villa_id) kaldır + satır başına dönem

```sql
DROP INDEX discount_collections_villa_unique;
ALTER TABLE discount_collections ADD COLUMN villa_discount_id uuid REFERENCES villa_discounts(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX ON discount_collections (villa_id, villa_discount_id);
```

| Kriter | Değerlendirme |
|---|---|
| DB değişikliği | **Evet, yıkıcı olmayan ama yapısal**: index DROP + kolon + yeni UNIQUE |
| Mevcut kayıtlar | `villa_discount_id` NULL → "tüm dönemler" satırı olarak yaşamaya devam eder. Backfill **gerekmez** ama karışık bir ara durum doğar |
| **Çoklu seçim** | ✅ Doğal — her dönem kendi satırı |
| sort_order / custom_title / cover | ✅ **Dönem başına ayrı** olabilir (bazı ürünler için avantaj) |
| Aynı dönem iki kez | UNIQUE(villa_id, villa_discount_id) engeller |
| İndirim silinirse | CASCADE → **satırın tamamı gider → kürasyon (sort_order/başlık/kapak) KAYBOLUR** ❌ (SET NULL yapılırsa "tüm dönemler" satırına dönüşür — belirsiz) |
| Cleanup cron | ⚠️ Geçmiş indirim silinince koleksiyon satırı da silinir — **kullanıcının açık isteğine aykırı** |
| Admin UI etkisi | `usedVillaIds` mantığı, picker, remove semantiği, DnD sırası **hepsi yeniden düşünülmeli** |
| Public etkisi | Bir villa **birden fazla kart** üretir (bkz. §5-P3); `VillaCard` key/id çakışması ele alınmalı |
| Testler | **Yüksek etki** |
| **Sonuç** | Ürün "dönem başına ayrı kart + ayrı başlık/kapak" istiyorsa **doğru** model; aksi hâlde en riskli. |

## Seçenek E — Migration'sız: admin seçimi `villa_discounts` satırlarını silerek yapar

| Kriter | Değerlendirme |
|---|---|
| DB değişikliği | **Yok** |
| Çoklu seçim | "Seçmediklerini sil" ile taklit edilir |
| **Yan etki** | ❌ **KABUL EDİLEMEZ**: `villa_discounts` fiyat motorunun girdisi (`price.engine > getActiveDiscount`, `/rezervasyon`, `price-verify`, admin fiyat takvimi). Küratörlük için silinen dönem **fiyatlandırmadan da silinir** |
| Geri alınabilirlik | Yok (replace-all) |
| **Sonuç** | **REDDEDİLMELİ.** Küratörlük ile fiyatlandırmayı birbirine karıştırır. |

## 4.5 ⚠️ ORTAK RİSK: `villa_discounts.id` kararlı değil

`saveDiscountData` → `replace_villa_discounts` **DELETE + INSERT** yapıyor. Admin fiyat/indirim ekranında **herhangi bir** değişikliği kaydettiğinde o villanın tüm indirim satırları **yeni id** alır.

Etki:
* **A, B:** FK'ler CASCADE/SET NULL ile temizlenir → seçim **sessizce sıfırlanır** → villa "tüm dönemler" moduna döner (kart kaybolmaz, ama admin'in seçimi gider).
* **C:** id'ler ölü kalır, kesişim boş → **"hiçbir dönem seçili değil"** durumu doğar. Bu, kartın **kaybolmasına** yol açabilir — eğer "boş dizi = hiçbiri" olarak yorumlanırsa. ⚠️ Bu yüzden **kural net olmalı: kesişim boş kalırsa mevcut davranışa (tüm görünür dönemler) düş.** Böylece kart asla sessizce kaybolmaz.

### Alternatif kimlik: **id yerine `(start_date, end_date)` çifti**
`villa_discounts`'ta `EXCLUDE villa_discounts_no_overlap` sayesinde bir villada aynı tarih aralığı **iki kez olamaz** → `(villa_id, start_date, end_date)` **doğal ve kararlı bir anahtardır** ve replace-all'dan **etkilenmez**.
➡️ Seçenek C'nin bir varyantı olarak `selected_discount_ranges jsonb` = `[{ "start":"2026-10-10", "end":"2026-10-17" }, …]` saklamak, **§4.5 riskini tamamen ortadan kaldırır**. FK zaten kurulamıyordu; kaybedilen bir şey yok.
➡️ Ayrıca `cache.helpers` seçimi zaten `start|end` anahtarıyla eşleştiriyor (`fullyBlockedKeys` / `overlapKeys` anahtar şeması **birebir aynı**) → entegrasyon doğal.

## 4.6 KARŞILAŞTIRMA ÖZETİ

| | Migration | Çoklu seçim | Kürasyon korunur | id kararlılığı | Kod yüzeyi | Risk |
|---|---|---|---|---|---|---|
| **A** villa_discount_id | ADD COLUMN | ❌ | ✅ | ❌ | Düşük | Düşük |
| **B** join tablo | CREATE TABLE | ✅ | ✅ | ❌ | **Yüksek** | Orta |
| **C** jsonb id dizisi | ADD COLUMN | ✅ | ✅ | ❌ | **Düşük** | Düşük-Orta |
| **C′** jsonb tarih-aralığı dizisi | ADD COLUMN | ✅ | ✅ | **✅** | **Düşük** | **En düşük** |
| **D** satır/dönem | DROP INDEX + kolon | ✅ | ❌ | ❌ | Yüksek | **Yüksek** |
| **E** migration'sız | — | — | — | — | — | **Reddedildi** |

---

# 5. PUBLIC TEMSİL — 3 SEÇENEK (KARAR SİZİN)

Mevcut gerçek: **`HomepageCollectionVilla.discount` ve `VillaCard.discount` TEKİL obje.** Kart tasarımı tek bir indirim yüzdesi rozeti, tek bir "İndirim geçerli: …" tarih etiketi ve tek bir CTA üzerine kurulu.

## P1 — Tek kart, tek dönem (seçim yalnız ADAY HAVUZUNU daraltır)

Admin'in seçtiği dönemler **aday havuzu** olur; `cache.helpers` bugünkü kuralla (start_date ASC, tamamen dolu olanı atla) **bunların içinden** birini seçer.

* `VillaCard` **hiç değişmez** (tasarım, className, CTA, prop tipi).
* `DiscountCollection` **hiç değişmez**.
* Availability mekanizması **hiç değişmez**.
* Kod değişikliği: `cache.helpers`'ta **tek bir `.filter()`**.
* ❗ Kullanıcının "%20 10–17 Ekim **ve** %25 1–8 Kasım aynı kartta" beklentisini **karşılamaz** — kartta yine tek dönem görünür.

## P2 — Tek kart, kart içinde birden fazla dönem

* `discount` prop'u **dizi**ye (`discount[]`) ya da ek `discountPeriods` prop'una dönüşür.
* Kart tasarımı **zorunlu olarak değişir**: birden fazla yüzde rozeti/tarih satırı, **ve en kritik soru — CTA hangi dönemi kullanacak?** (Tek buton, N dönem.)
* Fiyat gösterimi belirsizleşir: `price` bugün **seçilen dönemin `start_date`'ine denk gelen sezon fiyatı** (`getSeasonPriceForDiscountStart`). N dönem → N farklı referans fiyat.
* **"VillaCard tasarımı bozulmasın" koruma maddesiyle doğrudan çelişir.**

## P3 — Villa başına birden fazla kart

* `DiscountCollection` bir koleksiyon satırını N karta açar; **her kart bugünkü tasarımın aynısı** (tek dönem, tek rozet, tek CTA) → **tasarım hiç değişmez**.
* Availability tarafı **zaten hazır**: `overlapKeys` / `fullyBlockedKeys` anahtarları `villaId|start|end` — yani (villa, dönem) çifti başına karar **şu an bile** üretiliyor.
* Ele alınması gerekenler: React `key` tekilliği (bugün `c.id` = villa id), kart sırası (villa bazlı `sort_order` içinde dönemler nasıl sıralanacak), carousel uzunluğu, aynı villanın kartlarının yan yana mı dağınık mı görüneceği.
* Seçenek **D** ile doğal eşleşir (satır/dönem); C′ ile de mümkün (tek satır → N kart).

**Değerlendirme (karar sizin):** P1 tasarım riski **sıfır**, ürün beklentisini kısmen karşılar. P3 tasarımı korur **ve** çoklu dönemi gerçekten gösterir. P2 koruma listesiyle çelişir.

---

# 6. ADMIN UX ANALİZİ

Mevcut kart satırı (`page.tsx:~300-468`): sürükle tutamacı, kapak görseli, villa adı, düzenlenebilir `custom_title`, Aktif/Pasif butonu (`Eye`/`EyeOff`), Çıkar butonu.

## Önerilen minimum UX — mevcut yapıyı bozmadan

1. **Ekleme akışı değişmez.** Villa seçilir, satır oluşur. Yeni satır varsayılan olarak **"tüm dönemler"** (seçim yok) → bugünkü davranış.
2. **Satıra tek bir genişletilebilir bölüm eklenir:** "İndirim dönemleri (3/4 seçili)". Açılınca checkbox listesi:
   ```
   ☑ 10–17 Ekim   · %20
   ☐ 20–27 Ekim   · %15
   ☑ 1–8 Kasım    · %25
   ☐ 10–17 Kasım  · 12.000 TRY/gece
   ```
   Veri kaynağı: **mevcut** `loadDiscountData(villaId)` server action'ı (yeni endpoint yok). Yalnız bölüm açıldığında çağrılır → liste ilk yüklemede **N+1 üretmez**.
3. **Kaydetme:** mevcut `updateDiscountCollectionItem` servisine yeni alan eklenir (aynı `updateById` yolu). Yeni action/servis dosyası gerekmez.
4. **Boş seçim kuralı:** "hiçbiri seçili değil" = **tüm dönemler** (bugünkü davranış). Böylece kart asla sessizce kaybolmaz ve §4.5 riski etkisizleşir. "Villayı hiç gösterme" isteği zaten **Pasif** toggle'ı ile mevcut.
5. **Etkilenmeyenler:** villa seçme (UNIQUE(villa_id) korunursa aynı), tekrar ekleme engeli, kaldırma, DnD sıralama, aktif/pasif, custom_title, custom_cover_image.
6. **Rozet:** satırda küçük bir "3/4 dönem" etiketi admin'e durumu bir bakışta gösterir (opsiyonel).

⚠️ Seçenek **D** seçilirse bu UX değişir: ekleme "villa + dönem" olur, aynı villa birden çok kez eklenebilir, `usedVillaIds` mantığı (villa → villa+dönem) yeniden yazılır. Admin için daha karmaşık, DnD listesi uzar.

---

# 7. GERİYE DÖNÜK UYUMLULUK

**Mevcut tüm kayıtlar `villa_id`-only mantığında.** (Üretimdeki satır sayısı doğrulanamadı — DB'ye erişilmedi.)

### En güvenli kural: **"seçim yok / eşleşme yok" ⇒ MEVCUT DAVRANIŞ**

| Durum | Davranış |
|---|---|
| Kolon NULL (migration sonrası tüm eski kayıtlar) | Tüm görünür dönemler aday → **bugünkü davranışın birebir aynısı** |
| Boş dizi `[]` | **Aynı** (tüm dönemler) — "hiçbiri" olarak yorumlanmaz |
| Seçim var ama hiçbiri mevcut dönemlerle eşleşmiyor (silinmiş/replace edilmiş) | **Tüm dönemlere düş** (fail-safe) |
| Seçim var ve eşleşiyor | Yalnız seçilenler aday |

**Sonuç:**
* **Backfill GEREKMEZ.**
* 100 / 1000+ mevcut kayıt migration'dan sonra **bozulmadan görünmeye devam eder.**
* Admin'in tekrar seçim yapması **zorunlu değildir** — seçim yapmayan villalar bugünkü gibi çalışır.
* Public bölümün bir anda boşalması **imkânsızdır** (her fail yolu "tüm dönemler"e düşer).

---

# 8. GEÇMİŞ İNDİRİM CLEANUP İLE ETKİLEŞİM

Cron: `GET /api/cron/villa-discounts-cleanup` → `DELETE FROM villa_discounts WHERE end_date < today` (STRICT `<`), `discount_collections`'a **hiç dokunmaz**.

Senaryo: admin 10–17 Ekim'i seçti; 18 Ekim'de o `villa_discounts` satırı siliniyor.

| Seçenek | FK davranışı | Cleanup sonrası |
|---|---|---|
| **A** `villa_discount_id` | `ON DELETE SET NULL` | Seçim NULL → villa "tüm dönemler"e döner. Kürasyon **korunur** ✅ |
| **A′** | `ON DELETE CASCADE` | ❌ **Koleksiyon satırı silinir → kürasyon kaybolur.** Kesinlikle kullanılmamalı |
| **A″** | `ON DELETE RESTRICT` | ❌ **Cleanup cron'u kırar** (DELETE reddedilir). Kullanılmamalı |
| **B** join tablo | `villa_discount_id ON DELETE CASCADE` | **Yalnız link satırı** silinir; `discount_collections` ve kürasyon **korunur** ✅ **En temiz** |
| **C / C′** jsonb | FK yok | Ölü id/aralık dizide kalır ama **kesişim** onu görmezden gelir; ayrıca `end_date >= bugün` filtresi zaten eliyor. Kürasyon **korunur** ✅ |
| **D** satır/dönem | `ON DELETE CASCADE` | ❌ Koleksiyon satırı gider → **kürasyon kaybolur** |

### "Geçmiş indirim silinince koleksiyondan otomatik çıksın ama kürasyon kaybolmasın" mümkün mü?
**EVET — ve bu davranış BUGÜN ZATEN ÇALIŞIYOR.** İki yerdeki `end_date >= bugün` filtresi (public `cache.helpers:631` ve admin `listDiscountCollection`) süresi dolmuş dönemi hem karttan hem admin listesinden çıkarıyor; `discount_collections` satırı **duruyor** ve villaya yeni indirim eklenince **otomatik geri geliyor**. Seçim özelliği eklenirken bu davranışa **hiç dokunulmamalıdır**.

---

# 9. AVAILABILITY SİSTEMİYLE UYUMLULUK

**Bağlantı noktası tek bir yer:** `visibleDiscounts` → `discountCandidates.set(v.id, { periods, priceForDiscount })`.
Seçim filtresi **tam olarak buraya**, `periods` oluşturulurken uygulanır. Bundan sonraki her şey (pencere gruplama, Kademe 1/2, `overlapKeys`, `fullyBlockedKeys`, guard, dönem yeniden seçimi, gizleme) **değişmeden çalışır**.

### İstediğiniz senaryonun izi

Villa A: 10–17 Ekim **tamamen dolu** · 20–27 Ekim **tamamen müsait** · 1–8 Kasım **kısmen dolu**
Admin seçimi: ☑ 10–17 Ekim · ☑ 1–8 Kasım

```
periods (filtreden sonra) = [10–17 Ekim, 1–8 Kasım]      ← 20–27 HAVUZDA YOK
  pencere grupları: (10-10|10-17), (11-01|11-08)          ← 20–27 için SORGU BİLE ATILMAZ
  Kademe 1 → her ikisinde de overlap VAR
  Kademe 2 → 10–17 fullyBlocked ✅ · 1–8 fullyBlocked DEĞİL
  usable = periods.find(!fullyBlocked) = 1–8 Kasım
  discount = 1–8 Kasım · discount_available = false        ← kısmen dolu
  → KART GÖSTERİLİR, CTA = /kiralik-villa/<slug>           ✅ beklenen
```
Ve 20–27 Ekim **hiçbir koşulda kullanılmaz** — ne seçilir, ne sorgulanır. ✅
Seçilen tüm dönemler tamamen doluysa → `usable = null` → `hiddenVillaIds` → **kart yok**. ✅

---

# 10. PERFORMANS

* **Seçim filtresi sorgu sayısını ARTIRMAZ, AZALTIR** — aday pencere kümesi daralır.
* Sorgu formülü değişmez: `W + Σ(yalnız blocked pencereler) N_w`, `W` = **seçili** dönemlerin distinct `(start,end)` sayısı. Villa sayısından **bağımsız** (1500 villa aynı pencerede → yine 1..N+1 sorgu).
* **"8 dönem seçili villa" senaryosu:** 8 pencere **grup anahtarı**na girer; aynı pencereyi paylaşan diğer villalarla **birlikte** sorgulanır. **8 ayrı villa kartı sorgusu veya 8×N sorgu OLUŞMAZ.** En kötü ihtimalle o villa için 8 pencere sorgusu + yalnız blocked olanlarda gece taraması.
* **Ek optimizasyon imkânı (opsiyonel):** P1'de yalnız "ilk uygun dönem" gerekli olduğundan pencereler sırayla değerlendirilip erken çıkılabilir. Bugünkü paralel gruplama daha basit ve zaten sınırlı — **önerilmiyor, sadece not**.
* **Index ihtiyacı:**
  * A / C / C′ → **yok** (aynı satırda kolon; ek sorgu yok).
  * B → `discount_collection_discounts (discount_collection_id)` index'i **gerekli** (embed lookup); `villa_discount_id` FK için de önerilir.
  * D → `(villa_id, villa_discount_id)` UNIQUE index zaten kapsar.
* **Embed maliyeti (B):** native compiler embed'leri **korelasyonlu `json_agg` subquery** olarak derliyor (`query-compiler.ts:329-332`) → satır başına ekstra round-trip **yok**, tek SQL.
* **Cache:** her seçenekte `["discount-collection:get"]` key, `["discount","villa-reviews"]` tag ve `revalidate: 600` **değişmez**. Admin seçimi kaydedince mevcut `revalidateDiscount()` zaten tetikleniyor → **yeni cache mekanizması gerekmez**.

---

# 11. ÖNERİLEN MİNİMUM DEĞİŞİKLİK

> **Önerilen kombinasyon: Seçenek C′ (jsonb tarih-aralığı dizisi) + P1 (tek kart, aday havuzu daraltma).**
> Gerekçe: çoklu seçimi destekler · tek ADD COLUMN · `VillaCard`/`DiscountCollection`/availability/cache **hiç değişmez** · `replace_villa_discounts`'ın id değiştirmesinden **etkilenmez** · her hata yolu mevcut davranışa düşer.
> P3 isterseniz (villa başına N kart) C′ üzerine **ikinci bir faz** olarak eklenebilir; C′ bunu engellemez.

### DEĞİŞECEK DOSYALAR

| Dosya | Değişiklik |
|---|---|
| `db/migrations/0XX_discount_collection_selected_ranges.sql` | **YENİ** — `ALTER TABLE discount_collections ADD COLUMN IF NOT EXISTS selected_discount_ranges jsonb;` (additive, nullable, idempotent) |
| `lib/db/discount.repository.ts` | `LIST_SELECT` + `findActivePublicCards` select'ine **1 kolon** |
| `app/services/discount-collection.service.ts` | `DiscountCollectionItem` tipine alan; `updateDiscountCollectionItem`'a `selected_discount_ranges` desteği (mevcut `updateById` yolu) |
| `app/(admin)/maki-admin/discount-collection/page.tsx` | Satıra genişletilebilir dönem checkbox bölümü; `loadDiscountData(villaId)` ile doldurulur; kaydet mevcut update action'ına gider |
| `lib/cache.helpers.ts` | `visibleDiscounts` üzerine **tek `.filter()`** (seçim varsa ve ≥1 eşleşme varsa daralt; aksi hâlde aynen bırak) |
| `types/database.ts` | `DiscountCollectionRow` tipine alan (varsa) |

### DEĞİŞMEYECEK DOSYALAR

`app/components/villa/VillaCard.tsx` · `app/components/home/DiscountCollection.tsx` · `lib/availability.helper.ts` / `.validator.ts` / `.action.ts` · `lib/db/reservation.repository.ts` · `lib/price.engine.ts` · `lib/stay-rules.helper.ts` · `app/api/cron/**` (cleanup cron dahil) · `lib/db/villa-discount.repository.server.ts` · `app/components/admin/villa/discount.action.ts` (yalnız **çağrılır**, değişmez) · `app/services/reservation/**` · `app/api/public/reservations/**` · `app/components/reservation/**` · `app/components/search/**` · `app/components/short-gaps/**` · `app/components/villa/booking/**` · `app/services/revalidate.actions.ts` · `lib/db/relation-metadata.ts` (C′ seçilirse) · mevcut migration'lar · tüm RPC'ler · DB constraint'leri · cache key/tag/revalidate · `?start=&end=` URL formatı · villa detay ve rezervasyon route'ları.

### GEREKEN MIGRATION
**1 adet, additive, idempotent, geri alınabilir** — tek `ADD COLUMN ... jsonb` (NULL default). Veri kaybı riski yok, rollback = `DROP COLUMN`.
(Seçenek B seçilirse: 1 `CREATE TABLE` + 2 FK + 1 UNIQUE + 1 index. Seçenek D seçilirse: `DROP INDEX` içerdiği için **en riskli**.)

### GEREKEN BACKFILL
**YOK.** NULL = mevcut davranış.

### GEREKEN CACHE DEĞİŞİKLİKLERİ
**YOK.** Key/tag/revalidate aynı; admin mutation'ları zaten `revalidateDiscount()` çağırıyor.

### GEREKEN ADMIN DEĞİŞİKLİKLERİ
Tek ekran, tek bölüm: dönem checkbox listesi + kaydet. Yeni endpoint/servis/repository **yok** (`loadDiscountData` + `updateDiscountCollectionItem` yeniden kullanılır).

### PUBLIC DEĞİŞİKLİKLERİ
`cache.helpers`'ta **tek `.filter()`**. `VillaCard` ve `DiscountCollection`'da **sıfır** değişiklik.

---

# 12. KORUMA LİSTESİ DOĞRULAMASI

| Korunacak | C′ + P1 ile durum |
|---|---|
| VillaCard tasarımı / className / CTA metni | ✅ Dosya hiç açılmaz |
| `/rezervasyon/<slug>?start=&end=` formatı, +1 gün yok | ✅ Değişmez |
| kısmen dolu → detay · tamamen dolu → gizli · tamamen müsait → rezervasyon | ✅ Mekanizma aynı |
| Geçmiş indirim cleanup cron | ✅ Dosya değişmez, davranış aynı |
| `is_active` / `custom_title` / `custom_cover_image` / `sort_order` / DnD | ✅ Aynı satırda, aynı akış |
| Reservation sistemi · availability RPC'leri · DB constraint'leri | ✅ Dokunulmaz |
| Cache key / tag / revalidate | ✅ Değişmez |
| Default VillaCard davranışı · diğer kartlar · ana sayfa tasarımı | ✅ Etkilenmez |

---

# 13. SONUÇ — 14 SORUYA CEVAP

| # | Soru | Cevap |
|---|---|---|
| 1 | Bu özellik mevcut mimaride yapılabilir mi? | **Evet** — ama **migration'sız yapılamaz** (şemada seçimi saklayacak hiçbir alan yok ve `UNIQUE(villa_id)` satır çoğaltmayı engelliyor). Migration'sız tek yol (`villa_discounts` silmek) fiyat motorunu bozar → reddedildi. |
| 2 | En az riskli mimari? | **C′** — `discount_collections.selected_discount_ranges jsonb` (tarih-aralığı dizisi) + **P1** (tek kart, aday havuzu daraltma). Tek ADD COLUMN, `VillaCard`/availability/cache sıfır değişiklik, `replace_villa_discounts`'ın id değiştirmesine dayanıklı. |
| 3 | Migration gerekiyor mu? | **Evet**, 1 adet additive/nullable/idempotent `ADD COLUMN`. |
| 4 | Mevcut 100/1000+ kayıt nasıl korunacak? | **Hiçbir şey yapmadan.** NULL = "seçim yok" = bugünkü davranış. Backfill yok, admin müdahalesi yok, kart kaybı yok. |
| 5 | Admin'de seçim nasıl yapılacak? | Koleksiyon satırında genişletilebilir checkbox listesi; veri **mevcut** `loadDiscountData(villaId)` action'ından; kaydetme **mevcut** `updateDiscountCollectionItem` yolundan. Yeni endpoint yok. |
| 6 | Public'te 1/2/8 seçili dönem nasıl temsil edilmeli? | **Karar sizin** — P1 (tek kart, havuz daraltma; tasarım riski **sıfır**), P2 (tek kart içinde N dönem; **koruma listesiyle çelişir**), P3 (villa başına N kart; tasarım korunur, availability anahtarları **zaten hazır**). Öneri: **P1 ile başla, P3'ü ikinci faz olarak değerlendir.** |
| 7 | Availability nasıl korunacak? | Filtre **tek noktaya** (`visibleDiscounts` → `discountCandidates.periods`) girer. Pencere gruplama, Kademe 1/2, guard, gizleme mantığı **hiç değişmez**. |
| 8 | Cleanup ile ilişki? | C′'de FK yok → ölü aralıklar inert; `end_date >= bugün` filtresi zaten eliyor; kürasyon korunuyor. (B'de `ON DELETE CASCADE` link'i temizler — o da temiz. **A′ CASCADE ve D CASCADE kürasyonu öldürür, A″ RESTRICT cron'u kırar.**) |
| 9 | N+1 oluşur mu? | **Hayır.** C′'de ek sorgu yok; B'de embed tek SQL (`json_agg` korelasyonlu subquery). Availability sorgu sayısı villa sayısından bağımsız kalır ve seçimle **azalır**. |
| 10 | Değişecek dosyalar | §11 tablosu — **5 dosya + 1 migration**. |
| 11 | Değişmeyecek dosyalar | §11 listesi — `VillaCard`, `DiscountCollection`, availability katmanı, cron, price engine, cache ayarları dahil. |
| 12 | Backfill gerekiyor mu? | **Hayır.** |
| 13 | Test senaryoları | §14. |
| 14 | Risk/belirsizlik | §15. |

---

# 14. TEST SENARYOLARI

**Geriye dönük uyumluluk**
1. Kolon NULL → tüm görünür dönemler aday (bugünkü çıktıyla **birebir aynı**)
2. Boş dizi `[]` → aynı (tüm dönemler) — kart **kaybolmaz**
3. Seçim var ama hiçbiri eşleşmiyor (replace-all sonrası) → **tüm dönemlere düşer**, kart kaybolmaz

**Seçim mantığı**
4. 4 dönemden 2'si seçili → yalnız o 2'si aday
5. Seçilmemiş dönem **hiçbir koşulda** seçilmez **ve sorgulanmaz** (çağrı argümanları doğrulanır)
6. Seçili tek dönem, tamamen müsait → kart var, CTA rezervasyon, `start`/`end` **aynen**
7. Seçili tek dönem, kısmen dolu → kart var, CTA detay
8. Seçili tek dönem, tamamen dolu → **kart yok**
9. §9 senaryosu: 10–17 dolu + 1–8 kısmi seçili, 20–27 seçilmemiş → kart var, dönem **1–8**, CTA detay
10. Seçili tüm dönemler tamamen dolu → **kart yok**
11. Seçili dönemlerden ilki tamamen dolu, ikincisi müsait → **ikincisi** seçilir, CTA rezervasyon
12. Seçili dönem süresi geçmiş (`end_date < bugün`) → `visibleDiscounts` zaten eler; kalan seçililerle devam
13. Tek günlük seçili dönem (`start === end`) → mevcut davranış korunur, gizlenmez

**Fiyat / alan bütünlüğü**
14. Dönem değişince `price`/`currency` `getSeasonPriceForDiscountStart` ile **aynı kuralla** yeniden türetilir
15. `discount_type`/`discount_value`/`currency` seçilen dönemden birebir taşınır

**Admin**
16. Yeni eklenen villa → seçim NULL → tüm dönemler
17. Seçim kaydetme → `updateById` çağrısı, **yalnız** yeni alan payload'da
18. `is_active` / `custom_title` / `custom_cover_image` / `sort_order` / DnD **etkilenmez**
19. `loadDiscountData` yalnız bölüm açılınca çağrılır (ilk yüklemede N+1 yok)
20. Aynı dönem iki kez seçilemez (uygulama katmanı tekilleştirme)

**Performans**
21. 10 villa aynı seçili pencere → **1 sorgu**
22. 1 villa 8 seçili dönem → **≤8 pencere sorgusu**, 8×N **yok**
23. 1500 villa aynı seçili pencere → sorgu sayısı **villa sayısından bağımsız**
24. Seçim daraltıldığında sorgu sayısı **azalır** (artmaz)

**Cleanup etkileşimi**
25. Seçili dönem cron ile silinince → kart kaybolmaz, kalan seçililer veya "tüm dönemler" devreye girer
26. Cleanup `discount_collections`'a **dokunmaz** (mevcut test korunur)

**Regresyon**
27. Mevcut `discount-collection-visibility.test.ts` ve `discount-collection-availability.test.ts` **assertion'ları değişmeden** geçer
28. `VillaCard` ve `DiscountCollection` dosyalarında **sıfır diff**

---

# 15. RİSKLER VE BELİRSİZLİKLER

| # | Risk | Şiddet | Azaltma |
|---|---|---|---|
| 1 | **`replace_villa_discounts` id'leri değiştiriyor** — id tabanlı seçim sessizce sıfırlanır | **Yüksek** | **C′**: seçimi `(start_date, end_date)` çiftiyle sakla. `EXCLUDE no_overlap` bu çiftin villa içinde **benzersiz** olmasını garanti ediyor |
| 2 | "Boş seçim" belirsizliği — hiçbiri mi, hepsi mi? | Orta | Kural sabitlenmeli: **boş/eşleşmeyen = tüm dönemler**. "Gösterme" isteği zaten `is_active=false` ile karşılanıyor |
| 3 | `UNIQUE(villa_id)` — P3 (villa başına N kart) istenirse tek satırdan N kart üretmek gerekir | Orta | C′ + `DiscountCollection`'da expand; ya da Seçenek D (index DROP — **daha riskli**) |
| 4 | jsonb'de referans bütünlüğü yok | Düşük | Kesişim zaten filtreliyor; ölü kayıtlar inert; admin her kaydetmede diziyi tazeliyor |
| 5 | Uzun/çok sayıda seçili dönem → pencere sayısı artar | Düşük | Sorgu villa sayısından bağımsız; mevcut 31 gece guard'ı yürürlükte |
| 6 | Admin ekranında dönem listesi yüklenmesi | Düşük | Yalnız bölüm açılınca (lazy) |
| 7 | Public'te temsil kararı (P1/P2/P3) verilmeden kod yazılması | **Yüksek** | **Bu karar sizin** — verilmeden uygulamaya geçilmemeli |
| 8 | **Production DB doğrulanamadı** | — | Mevcut `discount_collections` satır sayısı, gerçek index durumu ve üretimdeki kolonlar **kod/migration'dan** okundu; şema hakkında varsayım yapılmadı |
| 9 | Migration üretim ortamında elle uygulanıyor (Coolify/Hetzner) | Düşük | Additive + `IF NOT EXISTS` + rollback `DROP COLUMN` |

---

## Uygulamaya geçmeden önce sizden gereken 3 karar

1. **Saklama modeli:** C′ (jsonb tarih aralığı) · C (jsonb id) · B (join tablo) · A (tekil) · D (satır/dönem)?
2. **Public temsil:** P1 (tek kart — tasarım riski sıfır) · P3 (villa başına N kart) · P2 (kart içinde N dönem — koruma listesiyle çelişir)?
3. **Boş seçim kuralı:** "tüm dönemler" (önerilen) mi, "hiçbiri" mi?

Bu üçü netleşmeden kod yazılmamalı; özellikle 2. karar `VillaCard`/`DiscountCollection`'a dokunulup dokunulmayacağını belirliyor.
