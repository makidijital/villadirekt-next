# Eski Sağlayıcı (BaaS) İzlerinin Tam Temizliği — Nihai Rapor

**Tarih:** 2026-09-19
**Baz commit:** `3789af2` (`main`)
**Durum:** Çalışma ağacında uygulandı — **commit/push YAPILMADI**

Bu rapor, projede kalan eski yönetilen-PostgreSQL/BaaS sağlayıcısına ait
**tüm** metinsel ve yapısal izlerin kaldırılmasını belgeler. Önceki aşama
(commit `3789af2`) kod ve bağımlılık katmanını temizlemişti; bu aşama
arşivleri, yorumları ve migration geçmişini kapsar.

---

## 1. Kabul kriteri

```
git grep -in <sağlayıcı-adı>
```

**Sonuç:** tüm proje ağacında **1 satır** kalmıştır — `next.config.ts:45`
(bkz. §6, karar bekliyor). Kod, test, dokümantasyon, migration, arşiv ve
yapılandırma dosyalarının tamamı temizdir.

---

## 2. Yapılan işlemler

### 2.1 Dokümantasyon arşivi — silindi

`docs/archive/<sağlayıcı>/` altındaki **31 markdown raporu** kaldırıldı
(~670 satır sağlayıcı referansı). Bunlar geçiş dönemine ait tamamlanmış
audit/plan/runbook belgeleriydi; şema veya çalışma zamanı değeri yok.
İçerikleri git geçmişinde korunmaktadır (`git show 3789af2:docs/archive/...`).

`docs/` altında yalnızca `coolify-scheduled-tasks.md` kaldı.

### 2.2 Migration arşivi — yeniden adlandırıldı ve temizlendi

| Önce | Sonra |
| --- | --- |
| `db/migrations/_archive/<sağlayıcı>/` | `db/migrations/_archive/legacy/` |

`legacy/` altındaki **20 dosyanın** tamamından sağlayıcıya özgü
yetkilendirme katmanına ait tüm DDL ve tüm açıklama metni çıkarıldı:

- `CREATE POLICY` / `DROP POLICY` / `COMMENT ON POLICY`
- `ENABLE/DISABLE ROW LEVEL SECURITY`
- `GRANT` / `REVOKE … TO <sağlayıcı rol adları>`
- `CREATE FUNCTION is_active_admin` (`auth.uid()` bağımlı)
- Rol adlarını ve politika semantiğini anlatan yorum blokları
- `COMMENT ON TABLE/COLUMN` metinlerindeki rol/politika cümleleri

**Korunan:** tüm `CREATE TABLE` / `CREATE INDEX` / `CREATE TRIGGER` /
`CREATE FUNCTION` (RPC) tanımları. Bu dosyalar hâlâ tablo/kolon/fonksiyon
soyağacının tek in-repo kaynağıdır.

### 2.3 Değeri kalmayan migration dosyaları — silindi

Yalnız politika/rol DDL'i içerdiği için içeriği tamamen boşalan dosyalar:

| Dosya | Neden silinebilir |
| --- | --- |
| `049_drop_public_form_anon_insert.sql` | Sadece iki INSERT politikası düşürüyordu |
| `_archive/…/026_pages_rls.sql` | Sadece politika + geçersiz `COMMENT ON` |
| `_archive/…/027_villa_reviews_rls.sql` | Aynı |
| `_archive/…/034_payment_accounts_rls_hardening.sql` | Sadece politika |
| `_archive/…/2026_05_payment_accounts_rls.sql` | Sadece politika |

(Önceki aşamada silinen 5 dosya ile birlikte toplam 10.)

Silinen hiçbir dosyada tablo, index, trigger veya fonksiyon tanımı
kaybolmamıştır — bu makine ile doğrulandı (§4.1).

### 2.4 `db/migrations/_archive/README.md` — yeniden yazıldı

Sağlayıcı adı, rol adları ve politika listesi kaldırıldı; arşivin bugünkü
içeriğini doğru anlatan hâle getirildi.

### 2.5 `.gitignore`

Sağlayıcı CLI artefaktları için konulmuş `<sağlayıcı>/` ignore kuralı ve
açıklama bloğu kaldırıldı (proje o CLI'yi kullanmıyor).

### 2.6 Bozuk satır düzeltmeleri

Önceki aşamadaki otomatik DDL çıkarımı üç dosyada tek harflik artık satır
bırakmıştı — SQL sözdizimini bozacaktı:

| Dosya | Artık |
| --- | --- |
| `_archive/legacy/021_shared_favorite_lists.sql` | `d` |
| `_archive/legacy/035_shared_villa_lists.sql` | `d` |
| `_archive/legacy/043_villa_zip_links.sql` | `g` |

Üçü de kaldırıldı ve tüm SQL ağacı yeniden doğrulandı.

---

## 3. Dokunulmayanlar (kasıtlı)

- **Native PostgreSQL katmanı** — `lib/db/pg.client.ts`,
  `native-db.provider.ts`, `QueryBuilder`, `query-compiler.ts`,
  `pg-array-columns.ts`: hiç değişmedi.
- **R2 / storage** — `lib/storage/s3-storage.provider.ts` ve tüm
  `@aws-sdk/client-s3` yolu: hiç değişmedi.
- **Native auth** — `lib/auth/native/` (jose JWT + Argon2 + TOTP): hiç
  değişmedi.
- **Çalışan migration'lar** — `db/migrations/` altındaki numaralı native
  migration'ların hiçbirinin DDL'i değiştirilmedi. Yalnız yorum metinleri
  (§2.2) ve içeriği boşalan 1 dosya (§2.3) etkilendi.
- **RLS kavramının kendisi** — RLS vanilla PostgreSQL özelliğidir.
  Aktif migration'lardaki "bu projede RLS/rol YOK, yetki uygulama
  katmanında" şeklindeki *native hedefi belgeleyen* açıklamalar
  bilinçli olarak korunmuştur; silinmesi bilgi kaybı olurdu.
- **`types/database.ts`** — aktif type kaynağı; dokunulmadı.
- **Production DB / storage** — hiçbir migration çalıştırılmadı, hiçbir
  veri okunmadı/yazılmadı/silinmedi, hiçbir credential rotate edilmedi,
  `DATABASE_URL` değiştirilmedi.

---

## 4. Doğrulama

### 4.1 Şema kaybı kontrolü (temizlik öncesi/sonrası)

Dollar-quoting farkındalıklı bir SQL statement ayrıştırıcısıyla, temizlik
öncesi ve sonrası tüm `db/migrations/**/*.sql` ağacı karşılaştırıldı:

- Kaldırılan ifade sayısı: **107** (hepsi politika/rol/RLS DDL'i)
- Kaybolan `CREATE TABLE` / `CREATE INDEX` / `CREATE TRIGGER`: **0**
- Kaybolan RPC fonksiyonu: **0**

Uygulama kodunun `.rpc()` ile çağırdığı **18 fonksiyonun tamamı** ve
canlı **14 tablonun tamamı** arşivde hâlâ tanımlıdır.

### 4.2 SQL bütünlüğü

- Statement başlangıç anahtar sözcüğü doğrulaması: gerçek hata **0**
  (kalan uyarılar `''` kaçışlı `COMMENT ON` metinlerinden gelen bilinen
  ayrıştırıcı yanlış-pozitifleri).
- Tek tırnak dengesi: **0 dosyada** dengesizlik.

### 4.3 Araç zinciri

| Adım | Sonuç |
| --- | --- |
| `npx tsc --noEmit` | ✅ **0 hata** |
| `npm run lint` | ✅ **0 error**, 200 warning (baz ile aynı) |
| `npx vitest run` (6 parça, 155 dosya) | **51 failed / 15 dosya** — baz ile **birebir aynı**, regresyon yok |
| `npm run build` | ⚠️ tamamlanamadı — sandbox'tan `fonts.googleapis.com` erişilemiyor (`next/font` Inter/Outfit/Geist Mono fetch hatası). Ortam kısıtı; bu değişikliklerle ilgisi yok. Tip katmanı `tsc --noEmit` ile temiz. |

> Baz çizgi (51 failed / 15 dosya) commit `3789af2` öncesinden beri
> mevcuttur ve tamamı `*OrchestrationContract` / fixture-şekli admin
> testleridir. Bu görevde hiçbir test gevşetilmedi, silinmedi veya
> bypass edilmedi.

### 4.4 Değişiklik hacmi

```
103 files changed, 190 insertions(+), 11463 deletions(-)
41 deleted · 41 modified · 20 renamed+modified
```

---

## 5. Git durumu

```
HEAD    3789af2  (main)
commit  YAPILMADI
push    YAPILMADI
branch  değiştirilmedi · stash YOK
```

---

## 6. ⚠️ KARAR BEKLEYEN TEK KALEM — `next.config.ts:45`

```ts
const LEGACY_ASSET_HOST = "**.<sağlayıcı>.co";
```

**Neden hâlâ duruyor:** bu satır `next/image` için bir *remote pattern*
tanımıdır ve **veri bağımlıdır, kod bağımlı değildir**.

- `resolveAssetUrl()` (`lib/storage.helpers.ts:189`) `^https?://` ile
  başlayan her değeri **olduğu gibi** döndürür.
- `parseVillaStorageUrl()` (`lib/villa-image.helpers.ts:316`) hâlâ
  `/object/public/` yolunu aktif olarak ayrıştırır.

Yani DB'deki şu alanlardan **herhangi biri** hâlâ eski sağlayıcının tam
URL'ini tutuyorsa, bu blok silindiğinde `next/image` o satırlar için
**hard error** verir (kırık görsel değil, runtime hatası):

`villa_images.image_url` · `settings.site_logo` / `favicon` /
`default_og_image` / `watermark_logo` · `pages.cover_image` ·
`villa_types.cover_image` · `villa_locations.cover_image`

**Kaldırma prosedürü (3 adım):**

1. **Salt-okuma sayım** (production DB'de, güvenli):

   ```sql
   select 'villa_images'   as t, count(*) from public.villa_images
     where image_url like 'http%://%.<sağlayıcı>.co/%'
   union all select 'settings', count(*) from public.settings
     where coalesce(site_logo,'')||coalesce(favicon,'')
         ||coalesce(default_og_image,'')||coalesce(watermark_logo,'')
         like '%.<sağlayıcı>.co/%'
   union all select 'pages', count(*) from public.pages
     where cover_image like '%.<sağlayıcı>.co/%'
   union all select 'villa_types', count(*) from public.villa_types
     where cover_image like '%.<sağlayıcı>.co/%'
   union all select 'villa_locations', count(*) from public.villa_locations
     where cover_image like '%.<sağlayıcı>.co/%';
   ```

2. Tüm sayımlar **0** ise → `LEGACY_ASSET_HOST` sabitini ve onu kullanan
   `remotePatterns` girdisini sil (2 blok, ~15 satır).

3. Sayımlar 0 **değilse** → önce bu alanları R2 bucket-relative path'e
   normalize eden bir veri migration'ı çalıştır, sonra 2. adımı uygula.

Bu adım **DB yazması gerektirdiği için** bu görevde bilinçli olarak
yapılmamıştır (kısıt: "production veritabanı verisini riske atma").

---

## 7. Açık güvenlik maddeleri (bu görevde işlem YAPILMADI)

1. **Git geçmişi bir eski PostgreSQL credential'ı içeriyor; rotasyon
   gerekiyor.** (Değer raporlanmadı, ekrana yazılmadı, rotate/revoke
   edilmedi.)
2. **Production `DATABASE_URL` hâlâ eski sağlayıcıya işaret ediyorsa,
   uygulama sağlayıcıdan tamamen kopmuş sayılmaz.** Kod ve repo
   temizdir; asıl kopuş bağlantı dizesinin native PostgreSQL'i
   göstermesiyle tamamlanır.
3. `db/migrations/070_reservation_share_links.sql:49` — `is_active_admin()`
   fonksiyonu hâlâ `auth.uid()` çağırır. Uygulama kodundan **çağrılmaz**;
   dosya "çalışan migration" olduğu için dokunulmadı. Vanilla
   PostgreSQL'de yeniden çalıştırılırsa hata verir → ayrı görevde
   ele alınmalı.

---

## 8. Sonraki adımlar (önerilen sıra)

1. §6 adım 1'deki salt-okuma sorguyu çalıştır → `next.config.ts` kararı.
2. §7.1 credential rotasyonu.
3. §7.2 `DATABASE_URL` doğrulaması.
4. §7.3 `is_active_admin()` temizliği (ayrı migration).
5. Bu çalışma ağacını gözden geçir ve commit et.
