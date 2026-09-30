# Eksik Sezon Fiyatı Düzeltmesi — Production Etki Analizi

**Tarih:** 2026-09-20 · **Tür:** SALT-OKUNUR analiz. Hiçbir dosya değiştirilmedi, commit/push yapılmadı.
**Yöntem:** (a) `git show HEAD:lib/price.engine.ts` ile **eski** motor, çalışma ağacından **yeni** motor alınıp repo **dışında** salt-okunur bir harness'ta yan yana çalıştırıldı; (b) `villa_prices` yazma/okuma yolları koddan incelendi.
**Erişim sınırı:** **Production veritabanına erişim YOK.** Gerçek `villa_prices` satırları görülemedi. "Kod hangi şekilleri üretebilir/nasıl davranır" sorusu cevaplandı; "şu an kaç villa etkilenir" sorusu **cevaplanamadı** — §5'teki salt-okunur SQL tam olarak bunu ölçmek içindir.

---

## 1. Eşdeğerlik kanıtı — tam fiyat tanımlı senaryolarda sonuç DEĞİŞMİYOR

Eski ve yeni `calculateGrandTotal`, kapsamı garantili senaryolardan oluşan bir matriste yan yana çalıştırıldı. Karşılaştırma, dönüş nesnesinin **12 ortak alanının tamamı** üzerinde yapıldı (`nights, stay, cleaning, poolHeating, total, original_stay, original_cleaning, original_pool_heating, original_currency, original_cleaning_currency, original_pool_heating_currency, currency`). Yeni sürümdeki 2 ek alan (`priceAvailable`, `uncoveredNights`) karşılaştırma dışında tutuldu.

| | |
|---|---:|
| Karşılaştırılan senaryo | **257.571** |
| Çıktısı **BİREBİR AYNI** | **257.571** |
| Farklı | **0** |

İki ayrı saat diliminde (`TZ=UTC` ve `TZ=Europe/Istanbul`) çalıştırıldı — **iki koşuda da 0 fark**.

**Matris kapsamı:** 8 farklı başlangıç tarihi (kış/yaz/sezon dönüşü/yılbaşı/DST tarihleri dahil) × 11 farklı gece sayısı (1, 2, 3, 5, 7, 10, 14, 21, 28, 30, 45) × 3 sezon düzeni (tek sezon · iki bitişik sezon · üç bitişik sezon) × 3 kaynak para birimi (TRY/EUR/USD) × 3 gösterim para birimi × 6 temizlik ücreti/limit kombinasyonu × 6 havuz ısıtma kombinasyonu (ay kısıtı dahil) × 3 kur tablosu (normal · eksik EUR kuru · tamamen boş kur tablosu) + 8 farklı indirim kombinasyonu (indirimsiz · boş dizi · %20 · %100 · sabit 5.000 · normalden yüksek sabit · EUR cinsinden sabit · kısmi örtüşen) + boş tarih erken-dönüş yolu.

**Sonuç:** Fiyat tanımı eksiksiz olan hiçbir rezervasyonda tek bir kuruş bile değişmiyor. İndirim matematiği, kur dönüşümü ve yuvarlama sırası, sezon eşleştirme, temizlik limiti muafiyeti ve havuz ısıtma ay kısıtı **aynen** çalışıyor.

**Sınır davranışları da doğrulandı:**

| Durum | Eski | Yeni |
|---|---:|---:|
| `end_date` = çıkış gününden bir önceki gün | 70.000 | **70.000** |
| `end_date` = çıkış günü (kapalı aralık) | 70.000 | **70.000** |

Yani "son gece hangi satırdan fiyatlanır" semantiği ve çıkış gecesinin sayılmaması **değişmedi**.

---

## 2. Davranışın DEĞİŞTİĞİ durumların tam listesi (blast radius)

7 gecelik referans konaklama (08→15 Ekim 2026), gecelik 10.000 TL:

| # | Senaryo | ESKİ toplam | YENİ toplam | Kapsamsız gece | Değerlendirme |
|---|---|---:|---:|---:|---|
| 1 | 7/7 gece kapsanıyor | 70.000 | 70.000 | 0 | ✅ değişmedi |
| 2 | **6/7 — aradan 1 gece eksik** | 60.000 | **0** | 1 | eski değer YANLIŞ'tı |
| 3 | **1/7 — tek gece kapsanıyor** | 10.000 | **0** | 6 | eski değer YANLIŞ'tı |
| 4 | **0/7 — satır var, hiçbiri eşleşmiyor** | 10.000 | **0** | 7 | eski: tek gecelik fallback |
| 5 | `prices = []` | 0 | 0 | 7 | sayı aynı, ama artık **rezervasyon bloklanıyor** |
| 6 | **0/7 + temizlik ücreti 1.500** | 11.500 | **0** | 7 | eski: `total > 0` olduğu için kartta GÖRÜNÜYORDU |
| 7 | **Sezonlar arası 1 gün boşluk** | 90.000 | **0** | 1 | eski değer YANLIŞ'tı |
| 8 | **6/7 + %20 indirim** | 48.000 | **0** | 1 | eski değer YANLIŞ'tı |
| 9 | **6/7, EUR fiyatlı villa** | 54.000 | **0** | 1 | eski değer YANLIŞ'tı |
| 10 | **Aynı gün giriş/çıkış (0 gece)** | 10.000 | **0** | 0 | eski: 0 gece için 1 gece ücreti uyduruyordu |
| 11 | **Bozuk tarih (`"abc"`)** | 10.000 | **0** | 0 | eski: fallback uyduruyordu |
| 12 | Satır var ama `price = 0` | 0 | 0 | 7 | sayı aynı, ama artık **bloklanıyor** |
| 13 | **Satır var ama `price` negatif** | **−700** | **0** | 7 | eski: negatif toplam üretiyordu |

**Kritik gözlem:** Davranışın değiştiği 13 durumun **hiçbirinde eski değer doğru değildi**. Yeni davranış hiçbir doğru hesabı bozmuyor; yalnızca yanlış hesapları "geçersiz" olarak işaretliyor.

**İki incelikli durum (sayı aynı ama akış değişiyor):** 5 ve 12 numaralı satırlarda toplam eskiden de 0'dı — ancak `priceAvailable` bayrağı olmadığı için form gönderilebiliyordu. Artık bu villalar o tarihlerde **rezerve edilemez**. Bu, sayısal diff'te görünmeyen ama gerçek bir davranış değişikliğidir.

---

## 3. `villa_prices` yapısı — hangi mevcut kayıtlar etkilenebilir?

### 3.1 Motorun "bu gece kapsanıyor" kuralı (kesin tanım)

Bir gece ancak ve ancak şu koşulları sağlayan bir satır varsa kapsanmış sayılır:

1. `start_date` ve `end_date` **ikisi de** dolu string (`normalizePriceRanges`, `lib/villa-row.types.ts:154-178` null/boş olanları **atar**),
2. gece `start_date <= gece <= end_date` (kapalı aralık),
3. `Number(price) > 0`.

Bu kural, eski koddaki `hadMatchingPrice` ölçütüyle (`daily.original > 0`) **birebir aynıdır** — yalnız OR'lanmak yerine gece gece sayılıyor.

### 3.2 Riskli kayıt şekilleri (koddan doğrulanmış, DB'de var mı UNKNOWN)

| # | Kayıt şekli | Nasıl oluşmuş olabilir | Sonuç |
|---|---|---|---|
| **A** | **`end_date IS NULL`** | `types/database.ts:258-265` → `end_date: string | null` — tip **nullable**. `db/migrations/` içinde `villa_prices` için `NOT NULL` kısıtı **tanımlı değil** | `normalizePriceRanges` satırı **atar** → o aralık tamamen kapsamsız |
| **B** | **`price = 0` veya NULL** | Takvim drawer'ı 0'ı reddeder (`PricingCalendarCanvas.tsx:336-339`) ama RPC/servis katmanı kabul eder; `replace_villa_prices` (mig 002) **hiçbir doğrulama yapmaz** | Gece kapsamsız sayılır → **villa o tarihlerde bloklanır** |
| **C** | **Sezonlar arası boşluk** | `applyRangeDelete` (`range-math.ts:89-97`) seçilen günle **kesişen aralığın tamamını** siler; kısmi bölme yok. 1 gün silmek 4 aylık sezonu düşürebilir | Aradaki geceler kapsamsız |
| **D** | **Gelecek ufkunun bitmesi** | Sezonlar örn. 2026 sonunda bitiyorsa, 2027 tarihleri hiç kapsanmaz. Hiçbir katman minimum kapsam ufku zorlamıyor | Eski kod: tek gecelik fallback (madde 4). Yeni: bloklanır |
| **E** | **Villa formundan sessiz düşme** | `payload.ts:104-106` → `prices.filter(p => p.start_date && p.end_date && p.price > 0)`; **0 fiyatlı veya eksik tarihli aralık hata vermeden payload'dan düşer** ve replace-all onu kalıcı olarak siler | Admin farkında olmadan boşluk üretir |
| **F** | **Boş dizi ile replace** | `update.service.ts:129-132` → villa güncellemesi **her zaman** `setVillaPrices(id, prices ?? [])` çağırır; boş dizi **tüm** fiyatları siler (`replace_villa_prices` yalnız DELETE çalıştırır) | Villanın tüm fiyatları gider |

### 3.3 Koruma durumu — `villa_discounts` ile asimetri

`db/migrations/` içinde `villa_prices` için **hiçbir** `CREATE TABLE`/`CHECK`/`UNIQUE`/`EXCLUDE`/`INDEX` ifadesi yok (tablo repo dışında, eski sağlayıcı döneminde oluşturulmuş). Buna karşılık `villa_discounts` migration 079 ile `EXCLUDE USING gist` (çakışma), `CHECK (start<=end)` ve `CHECK (value>0)` ile korunuyor. Yani **fiyatın kendisi, indirimden daha az korunuyor.** DB'de fiilen hangi kısıtların durduğu **UNKNOWN**.

### 3.4 Üç ayrı yazıcı

`villa_prices`'a yazan üç yol var, üçü de aynı replace-all RPC'sine iniyor: admin fiyat takvimi (`pricing.action.ts:92`), villa oluştur/güncelle route'ları (`setVillaPrices` ALWAYS), ve `setVillaPricesServer`. Hiçbiri bitişiklik, kapsam veya minimum ufuk doğrulaması yapmıyor.

---

## 4. Etkilenen bir villa için yüzey yüzey davranış

| Yüzey | Eski davranış | Yeni davranış | Değerlendirme |
|---|---|---|---|
| `/arama` kartı (tarihli) | Yanlış düşük toplam gösteriyordu | `total > 0` guard'ı devreye girer → **"…'den başlayan fiyat"** gösterimine döner | Mevcut guard sayesinde **otomatik güvenli**; kod değişmedi |
| `/arama` fiyat sıralaması | Yanlış anahtarla sıralıyordu | `_sortPrice = null` → **listenin sonuna** düşer | Otomatik |
| Admin villa-listesi (curator) | Yanlış toplam | Aynı guard → başlangıç fiyatı | Otomatik |
| Villa detay — rezervasyon özeti | Yanlış toplam gösteriyordu | Özet **gizlenir** + uyarı metni + **CTA kilitli** | Kasıtlı |
| `/rezervasyon/[slug]` formu | Yanlış toplam + gönderilebiliyordu | Uyarı metni + **gönderim kilitli** | Kasıtlı |
| `POST /api/public/reservations` | Yanlış tutarı authoritative yazıyordu | **400** + "Seçilen tarihler için fiyat hesaplanamadı" | Kasıtlı |
| Kısa süreli fırsatlar / paylaşılan liste / özel villa linki | Yanlış toplam | Aynı `total > 0` guard'ı → fiyat gösterilmez | Otomatik |
| **Admin rezervasyon ekle/düzenle** | Yanlış toplam | **0 gösterir, uyarı YOK** | ⚠️ **Bilinçli kapsam dışı** — bkz. §6 |

### 4.1 Mevcut (kayıtlı) rezervasyonlar

**Etkilenmiyorlar.** Rezervasyon tutarları oluşturma anında `reservations` tablosuna **snapshot** olarak yazılıyor (`total_price_try`, `original_price`, `prepayment_amount`, komisyon vb.); motor kayıtlı rezervasyonlar için yeniden çalıştırılmıyor. Liste, detay, voucher ve mail akışları bu snapshot'ları okuyor.

**Tek istisna — ve gerçek bir risk:** Admin bir rezervasyonu açıp **fiyat yeniden hesaplaması** tetiklerse (`computeReservationPriceRecalc.ts:198`, `computeCustomPriceToggle.ts:60`) motor yeniden çalışır. Eğer o rezervasyonun tarih aralığı bugünkü `villa_prices` ile tam kapsanmıyorsa, recalc **0** üretir ve admin bunu farkında olmadan kaydedebilir. Bu, eski kodda da yanlış (düşük) bir değer üretiyordu — ama 0 daha görünür bir bozulma. §6'da ele alınmıştır.

---

## 5. Ölçüm için salt-okunur SQL (ÇALIŞTIRILMADI — size bırakılıyor)

Aşağıdaki sorgular **yalnız SELECT**'tir, hiçbir veri değiştirmez. Kapsama kuralı §3.1'deki motor kuralını **birebir** yansıtır.

### 5.1 Gelecek 12 ayda fiyatsız gecesi olan aktif villalar — ANA SORGU

```sql
WITH horizon AS (
  SELECT generate_series(CURRENT_DATE,
                         CURRENT_DATE + INTERVAL '12 months',
                         INTERVAL '1 day')::date AS d
),
active AS (
  SELECT id, slug, title
  FROM villa
  WHERE is_active = true AND deleted_at IS NULL
)
SELECT a.slug,
       a.title,
       COUNT(h.d)                                    AS ufuk_gun,
       COUNT(h.d) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM villa_prices p
         WHERE p.villa_id  = a.id
           AND p.start_date IS NOT NULL
           AND p.end_date   IS NOT NULL
           AND p.price > 0
           AND h.d BETWEEN p.start_date AND p.end_date
       ))                                            AS fiyatsiz_gun
FROM active a
CROSS JOIN horizon h
GROUP BY a.id, a.slug, a.title
HAVING COUNT(h.d) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM villa_prices p
         WHERE p.villa_id  = a.id
           AND p.start_date IS NOT NULL
           AND p.end_date   IS NOT NULL
           AND p.price > 0
           AND h.d BETWEEN p.start_date AND p.end_date
       )) > 0
ORDER BY fiyatsiz_gun DESC;
```

**Yorumlama:** `fiyatsiz_gun = 366` → villanın gelecek 12 ayda **hiç** fiyatı yok (muhtemelen zaten satılmıyor). Küçük sayılar (1–10) → sezonlar arası boşluk; bunlar **en tehlikeli** kategoriydi, çünkü eski kodda sessizce bedava gece üretiyorlardı.

### 5.2 Bozuk satır şekilleri

```sql
SELECT
  COUNT(*) FILTER (WHERE end_date   IS NULL)        AS end_date_null,
  COUNT(*) FILTER (WHERE start_date IS NULL)        AS start_date_null,
  COUNT(*) FILTER (WHERE price IS NULL OR price <= 0) AS fiyat_sifir_veya_negatif,
  COUNT(*) FILTER (WHERE start_date > end_date)     AS ters_aralik,
  COUNT(*)                                          AS toplam_satir
FROM villa_prices;
```

### 5.3 Eski hatalı matematikle fiyatlanmış olabilecek MEVCUT rezervasyonlar

```sql
SELECT r.id, r.reservation_no, v.slug, r.start_date, r.end_date,
       r.status, r.total_price_try,
       (r.end_date - r.start_date) AS gece,
       (SELECT COUNT(*) FROM generate_series(r.start_date,
                                             r.end_date - 1,
                                             INTERVAL '1 day') g(d)
         WHERE NOT EXISTS (
           SELECT 1 FROM villa_prices p
           WHERE p.villa_id = r.villa_id
             AND p.start_date IS NOT NULL AND p.end_date IS NOT NULL
             AND p.price > 0
             AND g.d::date BETWEEN p.start_date AND p.end_date)
       ) AS fiyatsiz_gece
FROM reservations r
JOIN villa v ON v.id = r.villa_id
WHERE r.status IN ('pending','confirmed')
ORDER BY fiyatsiz_gece DESC, r.start_date;
```

`fiyatsiz_gece > 0` çıkan kayıtlar, eski motorla **eksik** fiyatlanmış olabilir. ⚠️ Bu sorgu geçmişe dönük bir tanıdır; bugünkü `villa_prices` o zamanki halinden farklı olabilir — kesin kanıt değil, **inceleme listesi**dir.

---

## 6. Riskler ve öneriler (uygulanmadı)

| # | Risk | Değerlendirme |
|---|---|---|
| **R1** | **Ciro kesintisi.** Bugün boşluklu villalar o tarihlerde rezerve edilemez hale gelir. | **Deploy öncesi §5.1 mutlaka çalıştırılmalı.** Sonuç boşsa risk sıfırdır ve değişiklik güvenle çıkabilir. Liste doluysa önce veri tamamlanmalı, sonra deploy edilmelidir. Bu, analizimin **1 numaralı tavsiyesi**dir. |
| **R2** | **Admin rezervasyon recalc'ı 0 üretebilir** ve sessizce kaydedilebilir (`computeReservationPriceRecalc.ts`). | Talimat gereği admin tarafına dokunulmadı. En küçük ek önlem: recalc sonucunda `priceAvailable === false` ise kaydı bloklayıp uyarı göstermek. **Ayrı bir karar olarak sunuluyor.** |
| **R3** | **`price = 0` satırı olan villalar** artık bloklanır (§2, madde 12). Eskiden de 0 TL hesaplıyorlardı, yani zaten bozuktular; ama şimdi görünür şekilde kapanırlar. | §5.2 ile tespit edilir. |
| **R4** | **`end_date IS NULL` satırları** sessizce atılır → geniş kapsamsız aralık. | §5.2 ile tespit edilir. Veri düzeltmesi gerektirir. |
| **R5** | Sunucu red mesajı Sentry `ignoreErrors` listesinde değil → Sentry'ye düşer. | Kasıtlı bırakıldı (sıklığı görmek değerli). İstenmezse listeye eklenebilir. |
| **R6** | Fiyat kaydında hâlâ **hiçbir cache invalidation yok** (`pricing.action.ts`). Admin bir boşluğu kapattıktan sonra public taraf 10 dakikaya kadar eski hâli servis edebilir. | Bu düzeltmenin kapsamı dışındaydı; **ayrı bir iş** olarak duruyor ve R1 ile birlikte düşünülmelidir. |

---

## Nihai hüküm

**Tam fiyat tanımlı rezervasyonlarda sonuç değişmiyor — bu ölçülerek kanıtlandı: 257.571 senaryo, iki ayrı saat diliminde, 12 alanın tamamında, 0 fark.**

Davranış yalnızca eski kodun **zaten yanlış sayı ürettiği** 13 durumda değişiyor. Bunların hiçbirinde eski değer doğru değildi; en tehlikelisi olan "aradan birkaç gece eksik" durumunda eski kod sessizce indirim yapıyor (60.000 yerine 70.000 olması gereken tutar), en uçta olan "hiç kapsama yok" durumunda ise 7 gecelik konaklamayı 1 gecelik ücrete düşürüyordu.

**Tek gerçek production riski teknik değil, veriseldir:** bugün boşluklu olan villalar o tarihlerde rezervasyona kapanır. Bu riskin büyüklüğü yalnızca §5.1 sorgusuyla ölçülebilir ve **deploy kararı o sonuca bağlanmalıdır.** Production veritabanına erişimim olmadığı için bu sayıyı ben veremiyorum.
