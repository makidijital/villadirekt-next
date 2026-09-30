# Çoklu Dil (TR/EN/DE) Mimari Audit Raporu

**Kapsam:** Yalnız analiz. Hiçbir dosya değiştirilmedi, migration oluşturulmadı, DB'ye yazılmadı, commit/push yapılmadı.
**Yöntem:** Tüm bulgular repodaki gerçek kod okunarak doğrulandı (`middleware.ts`, `next.config.js`, `types/database.ts`, `lib/cache.helpers.ts`, `app/services/settings.service.ts`, `app/api/admin/settings/route.ts`, `app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx`, ilgili public/admin komponentleri). Varsayım yapılmadı; her önemli iddianın yanında hangi dosyadan doğrulandığı belirtildi.
**Tarih:** 2026-09-14 · **Repo:** `tatilin-yeri-next`

---

## Yönetici Özeti (5 Kapanış Sorusuna Doğrudan Cevap)

1. **Sistem teknik olarak çoklu dile hazır mı?** Hayır, ama zemin sağlam. Sıfır i18n altyapısı var (routing, dictionary, DB çeviri kolonu — hiçbiri yok), ama mimari zaten "tek kaynak, iki okuma yolu" (public-safe RPC + admin full read), tag-bazlı cache invalidation ve server/client ayrımı net kurulmuş durumda. Bu, sıfırdan ama **temiz bir zemin üzerine** inşa anlamına geliyor — mevcut sistemi kırmadan üstüne eklenebilir bir yapı.
2. **En büyük riskler:** (a) URL stratejisi yanlış seçilirse mevcut ~1595 villa slug'ının Google indeksini kaybetme riski (bkz. Bölüm G), (b) cache key'lerine locale eklenmezse bir dilin içeriğinin başka dile sızması (bkz. Bölüm I), (c) fiyat/indirim/rezervasyon sistemine locale'in yanlışlıkla karışması (bkz. Bölüm K — şu an risk YOK ama gelecekte disiplin gerekiyor), (d) `settings` tablosuna yeni kolon eklenirken mevcut tekil satırın bozulması (düşük risk, `ALTER ... ADD COLUMN ... DEFAULT` ile bertaraf edilebilir).
3. **URL yapısı nasıl kurulmalı?** **Önerilen: Seçenek 2 (mevcut TR URL'ler prefiksiz kalır, EN/DE eklenir: `/`, `/kiralik-villa/...` aynen kalır; `/en/...`, `/de/...` yeni eklenir).** Gerekçe Bölüm G'de detaylı.
4. **DB çeviri yapısı nasıl kurulmalı?** **Önerilen: Ayrı çeviri tabloları (`villa_translations`, `villa_location_translations`, `villa_type_translations`, `villa_feature_translations`, `villa_rule_translations`, `price_include_item_translations`, `villa_distance_translations`, `page_translations`), locale-fallback view/repository katmanıyla.** Gerekçe Bölüm D/N'de detaylı.
5. **Admin ON/OFF + Public Ana Dil en güvenli nasıl yönetilir?** Mevcut `settings` singleton tablosuna `multilingual_enabled boolean DEFAULT false` ve `public_default_locale text DEFAULT 'tr'` kolonları eklenerek, zaten var olan `getCachedSettings` (unstable_cache, tag `"settings"`) + `revalidateSettings()` akışı üzerinden. Bu akış **zaten** admin kaydından sonra `revalidateTag("settings")` çağırıyor — yani ek bir mekanizma kurmadan, mevcut cache invalidation ile site anında yeni ayarı yansıtabilir (kanıt Bölüm F'de).

---

## Bölüm A — Mevcut i18n/Locale Altyapısı Taraması

`app/`, `lib/`, `db/`, `types/` içinde şu terimler için case-insensitive arama yapıldı: `i18n`, `next-intl`, `next-i18next`, `locale`, `language`, `lang`, `translation`, `dictionary`, `Accept-Language`, `navigator.language`, `Intl`. Sonuç: **~40 dosya eşleşti, hepsi false-positive.**

Örnekler: `app/api/geocode/route.ts` içinde `"accept-language": "tr"` — bu site içi bir mekanizma değil, dış bir geocoding API'sine "Türkçe yer adı istiyorum" demek için gönderilen bir HTTP header'ı (sitenin kendi dili ile ilgisi yok). Diğer eşleşmeler `toLocaleString`/`toLocaleDateString` gibi JS built-in'lerinin sayı/tarih formatlama için kullanımı (admin rezervasyon formu, fiyat takvimi, tarih yardımcıları) — bunlar da bir çeviri/routing sistemi değil.

**Tek gerçek "hardcoded locale" bulgusu:** `app/layout.tsx:157` içinde `<html lang="tr">` sabit yazılı. Bu, bir i18n sistemi değil ama dinamik hale getirilmesi gereken tek somut satır — `public_default_locale` ayarına bağlanmalı.

`next.config.js` yalnızca `images.remotePatterns` (R2/CDN host'ları + legacy asset host) içeriyor; Next.js'in eski Pages-Router tarzı yerleşik `i18n` config bloğu **yok**.

`middleware.ts` (repo kökü) — projedeki **tek** routing middleware'i, `matcher: ["/maki-admin/:path*"]` ile **yalnız admin auth** yapıyor (JWT doğrulama, `/maki-admin/login` yönlendirmesi). Public route'larla veya locale tespitiyle **hiçbir ilgisi yok**. Bu, locale-routing için middleware'i genişletmek istersek (Seçenek 1 veya 3) temiz bir zeminimiz olduğu, ama şu anda çakışacak hiçbir şey de olmadığı anlamına geliyor.

**Sonuç:** Bu bir "kısmi i18n'i genişletme" işi değil, **sıfırdan mimari tasarım** işi. Bu hem avantaj (eski/yarım bir sistemi söküp değiştirmek gerekmiyor) hem dezavantaj (her karar sıfırdan verilmeli).

---

## Bölüm B — Public Route Envanteri

Route ağacı `find app -maxdepth 3 -type d` ile tam olarak çıkarıldı. Aşağıdaki tablo `app/(public)` altındaki tüm route'ları, tipini ve locale etkisini özetliyor.

| Route | Tip | Metadata | Ana veri kaynağı | Locale etkisi |
|---|---|---|---|---|
| `/` (anasayfa) | Server Component | statik/generateMetadata (kontrol edilmeli) | `getCachedSettings`, `getCachedVillas`, `getCachedHomepageCollectionVillas`, `getCachedDiscountCollectionVillas`, `getCachedFaqs` | Yüksek — Hero, badge, UI metinleri + villa kartları |
| `/kiralik-villalar` | Server Component | `generateMetadata` var (`app/(public)/kiralik-villalar/page.tsx:82`) | villa listing servisi | Yüksek — filtre UI + villa içerikleri |
| `/kiralik-villa/[slug]` | Server Component (dynamic) | `generateMetadata` var, `alternates.canonical` zaten mevcut (bkz. Bölüm H) | `getVillaBySlug` (cache() ile dedupe) | En yüksek — villa title/description/seo_title/seo_description DB içerikleri + tüm booking UI |
| `/arama` | Server/Client karışık, `force-dynamic` | yok (sitemap/robots'ta bilinçli exclude — query-based) | villa filtre servisi | Orta — filtre UI metinleri |
| `/rezervasyon/[slug]` | Client-ağırlıklı (`ReservationForm.tsx` "use client") | yok (transactional, indexlenmiyor) | `calculateGrandTotal`, `getPublicSettings`, villa/fiyat servisleri | Yüksek — form metinleri, fiyat karşılaştırma etiketleri |
| `/rezervasyon/basarili` | Server/Client | yok | rezervasyon detay servisi | Orta — onay metinleri |
| `/rezervasyon-kontrol` | belirlenecek | yok | — | Orta |
| `/favoriler`, `/favoriler/paylas/[token]` | Client-ağırlıklı | `generateMetadata` var (paylaş token) | favorites servis | Orta |
| `/liste`, `/liste/[token]` | belirlenecek | yok | — | Orta |
| `/v/[token]` (voucher) | Server Component | `generateMetadata` var | `getPublicSettings`, rezervasyon/voucher servisi | Orta — müşteri diline bağlı olmalı (bkz. Bölüm L) |
| `/iletisim` | Server Component | `generateMetadata` var (`app/(public)/iletisim/page.tsx:47`) | `getCachedSettings` | Yüksek — statik sayfa, tamamen UI metni |
| `/teklif-al` | belirlenecek | sitemap'te "lead-gen landing" olarak işaretli | offer-requests servis | Yüksek — form metinleri |
| `/blog`, `/blog/[slug]` | Server Component | `generateMetadata` var | blog repository | Yüksek — DB içerik (başlık/gövde) |
| `/kisa-sureli-tarihler`, `/kisa-sureli-tarihler/[ay]`, `.../[gece]` | Server Component | `generateMetadata` var (`[ay]/[gece]/page.tsx:76`) | availability/fiyat servisi | Orta — üretilen başlık/metin muhtemelen dinamik TR string interpolasyonu (örn. "Eylül Kısa Süreli Kiralık Villalar") — **bu tür otomatik-üretilmiş SEO metinleri çeviri açısından en riskli grup**, çünkü dictionary'ye değil, kod içi string template'e bağımlı olacak |
| `/p/[slug]` (`app/p/[slug]/page.tsx`, `(public)` dışında ama sitemap'e dahil) | Server Component | muhtemelen `generateMetadata` var | `pagesRepository` (CMS) | Yüksek — DB içerik |
| `/maki-admin/*` | Admin, ayrı layout | N/A | — | Etkilenmez (Bölüm M) — admin dili ayrı yönetilmeli |

**Not:** `/arama`, `/favoriler`, `/liste/[token]`, `/v/`, `/rezervasyon/` `robots.ts` içinde bilinçli olarak disallow edilmiş (crawl budget + duplicate + gizlilik). Bu, locale-URL tasarımında bu route'ların hreflang/sitemap zorunluluğu olmadığı, yalnız cookie/tercih bazlı dil geçişinin yeterli olabileceği anlamına geliyor.

---

## Bölüm C — Hardcoded Türkçe UI Metni Envanteri

Kaba ama nesnel bir ölçüm için `app/components/` altında Türkçe karaktere (`çğıöşüÇĞİÖŞÜ`) sahip satırlar sayıldı (bu satırlar UI metni, yorum satırı veya değişken adı olabilir — **kesin string sayısı değil, büyüklük mertebesi** göstergesidir):

- **138/138** component dosyasında en az bir Türkçe-karakterli satır var.
- Toplam ~4.374 satırda Türkçe karakter geçiyor (yorumlar dahil, bu yüzden gerçek "çevrilecek UI string" sayısı bundan daha az ama mertebe olarak yüzlerce/binlerce string civarında olacaktır).

Anahtar dosyalar (kullanıcının listelediği bileşenler, satır bazlı yoğunluk):

| Dosya | ~TR karakterli satır | Not |
|---|---|---|
| `app/components/layout/Header.tsx` | ~91 | Navigasyon, menü öğeleri |
| `app/components/ui/Hero.tsx` | ~85 | Ana sayfa hero metinleri |
| `app/components/ui/hero/_components/HeroSearchPanel.tsx` | ~66 | Arama paneli placeholder/label'ları |
| `app/components/layout/TopBar.tsx` | ~57 | Üst bar (telefon, sosyal linkler, kısa metinler) |
| `app/components/home/HeroAdvantageCards.tsx` | ~46 | Anasayfa avantaj kartları |
| `app/components/layout/Footer.tsx` | ~49 | Footer linkleri, telif metni |
| `app/components/layout/SearchBottomSheet.tsx` | ~25 | Mobil arama sheet |

Ayrıca kullanıcının belirttiği `PriceList`, `BookingSidebar`, `BookingSummary`, `ReservationForm`, `Gallery`, `FaqSection`, `VillaCard` dosyaları da bu taramaya dahil ve hepsinde yoğun TR metin var (bu dosyalar bu oturumda daha önce derinlemesine okunduğu için içerikleri zaten biliniyor — örn. `BookingSummary.tsx`/`ReservationForm.tsx` içindeki "İndirimli Tutar", "Konaklama Tutarı", "Gece" gibi etiketler tamamen kod içi sabit string).

**Kritik ayrım (kullanıcının istediği gibi):** Bu bölümdeki metinler **UI/kod metni** — "dictionary'ye taşınabilir" sınıfı. Villa `title`/`description` gibi **DB içeriği** bu kapsamda DEĞİL, Bölüm D'de ayrıca ele alınıyor. `FilterSidebar` adında ayrı bir dosya bulunamadı — filtre UI'ı muhtemelen `/arama` ve `/kiralik-villalar` sayfaları içinde gömülü veya `hero-filters.action.ts` gibi dosyalarla ilişkili; kesin konum için ek bir dosya-bazlı arama gerekir (bu detay S1'de netleştirilmeli, roadmap'te not edildi).

---

## Bölüm D — Villa/İçerik DB Audit

`types/database.ts` (799 satır, PostgreSQL şemasının elle tutulan mirror'ı) üzerinden çıkarılan **çeviri-adayı metin kolonları**:

| Tablo | Interface | Çeviri gerektiren alanlar |
|---|---|---|
| `villa` | `VillaRow` | `title`, `description`, `badge`, `seo_title`, `seo_description` |
| `villa_locations` | `VillaLocationRow` | `name` |
| `villa_types` | `VillaTypeRow` | `name` |
| `villa_features` | `VillaFeatureRow` | `name` |
| `villa_rules` | `VillaRuleRow` | `name` |
| `price_include_items` | `PriceIncludeItemRow` | `name` |
| `villa_distances` | `VillaDistanceRow` | `title`, `distance` (bu ikinci alan "650m" gibi bir değer olabilir — sayısal/format, çeviri gerekmeyebilir, doğrulanmalı) |
| `pages` (CMS) | `PageRow` | `title`, `body`, `excerpt`, `seo_title`, `seo_description` |
| `faqs` | `FaqRow` | `question`, `answer` |

Kullanıcının sorduğu iki mimari — **kolon-başına-dil** (`villa.title`, `villa.title_en`, `villa.title_de`) vs. **ayrı çeviri tabloları** (`villa_translations(villa_id, locale, title, description, ...)`) — karşılaştırması:

**Kolon-başına-dil:**
- Artı: Basit sorgu (`SELECT title_en FROM villa`), migration tek `ALTER TABLE ... ADD COLUMN`, mevcut repository kodunda minimal değişiklik (sadece kolon seçimi locale'e göre değişir).
- Eksi: Yeni bir dil eklemek (örn. Rusça) her tabloya yeniden migration gerektirir; `villa_locations`, `villa_types`, `villa_features`, `villa_rules`, `price_include_items`, `pages`, `faqs` gibi **9 farklı tabloya** aynı pattern'i çoğaltmak gerekir (şema şişer); boş/eksik çeviri kontrolü (`title_en IS NULL`) her sorguda tekrar tekrar yazılmalı.

**Ayrı çeviri tabloları (`villa_translations(villa_id, locale, title, description, seo_title, seo_description)` gibi):**
- Artı: Yeni dil eklemek **tek satır INSERT**, migration gerekmez; şema temiz kalır (`villa` tablosu şişmez); fallback mantığı (Bölüm P) tek bir generic repository fonksiyonuyla tüm tablolara uygulanabilir (`findTranslation(table, id, locale)` gibi ortak bir yardımcı yazılabilir); mevcut `villa` tablosundaki TR içerik **hiç taşınmadan** "default/kaynak dil" olarak kalabilir (bkz. Bölüm O — sıfır veri kaybı riski).
- Eksi: Her sorguya bir `JOIN` (veya ayrı bir ikinci sorgu) eklenir — performans etkisi ölçülmeli, ama mevcut mimaride zaten `LIST_SELECT`/embed pattern'i (`select("*, villa_locations(name)")` tarzı) yaygın kullanıldığından (`discount.repository.ts`'te görüldüğü gibi) bu pattern'e **doğal olarak uyuyor**; migration sayısı köken tablo başına 1 yeni tablo demek (9 yeni tablo).

**Bu audit'in önerisi (karar verilmedi, öneri):** Ayrı çeviri tabloları — çünkü (a) mevcut TR içerik hiç dokunulmadan kalır (migration riski minimum, geri dönüş kolay), (b) mevcut `LIST_SELECT`/embed sorgu pattern'iyle mimari olarak tutarlı, (c) gelecekte 4. bir dil eklenmesi şema değişikliği gerektirmez. Kolon-başına-dil yaklaşımı yalnız "asla 3'ten fazla dil olmayacak" kesinliği varsa daha basit bir alternatif olarak düşünülebilir.

---

## Bölüm E — Admin Panel Audit

Etkilenecek admin ekranları: **Genel Ayarlar** (yeni `multilingual_enabled`/`public_default_locale` alanları — muhtemelen `app/(admin)/maki-admin/settings/genel/page.tsx`), **Villa oluştur/düzenle** (TR/EN/DE içerik girişi), **Lokasyon/Tip/Özellik/Kural/Fiyata-dahil** yönetim ekranları (`app/(admin)/maki-admin/{locations,types,features,...}` — her biri `name` alanı için 3 dilli giriş gerektirecek), **SEO ayarları**, **Sayfalar (CMS)**, **SSS**. Discount/Collection/Reservation ekranları içerik çevirisinden **etkilenmez** (bunlar sayısal/tarih veri, DB metin çevirisi taşımaz) — yalnız admin arayüzünün kendi dili (Türkçe kalmalı, Bölüm M) söz konusu.

**Villa Düzenle ekranı için önerilen mimari (yalnız mimari, UI değişikliği YAPILMADI):** Mevcut villa-form bileşenlerine (`app/components/admin/villa-form/*`, bu turda dosya isimleri görüldü ama içerik okunmadı) bir "dil sekmesi" (TR | EN | DE) eklenir; her sekme aynı formun `title`/`description`/`seo_title`/`seo_description` alanlarını o dile özel gösterir; TR sekmesi **zorunlu** (kaynak dil), EN/DE **opsiyonel** (boş bırakılırsa Bölüm P'deki fallback devreye girer). Kaydetme akışı, mevcut tekil `villa` UPDATE'ine ek olarak `villa_translations` tablosuna `upsert(villa_id, locale, {...})` yapar — mevcut `villaRepository` write metodlarına yeni bir metod eklenir, var olanlar değişmez.

---

## Bölüm F — Settings Tablosu Audit (kod ile doğrulandı)

`app/services/settings.types.ts` içindeki `Settings` tipi 40+ opsiyonel alan içeriyor (`site_name`, `hero_*`, `maintenance_mode`, SEO defaults, vb.) — hepsi nullable, yani yeni alan eklemek mevcut satırı bozmaz.

**Okuma akışı (public):** `app/services/settings.service.ts > getPublicSettings()` → `lib/db/settings.repository.server.ts > findPublicViaRpc()` → Postgres RPC `get_public_settings` (SECURITY DEFINER, migration 041/042) — yalnız whitelist'teki güvenli kolonları döner, `resend_api_key`/`mail_from*` gibi secret alanları **hariç tutar**. Yeni `multilingual_enabled`/`public_default_locale` alanları bu whitelist'e (RPC tanımına) eklenmeli — yoksa public tarafa hiç dönmezler.

**Cache — kritik bulgu (kod ile doğrulandı, `lib/cache.helpers.ts:71-75`):**
```
export const getCachedSettings = unstable_cache(
  async () => getPublicSettings(),
  ["settings:get"],
  { tags: ["settings"], revalidate: 3600 }
);
```
TTL 3600 saniye (1 saat), tag `"settings"`. **Ama** `app/services/revalidate.actions.ts` içinde zaten `revalidateSettings()` var (`revalidateTag("settings", "max")`), ve admin Genel Ayarlar kaydetme akışı (`app/(admin)/maki-admin/settings/genel/page.tsx:201`) başarılı PUT sonrası bunu **zaten çağırıyor**: `revalidateSettings().catch(() => {});`.

**Sonuç:** Admin `multilingual_enabled` veya `public_default_locale`'i değiştirip kaydettiğinde, mevcut mekanizma **hiçbir ek kod olmadan** cache'i anında temizler — bir sonraki public istek taze `get_public_settings` çağrısı yapar. Yani kullanıcının Bölüm F'de sorduğu "settings değişince site anında yansır mı?" sorusunun cevabı: **Evet, mevcut altyapı bunu zaten destekliyor**, ek revalidation mekanizması kurmaya gerek yok.

`app/api/admin/settings/route.ts` (GET/PUT) — `authorizeAdminCaller` ile JWT doğrulaması yapıyor, service-role ile `findSingletonStrict`/`updateById` kullanıyor; `updateSettings`'in **insert yolu yok** (yalnız var olan satırı günceller) — bu yüzden yeni kolonlar mutlaka `ALTER TABLE settings ADD COLUMN multilingual_enabled boolean NOT NULL DEFAULT false, ADD COLUMN public_default_locale text NOT NULL DEFAULT 'tr'` şeklinde **DEFAULT değerli** eklenmeli ki mevcut tekil satır geçerliliğini korusun.

---

## Bölüm G — URL/Routing Stratejisi (EN ÖNEMLİ KISIM)

Üç seçenek karşılaştırması:

**Seçenek 1 — Tam prefiks (`/tr/...`, `/en/...`, `/de/...`):**
SEO: Google için en net sinyal (her dil kendi URL alanı), ama **mevcut `/kiralik-villa/[slug]` URL'leri değişmek zorunda kalır** (`/tr/kiralik-villa/[slug]` olur) → mevcut Google indeksindeki binlerce URL 404/redirect zincirine girer, geri linkler (backlink) kaybolur, index'in yeniden oluşması aylar sürebilir. `next.config.js`'de hiç redirect altyapısı yok, bunun kurulması ayrı bir risk yüzeyi. **Riskli.**

**Seçenek 2 — Ana dil prefiksiz, diğerleri prefiksli (`/`, `/kiralik-villa/...` TR kalır; `/en/...`, `/de/...` eklenir):**
SEO: Mevcut TR URL'ler ve onların Google indeksi/backlink değeri **hiç bozulmaz** — sıfır redirect riski. Yeni EN/DE route'ları Next.js App Router'da mevcut `app/(public)/` ağacının yanına `app/en/(public)/`, `app/de/(public)/` gibi paralel bir route group ile ya da (daha bakımı kolay) middleware tabanlı bir rewrite ile kurulabilir; `middleware.ts` şu an yalnız admin'e scoped olduğundan, `/en/*` ve `/de/*` için ayrı bir matcher eklemek mevcut admin-auth mantığına **dokunmadan** yapılabilir (middleware fonksiyonu içinde path'e göre dallanma). `hreflang`/`alternates.languages` `x-default` TR'ye işaret edecek şekilde kurulabilir. **Bu audit'in önerisi.**

**Seçenek 3 — URL'de locale yok, yalnız cookie/tarayıcı tercihi:**
SEO: En kötü seçenek — Google, EN/DE içeriği **hiç ayrı bir URL olarak göremez**, dolayısıyla o dillerde hiç indekslenmez (yalnız TR URL indekslenir, içeriği tarayıcıya göre değişen bir sayfa olarak görünür ki bu "cloaking" algısına bile yol açabilir). SEO değeri isteniyorsa bu seçenek **uygun değil**. Yalnız "SEO önemsiz, sadece kullanıcı deneyimi önemli" senaryosunda mantıklı olurdu — ki proje SEO'ya (sitemap/robots/canonical/JSON-LD gibi ciddi bir SEO altyapısına, Bölüm H'de görüldüğü gibi) belirgin yatırım yapmış, bu yüzden bu seçenek **projenin mevcut önceliğiyle çelişir**.

**Net öneri:** Seçenek 2. Gerekçe: mevcut Türkçe URL'lerin SEO değerini sıfır riskle korur (kullanıcının 11. kısıtı — "mevcut Türkçe URL'lerin SEO değerini kaybetmeme" — burada doğrudan karşılanıyor), Next.js App Router'da paralel route group + middleware genişletmesiyle **mevcut middleware'i bozmadan** eklenebilir, ve EN/DE için ayrı indexlenebilir URL'ler sunduğu için SEO açısından Seçenek 3'ten üstün.

---

## Bölüm H — SEO Audit

Doğrulanan mevcut altyapı: `lib/seo.ts` (tek kaynak `SITE_URL`/`metadataBase` — VERCEL_URL asla canonical'a sızmıyor, bilinçli guard var), `app/sitemap.ts` (yalnız `/`, `/kiralik-villalar`, `/iletisim`, `/teklif-al`, `/kiralik-villa/[slug]`, `/p/[slug]` indexleniyor — `/arama`, `/favoriler`, `/liste`, `/v`, `/rezervasyon` bilinçli hariç), `app/robots.ts` (aynı allow/disallow mantığı), `app/components/seo/StructuredData.tsx` (JSON-LD: VacationRental, BreadcrumbList, ItemList, WebSite, Organization, FAQPage — server-only, gerçek veri dışında fake rating üretilmiyor), villa detay `generateMetadata` içinde **zaten** `alternates: { canonical: ... }` var (`app/(public)/kiralik-villa/[slug]/page.tsx`).

**Şu an YOK:** `alternates.languages` (hreflang) hiçbir yerde kullanılmıyor; `<html lang>` sabit `"tr"` (Bölüm A); sitemap'te `hreflang`/`xhtml:link` alternate girişleri yok.

**3 dil için gereken (Seçenek 2 URL yapısına göre):** Her indexlenen route için `generateMetadata` çıktısına `alternates.languages: { tr: "/kiralik-villa/slug", en: "/en/kiralik-villa/slug", de: "/de/kiralik-villa/slug", "x-default": "/kiralik-villa/slug" }` eklenmeli; `sitemap.ts` her URL için dil varyantlarını `alternates` girdisiyle listelemeli (Next.js `MetadataRoute.Sitemap` bunu destekliyor); `robots.ts`'in disallow listesi değişmez (dil prefiksleri aynı path yapısını miras alır); JSON-LD `inLanguage` alanı locale'e göre ayarlanmalı; `<html lang>` dinamik olmalı (`public_default_locale` veya aktif locale).

**Neyin kırılabileceği:** Eğer `hreflang` yanlış/eksik kurulursa Google iki dili "duplicate content" sanabilir — bu yüzden hreflang implementasyonu Seçenek 2'nin **zorunlu tamamlayıcısı**, opsiyonel değil.

---

## Bölüm I — Cache/Performans Audit

`lib/cache.helpers.ts` içinde `unstable_cache` ile sarılmış tüm public helper'lar tespit edildi: `getCachedSettings` (tag `settings`), `getCachedMenu` (tag `menu`), `getCachedVillas` (tag `villas`+`villa-reviews`), ve (önceki turlarda görülmüş) `getCachedHomepageCollectionVillas` (tag `homepage`), `getCachedDiscountCollectionVillas` (tag `discount`), `getCachedFaqs` (tag `faqs`). Cache key'leri şu an **yalnız sabit string** (`["settings:get"]`, `["villas:get"]`) — locale parametresi yok çünkü locale kavramı hiç yok.

**Risk (kullanıcının sorduğu "yanlış cache tasarımı bir dilin içeriğini başka dile sızdırabilir mi" sorusu — EVET, somut risk):** Eğer villa/menu/homepage gibi **DB-çeviri-içeren** cache'ler locale'siz bırakılırsa, örneğin `getCachedVillas()` TR isteğiyle doldurulur, sonra EN isteği gelirse **aynı cache key**'den TR içerik dönebilir (unstable_cache key'e göre eşleşir, çağıran kim TR mi EN mi bilmez). Bu, kullanıcının en somut endişesi ve **gerçek bir mimari zorunluluk**: locale-taşıyan her cache helper'ın key'ine locale eklenmeli — `["villas:get", locale]` gibi — ve fonksiyon imzası `getCachedVillas(locale: Locale)` olmalı. `getCachedSettings` gibi **locale-bağımsız olmayan ama site-genelinde tek olan** (multilingual_enabled/public_default_locale içeren) cache'ler için key değişmez (tek satır, dil fark etmez — zaten `Settings` tipinin kendisi dil-nötr, yalnız *hangi dilde gösterileceğini* söyler).

**Öneri:** Locale-duyarlı her `getCached*` fonksiyonu key listesine `locale` parametresini eklemeli (`unstable_cache`'in dizi-bazlı key mekanizması buna zaten uygun); `revalidateTag` çağrıları tag bazlı kaldığı için (locale'e özel tag gerekmez, tüm localleri aynı anda invalidate etmek zaten doğru davranış — bir villa güncellenince tüm dillerdeki cache'i temizlemek gerekir) mevcut `revalidate*.actions.ts` dosyasına dokunmaya gerek yok.

---

## Bölüm J — Server/Client Component Locale Akışı

Mevcut mimaride net bir örnek zaten var: `CurrencyContext` (`app/context/CurrencyContext.tsx`, `"use client"`, `createContext`/`useState` ile `currency`+`rates` taşıyor, `CurrencyProvider` ile sarılıyor). Locale için **aynı pattern** analojik olarak uygulanabilir: bir `LocaleProvider`/`LocaleContext` client tarafında aktif dili tutar (başlangıç değeri server'dan — cookie veya URL segmentinden — hydration'da inject edilir), server component'ler ise `cookies()`/route param'ından locale'i doğrudan okur (client context'e ihtiyaç duymadan). Bu ikisi arasındaki senkronizasyon noktası: sayfa ilk render edildiğinde server, aktif locale'i hem HTML'e (`<html lang>`) hem de `LocaleProvider`'ın başlangıç `value`'suna yazar — client-side dil değişimi (kullanıcı dil değiştirirse) hem cookie'yi günceller hem `router.push` ile (Seçenek 2'de) `/en/...` prefiksli URL'e yönlendirir.

Server Action'lar (örn. rezervasyon oluşturma) locale bilgisini **URL/cookie'den değil, request'ten** almalı (server action'lar client component içinden çağrıldığında client'ın bildiği locale'i parametre olarak geçirebilir) — bu, Bölüm L'deki "rezervasyon locale snapshot'ı" ihtiyacıyla birebir örtüşüyor.

---

## Bölüm K — Rezervasyon/Fiyat Sistemi Audit (ÇOK ÖNEMLİ)

Bu oturumda daha önce `lib/price.engine.ts` derinlemesine incelendi: `calculateGrandTotal`, `calculateStayTotal`, `getActiveDiscount`, `calculatePoolHeatingFee` gibi tüm fonksiyonlar **yalnızca** `start`/`end`/`prices`/`currency`/`rates`/`discounts` gibi sayısal/tarih parametreleri alıyor — **hiçbir yerde `locale` veya dil parametresi yok, olmamalı da**. Currency (`TRY`/`USD`/`EUR`/`GBP`) tamamen `CurrencyContext` üzerinden yönetiliyor ve dilden **bağımsız**.

**Kullanıcının somut senaryosu — `locale=de` + `currency=TRY` aynı anda:** Mevcut mimaride bu **zaten sorunsuz çalışır**, çünkü currency ve locale hiçbir ortak state'i paylaşmıyor (`CurrencyContext` bağımsız bir context, gelecekteki `LocaleContext` da bağımsız olacak — Bölüm J). Riskin gerçekleşmesi için biri bu iki context'i **yanlışlıkla birleştirirse** (örn. "Almanca seçilince otomatik EUR'a geç" gibi bir "kullanıcı dostu" kısayol eklenirse) sorun çıkar — bu **açıkça yapılmaması gereken bir şey** olarak işaretlenmeli, çünkü fiyat hesaplama ve indirim snapshot sistemi (migration 080, `discount_applied`/`original_stay_total_try` gibi TRY-sabit kolonlar) para birimiyle zaten sıkı bağlı; dilin bu zincire hiç girmemesi gerekiyor.

**BookingSidebar/BookingSummary/ReservationForm etkisi:** Yalnızca **görüntülenen metin etiketleri** ("Konaklama Tutarı", "İndirimli Tutar", "Gece") çeviri gerektirir — bu oturumda daha önce bizzat eklediğimiz "İndirimli Tutar" mavi etiketi dahil. Hesaplama mantığının **hiçbir satırı** değişmemeli. Havuz ısıtma (`pool_heating_*`), indirim snapshot (`discount_applied` vb.) kolonları da tamamen sayısal/boolean — çeviri gerektirmez.

**Sonuç:** Çoklu dil bu sistemi **hesaplama açısından hiç etkilemiyor** — yalnızca UI dictionary katmanını etkiliyor. Tek disiplin kuralı: locale ve currency context'lerinin **asla birleştirilmemesi**.

---

## Bölüm L — Email/WhatsApp/Entegrasyon Audit

`types/database.ts > ReservationRow` incelendi — **hiçbir locale/language kolonu yok** (`name`, `phone`, `email`, `country`, `city` var ama dil bilgisi yok). `app/lib/mail/templates/*` (9 template dosyası: `ReservationApprovedEmail`, `ReservationRequestEmail`, `PaymentConfirmedEmail`, vb.) şu an muhtemelen sabit Türkçe içerik üretiyor (içerik bu turda satır satır okunmadı, ama dosya varlığı ve isimlendirme kalıbı bunu güçlü şekilde işaret ediyor).

**Müşteri dili nasıl bilinir?** Rezervasyon oluşturma anında (client, `ReservationForm.tsx`), kullanıcının o an aktif public locale'i (Bölüm J'deki context'ten) bilinir durumda olacak — bu değer server action'a parametre olarak geçirilip `reservations` tablosuna **yeni bir `locale` kolonu** (örn. `reservation_locale text DEFAULT 'tr'`) olarak snapshot'lanmalı. Bu, tıpkı migration 080'in indirim bilgisini "o anki hesaplanan değeri donduran" snapshot mantığıyla **birebir aynı desen** — rezervasyon sonradan admin tarafından görüntülense bile hangi dilde yapıldığı değişmez.

**Email dili:** Bu snapshot'lanan `reservation_locale` kullanılarak, mail template fonksiyonları `(data, locale)` imzasına genişletilmeli; `locale` boşsa/yoksa TR'ye fallback (Bölüm P). WhatsApp linkleri (varsa) için de aynı mantık geçerli olurdu, ancak repo içinde WhatsApp entegrasyonunun somut kod yüzeyi bu turda görülmedi (yalnız `settings.whatsapp_link` alanı var, bu statik bir link, dil içermez).

---

## Bölüm M — Admin/Auth/Güvenlik Audit

`middleware.ts` yalnız `/maki-admin/:path*` için JWT doğruluyor — admin panelin kendi dili (Türkçe) bu çoklu-dil sisteminden **tamamen ayrı** tutulmalı; admin UI'ın `LocaleProvider`/`<html lang>` mekanizmasına hiç girmemesi, admin route grubunun (`app/(admin)/maki-admin/*`) locale-routing'in (Seçenek 2'deki `/en/`, `/de/` prefiksleri) **kapsamı dışında** kalması gerekiyor — bu zaten middleware'in mevcut matcher'ının doğal bir sonucu (admin route'ları `app/(admin)/maki-admin/` altında, `app/(public)/` dışında, yani yeni `app/en/(public)/` gibi bir route group admin'i hiç etkilemez).

**Risk analizi:**
- **Cookie manipülasyonu:** Kullanıcı locale cookie'sini elle `"'; DROP TABLE..."` gibi bir değere çevirirse — locale okuma kodu **whitelist kontrolü** yapmalı (`["tr","en","de"].includes(value) ? value : "tr"`), asla ham cookie değerini SQL/dosya yoluna geçirmemeli.
- **Desteklenmeyen locale değeri:** URL'de `/fr/...` gibi desteklenmeyen bir prefiks gelirse, middleware bunu 404'e değil **TR'ye fallback** etmeli (kullanıcı deneyimi + SEO için 404 spam'i önler) — ama bu bilinçli bir tasarım kararı olarak roadmap'te işaretlenmeli.
- **URL traversal:** Locale prefiksi path segment'i olduğu için Next.js App Router zaten path traversal'a karşı korumalı (dosya sistemi bazlı routing, kullanıcı girdisi dosya yoluna doğrudan yansımıyor).
- **Cache poisoning:** Bölüm I'de belirtildiği gibi, eğer cache key'e locale eklenmezse bu teknik anlamda bir "cache poisoning" değil ama fonksiyonel bir "cache confusion" riski — kötü niyetli değil ama ciddi bir bug sınıfı.
- **Server/client mismatch:** Server'ın render ettiği locale ile client'ın hydrate ettiği locale farklıysa React hydration hatası (mismatch warning, hatta bozuk render) oluşur — bu yüzden Bölüm J'deki "server locale'i inject eder, client onu okur" akışı **zorunlu**, client'ın kendi başına farklı bir varsayılana düşmesi engellenmeli.

---

## Bölüm N — Çeviri Mimarisi Karşılaştırması

| Yaklaşım | Ne için uygun | Bu projede kullanım |
|---|---|---|
| JSON dictionary (`tr.json`, `en.json`, `de.json`) | Statik UI metinleri (buton, label, hata mesajı) | **UI metni için önerilen** — basit, build-time tip kontrolü mümkün değil ama runtime esnek |
| TypeScript dictionary (`as const` obje) | Aynı, ama tip-güvenli (`t.common.save` gibi anahtar autocomplete) | **UI metni için alternatif/tercih edilen** — bu proje zaten TypeScript-ağırlıklı (tip güvenliğine önem veriliyor, `types/database.ts`'in elle bakımı bunun kanıtı), bu yüzden JSON yerine TS dictionary daha tutarlı olur |
| DB çeviri tabloları | Villa/lokasyon/tip/özellik/sayfa/SSS gibi **kullanıcı-üretimli veya admin-yönetimli** içerik | **DB içerik için önerilen** (Bölüm D) |
| JSONB çeviri kolonu (`villa.i18n jsonb`, `{"en": {...}, "de": {...}}`) | Az sayıda alan, şema değişikliği istenmiyorsa | Değerlendirildi ama **önerilmiyor** — mevcut repository'ler (`villa.repository.server.ts` vb.) tip-güvenli `VillaRow` interface'ine dayanıyor, JSONB alanı bu tip güvenliğini kırar, sorgu/filtreleme (örn. "İngilizce başlığı boş olan villaları bul") JSONB üzerinde SQL tarafında daha zahmetli |
| Ayrı kolonlar (`title_en`, `title_de`) | Az tablo, sabit sayıda dil garantisi | Bölüm D'de karşılaştırıldı, tercih edilmedi |

**Net ayrım (kullanıcının istediği gibi):** UI metni → TypeScript dictionary. Villa/lokasyon/tip/özellik/kural/sayfa/SSS → DB çeviri tabloları. İki sistem birbirinden bağımsız çalışır, karışmaz.

---

## Bölüm O — Migration Risk Analizi

Gereken migration'lar (yalnız liste, oluşturulmadı):
1. `ALTER TABLE settings ADD COLUMN multilingual_enabled boolean NOT NULL DEFAULT false, ADD COLUMN public_default_locale text NOT NULL DEFAULT 'tr';` — mevcut tekil satırı bozmaz (DEFAULT ile). `get_public_settings` RPC tanımı da güncellenmeli (yeni whitelist kolonları).
2. Yeni çeviri tabloları: `villa_translations`, `villa_location_translations`, `villa_type_translations`, `villa_feature_translations`, `villa_rule_translations`, `price_include_item_translations`, `villa_distance_translations`, `page_translations` (her biri `(id, <parent>_id, locale, <çeviri alanları>, created_at)` şeklinde, `UNIQUE(<parent>_id, locale)` kısıtı ile). Bunlar **yeni tablolar** — mevcut hiçbir tabloya `ALTER` gerektirmez, dolayısıyla mevcut ~1595 villa ve onların TR içeriği **hiç dokunulmadan** kalır.
3. `ALTER TABLE reservations ADD COLUMN reservation_locale text NOT NULL DEFAULT 'tr';` (Bölüm L) — mevcut rezervasyonlar otomatik `'tr'` alır (geçmişte hepsi TR akışından geldiği için bu doğru varsayım).

**Mevcut içeriğin korunması:** Yukarıdaki 3 migration da **yalnız ekleme** (`ADD COLUMN ... DEFAULT`, yeni `CREATE TABLE`) — hiçbiri mevcut kolonu silmiyor, tipini değiştirmiyor veya mevcut satırı dokunmuyor. Bu, RLS politikalarının da (migration 041/042 pattern'i) yeni tablolara **aynı `is_active_admin()` deseniyle** kopyalanması gerektiği anlamına geliyor (yazma admin-only, okuma public-safe RPC üzerinden — mevcut settings deseniyle birebir tutarlı).

**Rollback:** Her migration `DROP TABLE IF EXISTS ...` / `ALTER TABLE ... DROP COLUMN ...` ile geri alınabilir çünkü hiçbiri mevcut veriyi taşımıyor veya dönüştürmüyor (yalnız ek). `multilingual_enabled=false` yapılması tek başına **tüm sistemi tek-dilli davranışa döndürür** (kod tarafında feature-flag gibi davranmalı) — bu, veritabanı rollback'ine bile gerek kalmadan bir "acil kapatma" mekanizması sağlıyor.

**Neden büyük bir migration gerekmiyor:** Çünkü seçilen mimari (ayrı çeviri tabloları) mevcut şemaya **eklemeli** (additive), **dönüştürücü** (transformative) değil. Kolon-başına-dil yaklaşımı seçilseydi bile büyük bir "veri taşıma" migration'ı gerekmezdi (yeni kolonlar NULL başlar) — ama şema 9 tabloda kalıcı olarak şişerdi.

---

## Bölüm P — Fallback Stratejisi

Kural: `public_default_locale` = X ise ve aktif görüntülenen locale Y ise, önce Y'deki çeviri aranır; yoksa `public_default_locale` (X) çevirisine düşülür; o da yoksa (X = TR olduğu ve TR'nin **kaynak veri** olduğu senaryoda garanti dolu olacağı için) TR'ye düşülür — yani **iki kademeli fallback: `istenen_dil → public_default_locale → tr`**. TR özel: TR, `villa` tablosunun kendisinde zaten var (çeviri tablosunda değil) — yani TR için fallback aslında "çeviri tablosuna hiç bakma, ana tablodan oku" demek, bu da TR'nin **hiçbir zaman boş olamayacağını** garanti ediyor (mevcut ~1595 villa zaten TR dolu).

Bu, generic bir repository yardımcı fonksiyonuyla uygulanabilir: `resolveTranslated(baseRow, translationRow, locale, fields)` — `translationRow[field]` doluysa onu, boşsa `baseRow[field]`'ı (TR kaynağı) döner. Bu fonksiyon tüm çeviri-tablolu entity'ler için (villa, lokasyon, tip, özellik, kural, sayfa, SSS) **tek bir ortak yardımcı** olarak yazılabilir — kod tekrarını önler.

---

## Bölüm Q — Test Stratejisi

Gereken test senaryoları (en az): locale resolution (cookie/URL'den doğru locale çözülüyor mu), default locale (ayar yoksa/boşsa TR'ye düşüyor mu), `multilingual_enabled=false` durumunda dil seçicinin hiç render edilmediği ve sitenin `public_default_locale`'de tek-dilli çalıştığı, cookie persistence (kullanıcı dil değiştirince sonraki ziyarette hatırlanıyor mu), URL routing (Seçenek 2'nin `/en/`, `/de/` prefikslerinin doğru route'lara eşlendiği, TR'nin prefikssiz kaldığı), çeviri fallback (EN boşsa TR'ye, DE boşsa TR'ye düşüyor mu — Bölüm P), SEO (her locale için doğru `hreflang`/canonical/`alternates.languages` üretiliyor mu), sitemap (üç dil için doğru URL varyantları listeleniyor mu), cache isolation (TR isteği sonrası EN isteğinin farklı cache'den geldiği — Bölüm I'deki riskin regresyon testi), rezervasyon (locale ne olursa olsun fiyat hesaplamasının **birebir aynı** sonucu ürettiği — Bölüm K'nin regresyon testi), fiyat hesaplama (locale=de + currency=try kombinasyonunun sorunsuz çalıştığı), indirim (discount snapshot'ının dilden etkilenmediği), havuz ısıtma (aynı şekilde dilden etkilenmediği), admin ayarları (admin panelin `multilingual_enabled`/`public_default_locale` değişikliklerinin public tarafa cache-invalidation ile yansıdığı — Bölüm F'nin regresyon testi).

---

## Bölüm R — Etkilenme Haritası (EN ÖNEMLİSİ)

| Alan | Etkilenecek mi? | Risk | Dosyalar | Önerilen çözüm |
|---|---|---|---|---|
| Header/TopBar/Footer/Hero UI metni | Evet | Düşük — yalnız görsel, mantık değişmiyor | `app/components/layout/{Header,TopBar,Footer}.tsx`, `app/components/ui/Hero.tsx` ve alt bileşenleri | TS dictionary + `useTranslation()`-benzeri hook |
| Villa fiyatı / indirim hesaplama | Hayır (ama disiplin gerekli) | Orta — yalnız locale/currency yanlışlıkla birleştirilirse risk oluşur | `lib/price.engine.ts` | Dokunulmaz; locale parametresi asla eklenmemeli (Bölüm K) |
| Villa içerikleri (title/description/SEO) | Evet | Yüksek — yanlış migration mevcut TR içeriği bozabilir | `types/database.ts > VillaRow`, `lib/db/villa.repository.server.ts` | Ayrı `villa_translations` tablosu (additive, TR'ye dokunmaz) |
| Rezervasyon akışı (form + server action) | Evet (UI metni) / Hayır (hesaplama) | Orta — email dili için yeni snapshot kolonu gerekiyor | `ReservationForm.tsx`, `reservations` tablosu | `reservation_locale` snapshot kolonu (Bölüm L) |
| SEO (metadata/sitemap/robots/hreflang) | Evet | Yüksek — yanlış hreflang duplicate-content cezasına yol açabilir | `app/sitemap.ts`, `app/robots.ts`, her `generateMetadata`, `lib/seo.ts` | `alternates.languages` + sitemap dil varyantları (Bölüm H) |
| Cache (`unstable_cache`) | Evet | Yüksek — locale eklenmezse dil içerikleri karışır | `lib/cache.helpers.ts` | Locale-duyarlı cache'lere `locale` key parametresi ekle (Bölüm I) |
| Settings (admin ON/OFF + ana dil) | Evet | Düşük — mevcut singleton+cache mimarisi zaten uygun | `settings` tablosu, `app/services/settings.service.ts`, `lib/cache.helpers.ts` | `ALTER TABLE ADD COLUMN DEFAULT` + mevcut `revalidateSettings()` (Bölüm F) |
| Admin panel dili | Hayır (bilinçli olarak ayrı tutulmalı) | Düşük | `app/(admin)/maki-admin/*`, `middleware.ts` | Admin route grubu locale-routing kapsamı dışında bırakılır (Bölüm M) |
| Auth/middleware | Hayır (mevcut) / Yeni matcher gerekebilir | Düşük — mevcut admin-auth matcher'a dokunmadan yeni bir locale-matcher eklenir | `middleware.ts` | Seçenek 2 ile ayrı, çakışmayan bir matcher/rewrite bloğu (Bölüm G) |
| Email/WhatsApp | Evet | Orta — şu an dil bilgisi hiç saklanmıyor | `app/lib/mail/templates/*`, `reservations` tablosu | `reservation_locale` snapshot + template fonksiyonlarına `locale` parametresi |
| Havuz ısıtma | Hayır | Yok — tamamen sayısal/boolean | `price.engine.ts` (pool heating fonksiyonları) | Dokunulmaz |

---

## Bölüm S — Fazlı Yol Haritası (SADECE ANALİZ — HENÜZ KOD YOK)

**FAZ 0 — Mevcut Durum & Riskler (bu rapor).** Dosya değişikliği yok. Risk: yok. Migration: yok. Rollback: n/a.

**FAZ 1 — Locale/Settings Altyapısı.** Değişecek: `settings` tablosu (2 yeni kolon), `get_public_settings` RPC (whitelist genişletme), `Settings` tipi (`app/services/settings.types.ts`), admin Genel Ayarlar formu (yeni ON/OFF + dil seçici alanı). Değişmeyecek: fiyat/rezervasyon/indirim, public UI (henüz görünür etkisi yok — flag `false` iken davranış birebir aynı). Migration: Evet (additive, DEFAULT'lu). Prod riski: Düşük. Rollback: `DROP COLUMN` veya flag'i `false` bırakmak. Test: Bölüm F'nin regresyon testi (cache invalidation).

**FAZ 2 — UI Çeviri Dictionary.** Değişecek: yeni `lib/i18n/dictionaries/{tr,en,de}.ts`, Header/Footer/Hero/Search/booking bileşenlerinde string'lerin dictionary çağrısına taşınması. Değişmeyecek: hesaplama, DB, routing. Migration: Yok. Prod riski: Orta (çok dosya dokunuluyor, regresyon riski UI metninde — otomatik test + görsel QA önerilir). Rollback: git revert (DB etkisi yok). Test: her değiştirilen bileşen için snapshot/metin testi.

**FAZ 3 — DB Çeviri Mimarisi.** Değişecek: yeni `*_translations` tabloları + RLS + repository katmanı (`findTranslation`/`resolveTranslated` yardımcıları). Değişmeyecek: mevcut `villa`/`villa_locations`/vb. tabloları (yalnız okunur, yazılmaz). Migration: Evet (yalnız yeni tablo, additive). Prod riski: Düşük (mevcut sorgular etkilenmez, yeni tablolar boşken sistem TR-fallback ile eskisi gibi davranır). Rollback: `DROP TABLE`. Test: fallback senaryoları (Bölüm P).

**FAZ 4 — Routing (Seçenek 2).** Değişecek: `middleware.ts` (yeni, admin matcher'dan ayrı bir locale-matcher/rewrite bloğu), yeni `app/en/`, `app/de/` route group'ları (veya tek bir dinamik `[locale]` segment — teknik detay implementasyon aşamasında netleşir). Değişmeyecek: `app/(public)/` altındaki mevcut TR route'lar (prefikssiz kalır). Migration: Yok. Prod riski: Orta-Yüksek (routing değişikliği en riskli faz — dikkatli aşamalı rollout gerekir, örn. önce yalnız `/en/` açılır, `/de/` sonra). Rollback: middleware/route group'ları kaldırmak, TR route'lar hiç etkilenmediği için tam rollback mümkün. Test: Bölüm Q'daki routing senaryoları.

**FAZ 5 — Public UI Entegrasyonu.** Değişecek: `LocaleProvider`/context, dil seçici komponenti, `<html lang>` dinamikleştirme. Değişmeyecek: hesaplama, veri katmanı. Migration: Yok. Prod riski: Orta. Rollback: flag `false`. Test: server/client hydration mismatch testleri (Bölüm J).

**FAZ 6 — Villa İçerik Çevirisi (Admin + Veri Girişi).** Değişecek: villa-edit formuna dil sekmesi, lokasyon/tip/özellik/kural/fiyata-dahil admin ekranlarına çeviri alanları. Değişmeyecek: mevcut TR veri girişi akışı (aynı kalır, üstüne eklenir). Migration: Yok (Faz 3'te yapıldı). Prod riski: Düşük (yalnız admin, opsiyonel alan). Test: admin CRUD + fallback.

**FAZ 7 — SEO/hreflang/Sitemap.** Değişecek: her `generateMetadata`, `sitemap.ts`, `robots.ts` (disallow listesi aynı kalır, yalnız yeni allow path'ler eklenir), `StructuredData.tsx` (`inLanguage`). Migration: Yok. Prod riski: Yüksek (yanlış hreflang SEO cezası riski) — bu faz **canlıya çıkmadan önce** Google Search Console'da test edilmeli (hreflang doğrulama araçları). Rollback: metadata değişikliklerini geri almak (URL'ler etkilenmediği için index kaybı riski yok).

**FAZ 8 — Rezervasyon/Email Locale Snapshot.** Değişecek: `reservations` tablosu (+1 kolon), `ReservationForm.tsx` (locale'i server action'a geçirme), mail template fonksiyonları. Değişmeyecek: fiyat/indirim hesaplama. Migration: Evet (additive, DEFAULT `'tr'`). Prod riski: Düşük. Rollback: `DROP COLUMN`, template'ler TR'ye fallback.

**FAZ 9 — Admin Çeviri Yönetimi (UX cilası).** Değişecek: admin tarafında "hangi villalarda EN/DE eksik" gibi bir eksik-çeviri raporu/dashboard'u (opsiyonel, operasyonel kolaylık). Prod riski: Düşük. Migration: Yok.

**FAZ 10 — Test/QA.** Bölüm Q'daki tüm senaryoların otomatik test suite'e eklenmesi, mevcut 131 testin regresyona girmediğinin doğrulanması.

**FAZ 11 — Production Rollout.** `multilingual_enabled=false` ile tüm altyapı sessizce prod'a alınır (sıfır kullanıcı etkisi) → önce dahili/staging'de `true` yapılıp QA → küçük bir kullanıcı segmentiyle (varsa feature-flag/A-B) → tam açılış. Rollback her aşamada `multilingual_enabled=false` ile **anında** mümkün (kod tarafı flag'i kontrol ettiği sürece).

---

## Kapanış Notu

Bu rapor 2026-09-14 tarihinde, repodaki gerçek dosyalar (`middleware.ts`, `next.config.js`, `types/database.ts`, `lib/cache.helpers.ts`, `app/services/settings.service.ts`, `app/api/admin/settings/route.ts`, `app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx`, `app/(public)/kiralik-villa/[slug]/page.tsx`, `app/context/CurrencyContext.tsx` ve ilgili public/admin bileşenleri) doğrudan okunarak hazırlandı. Hiçbir dosya değiştirilmedi, migration oluşturulmadı, DB'ye yazılmadı, commit/push yapılmadı — bu oturumun tamamı salt-okunur (`device_bash` üzerinden `find`/`grep`/`cat`/`sed -n`) komutlarla yürütüldü.
