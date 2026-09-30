# HERO / DATEPICKER LAZY-LOAD — ANALİZ + ÖLÇÜM RAPORU

**Tarih:** 21 Eylül 2026
**Faz:** Hero / DatePicker Lazy-Load Optimizasyonu
**Sonuç:** ⛔ **UYGULANMADI — RAPORLA VE DUR**
**Repo durumu:** Kaynak kodda **0 (sıfır)** değişiklik. `git status` faz öncesiyle birebir aynı.

---

## 0. YÖNETİCİ ÖZETİ

| | Değer |
|---|---|
| Ana sayfa (`/`) ilk yükleme JS (baseline) | **1.318.894 B ham / 402.577 B gzip** (25 chunk) |
| Bunun datepicker'a ait kısmı | **205.445 B ham / 53.144 B gzip** |
| Oransal | **%15,6 ham / %13,2 gzip** |
| Lazy-load ile ölçülen kazanç (`ssr:false`) | **−205.346 B ham (−%15,6)**, 25 → 21 chunk |
| Lazy-load ile ölçülen kazanç (`ssr:true`) | **0 B — kazanç YOK** (chunk'lar `<link rel=preload>` ile yine aynı sayfa yüklemesinde iniyor) |
| Davranış bozulması | **EVET — 4 kalem, aşağıda kanıtlı** |

Kazanç gerçek ve kayda değer. Ancak kazancı üreten tek varyant (`ssr:false`) ilk-boyama DOM'unu
ve ilk-etkileşim davranışını değiştiriyor. Görev tanımındaki *"Eğer lazy-load uygulamak mevcut
davranışı bozabilecekse uygulama yapma; raporla ve dur"* kuralı gereği **uygulanmadı**.

---

## 1. ÖNCE ANALİZ — SORULARIN CEVAPLARI

### 1.1 Hangi component `react-datepicker` import ediyor?

Kod tabanında **4 gerçek import noktası** var (grep ile doğrulandı):

| Dosya | Satır | Kapsam |
|---|---|---|
| `app/components/ui/hero/_components/HeroSearchPanel.tsx` | 14–15 | **HERO — bu fazın hedefi** |
| `app/(public)/arama/FilterSidebar.tsx` | 38–39 | /arama (kapsam dışı) |
| `app/(public)/teklif-al/OfferRequestForm.tsx` | 19–20 | /teklif-al (kapsam dışı) |
| `app/components/admin/shared/AdminDateRangePicker.tsx` | 4–5 | admin (kapsam dışı) |

`app/components/villa/booking/BookingCalendar.tsx` **`react-day-picker`** kullanır — AYRI kütüphane,
bu fazla ilgisi yok.

Ana sayfada (`/`) `react-datepicker`'ı yükleyen **tek** tüketici `HeroSearchPanel`'dir
(`Hero.tsx:11` → `Hero.tsx:425`).

### 1.2 Import static mi?

**Evet, tamamen static:**

```ts
// HeroSearchPanel.tsx:14-19
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";   // ← side-effect CSS import
import { tr } from "date-fns/locale";
import { enUS } from "date-fns/locale";
import { de as deLocale } from "date-fns/locale";
```

Ayrıca **module-level yan etki** var (satır 44-48):

```ts
registerLocale("tr", tr);
registerLocale("en", enUS);
registerLocale("de", deLocale);
```

→ Sayfa TR olsa bile **her üç locale verisi de** bundle'a giriyor ve modül yüklenir yüklenmez
kaydediliyor. Bu, lazy-load yapılacaksa taşınması zorunlu olan bir bağımlılıktır.

### 1.3 Component `use client` mı?

`HeroSearchPanel.tsx:1` → `"use client"`. **Evet.**
Üst bileşen `Hero.tsx` ise **server component** (`"use client"` yok).

### 1.4 DatePicker gerçekten ilk render'da gerekli mi?

**EVET — ve bu, bu fazın kilit bulgusudur.**

`react-datepicker` v9 kapalı durumda bile **görünür input'u kendisi render eder**
(`node_modules/react-datepicker/dist/index.js`):

- `render()` → `PopperComponent$1` (= `withFloating(PopperComponent)`) → `targetComponent: this.renderInputContainer()`
- `renderInputContainer()` → `<div class="react-datepicker__input-container">` + `renderDateInput()`
- `renderDateInput()` → `React.cloneElement(customInput, { value, onBlur, onChange, onClick, onFocus, onKeyDown, placeholder, className, ... })`
- Sarmalayıcı: `<div class="react-datepicker-wrapper">` (`clsx("react-datepicker-wrapper", ...)`)

Yani **kullanıcı takvimi açmadan önce de** `react-datepicker` + `@floating-ui/react` yüklü olmak
zorunda; çünkü panelde sürekli görünen "Tarih / Tarih seç" input'unun **sahibi kütüphanenin
kendisi**. `@floating-ui`'nin `useFloating` hook'u kapalı durumda dahi koşulsuz çalışır.

Bu, `VillaCard` → `VillaCardBookingModal` (modal, `isOpen=false` iken hiç mount edilmez) ve
`MapPicker` (wizard adımı) örneklerinden **yapısal olarak farklıdır**. Kod tabanındaki mevcut
`next/dynamic` deseni (5 dosya, hepsi `ssr:false` + koşullu mount) buraya **doğrudan uygulanamaz**.

### 1.5 Mevcut mobil/desktop davranışları

| Konu | Mevcut davranış |
|---|---|
| Popper | `popperPlacement="bottom-start"` (mobil/desktop AYNI — `/arama`'daki gibi mobil dalı YOK) |
| Portal | `portalId="hero-datepicker-portal"` → hedef `<div id="hero-datepicker-portal" />` `Hero.tsx:428` |
| z-index | `popperClassName="!z-[60]"` |
| Mobil klavye | `customInput={<MobileKbSafeInput />}` → `inputMode="none"` (OS klavyesi açılmaz, focus/popper çalışır) |
| Range | `selectsRange` + `onChange(dates: any) => [start, end]` |
| Min tarih | `minDate={new Date()}` — **her render'da yeni Date** |
| Locale | `locale={locale}` (tr/en/de, module-level `registerLocale`) |
| Görünen metin | `value={startDate ? dateLabel : ""}` (`buildHeroDateLabel`) |
| Disabled dates | **YOK** (`excludeDates`/`filterDate` kullanılmıyor) |
| maxDate | **YOK** |

### 1.6 SSR / hydration açısından mevcut davranış

Ana sayfa `/` build çıktısında **`○ (Static)` — statik olarak ön-render ediliyor** (revalidate 10m).
Production build + `next start` ile alınan **gerçek HTML** şunu içeriyor:

```html
<div class="react-datepicker-wrapper">
  <div class="react-datepicker__input-container">
    <input placeholder="Tarih seç" autoComplete="off"
           class="!bg-transparent !border-0 … cursor-pointer"
           inputMode="none" value=""/>
  </div>
</div>
```

→ Input, **placeholder metniyle birlikte statik HTML'de mevcut**. JS inmeden önce bile kullanıcı
"Tarih seç" yazısını görüyor. Bu, korunması gereken mevcut davranıştır.

---

## 2. ÖLÇÜM YÖNTEMİ VE ORTAM UYARISI

> ⚠️ **ORTAM PRODUCTION DEĞİLDİR.** Rakamlar aşağıdaki koşullarda üretilmiştir ve
> production sonucu olarak sunulmamalıdır.

- **Build:** `npx next build --webpack` (Turbopack **değil**). Turbopack, Google Fonts dosyalarını
  kendisi indirdiği ve bu VM'de `fonts.googleapis.com` / `fonts.gstatic.com` egress **kapalı**
  olduğu için kullanılamadı.
- **Font:** Next.js'in resmî `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` mekanizması + repo dışında
  tutulan sentetik CSS fixture.
- **DB:** `aws-0-eu-west-1.pooler.supabase.com` DNS ile erişilemiyor (`EAI_AGAIN`). Build sırasında
  cache fallback'leri devreye girdi; sayfa yine de statik üretildi.
- **Ölçüm:** `next start` ile servis edilen gerçek `/` HTML'inden `<script src>` etiketleri
  toplandı, karşılık gelen chunk dosyalarının **diskteki ham ve gzip -9 boyutları** toplandı.
  Brotli / CDN sıkıştırması ölçülmedi.
- **Deney izolasyonu:** Aday değişiklikler **kullanıcı reposuna hiç yazılmadı**; repo `tar` ile
  session-dışı geçici bir dizine kopyalanıp orada denendi. Repodaki tek yan etki, kaynak kodu
  değişmemiş bir `.next` build artefaktının yenilenmesidir (`.gitignore` kapsamında).

---

## 3. BASELINE ÖLÇÜMÜ (`/` ana sayfa, değişiklik YOK)

25 script chunk, **toplam 1.318.894 B ham / 402.577 B gzip**.

Datepicker'a atfedilebilen chunk'lar:

| Chunk | Ham | Gzip | İçerik imzası |
|---|---|---|---|
| `13633bf0-…` | 108.728 | 26.112 | `react-datepicker__*` (184 eşleşme) — kütüphane çekirdeği |
| `8853-…` | 72.561 | 20.270 | date-fns ay/gün adları |
| `7529-…` | 20.343 | 4.900 | date-fns locale verisi (`Ocak`, `Januar`, `January`) |
| `c16f53c3-…` | 3.813 | 1.862 | `@floating-ui` |
| **TOPLAM** | **205.445** | **53.144** | |

Karşılaştırma için: aynı sayfadaki en büyük tek kalem `7149-…` = **483.004 B** ve içeriği
**Sentry**'dir (`sentry` 159 eşleşme). Bu faz kapsamı dışındadır (kural 4).

---

## 4. DENEY A — `next/dynamic` + `ssr: false`

**Kurulum:** `react-datepicker`, CSS import'u, üç `date-fns` locale'i ve `registerLocale`
çağrıları ayrı bir `HeroDatePickerLazy.tsx` modülüne taşındı; `HeroSearchPanel` bunu
`dynamic(..., { ssr:false, loading: <placeholder> })` ile yükledi. Tüm DatePicker prop'ları
(selectsRange, locale, dateFormat, minDate, placeholderText, value, popperPlacement,
popperClassName, portalId, customInput) **birebir** aktarıldı.

### 4.1 Kazanç — GERÇEK

| | Baseline | `ssr:false` | Fark |
|---|---|---|---|
| Chunk sayısı | 25 | 21 | −4 |
| Ham toplam | 1.318.894 B | 1.113.548 B | **−205.346 B (−%15,6)** |

Kaybolan 4 chunk, §3'teki 4 chunk ile birebir örtüşüyor. Kazanç **doğrulandı**.

### 4.2 Bedel — DAVRANIŞ DEĞİŞİYOR (4 kalem, HTML diff ile kanıtlı)

**Baseline `/` HTML:**
```html
<div class="react-datepicker-wrapper"><div class="react-datepicker__input-container">
<input placeholder="Tarih seç" autoComplete="off" class="…" inputMode="none" value=""/>
</div></div>
```

**`ssr:false` `/` HTML:**
```html
<!--$!--><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
<div class="react-datepicker-wrapper"><div class="react-datepicker__input-container">
<input readOnly="" inputMode="none" autoComplete="off" class="…"/>
</div></div><!--/$-->
```

1. ⛔ **`placeholder="Tarih seç"` statik HTML'den KAYBOLUYOR.**
   `dynamic()` modül seviyesinde çağrıldığı için `loading` fallback'i component içindeki
   `dict.datePlaceholder`'a erişemiyor. Sonuç: JS inene kadar tarih alanı **boş** görünür.
   Ana sayfa **statik cache**'ten servis edildiği için bu, ilk boyamada doğrudan görünür bir
   UX gerilemesidir. (Locale-başına modül-seviyesi bir map ile çözülebilir — bkz. §6.)

2. ⛔ **`BAILOUT_TO_CLIENT_SIDE_RENDERING`.** Statik ön-render edilen bir sayfada bu alt ağaç
   artık statik HTML'den çıkarılıp **zorunlu client-side render**'a düşüyor.

3. ⛔ **Input, chunk inene kadar `readOnly` ve etkisiz.** Bu pencerede tarih alanına yapılan
   tıklama takvimi **açmıyor**. Mevcut davranışta (baseline) hydration sonrası ilk tıklama
   takvimi anında açar. Bu, görev tanımındaki *"Açılış/kapanış davranışı AYNI kalmalı"*
   maddesinin doğrudan ihlalidir.

4. ⛔ **Element takası.** Chunk indiğinde placeholder `<input>` gerçek DatePicker input'u ile
   değiştiriliyor → o an odaklanmış kullanıcı **focus'u kaybeder**, ek bir repaint oluşur.

---

## 5. DENEY B — `next/dynamic` + `ssr: true`

SSR'ı korumak için denendi. **Sonuç: kazanç sıfır, davranış yine bozuk.**

| | Değer |
|---|---|
| `<script src>` toplamı | 1.113.548 B |
| Ek `<link rel="preload">` lazy chunk'lar | **+206.447 B** (5 chunk: 108.735 + 72.569 + 20.338 + 3.814 + 991) |
| **Gerçek toplam** | **1.319.995 B** ≈ baseline 1.318.894 B |

Next.js lazy chunk'ları **aynı sayfa yüklemesinde preload ediyor** → ağdan inen bayt aynı.
Üstelik SSR HTML'i yine bozuk:

```html
<!--$?--><template id="B:0"></template>
<input readOnly="" inputMode="none" autoComplete="off" class="…"/>
```

Suspense sınırı SSR sırasında **çözülmüyor**; `placeholder` yine yok, input yine `readOnly`.
Yani `ssr:true`, `ssr:false`'a göre **kesinlikle daha kötü**: bedeli aynı, faydası sıfır.

---

## 6. "TÜM COMPONENT vs SADECE DATEPICKER" DEĞERLENDİRMESİ

Görev tanımındaki soru: *"componenti lazy-load etmek ile datepicker'ın kendisini lazy-load etmek
arasındaki farkı değerlendir."*

| Yaklaşım | Değerlendirme |
|---|---|
| **Tüm `HeroSearchPanel`'i lazy-load** | ⛔ **ELENDİ.** 679 satır, sadece datepicker değil; Tip/Bölge dropdown'ları, Kişi seçimi, "Villa bul" CTA ve `router.push` mantığını da içeriyor. Ana sayfanın **birincil etkileşim alanı** ve tamamen ekranın üstünde. Lazy-load edilirse hero panelinin tamamı ilk boyamada kaybolur → ağır CLS + ana CTA'nın gecikmesi. Kazanç/risk oranı çok kötü. |
| **Sadece DatePicker'ı lazy-load** | ✅ Doğru sınır — kazanç (205 KB) buradan geliyor. Ama §4.2'deki 4 bedeli beraberinde getiriyor. |
| **CSS'i ayırmak** | ⛔ JS kazancı yok; `react-datepicker.css` side-effect import'u 4 dosyada. Ayrıca taşınması CSS emisyon sırasını değiştirir (kural: "CSS bozuluyorsa DUR"). |

---

## 7. GÜVENLİK KONTROLÜ

Hiçbir kaynak dosya değiştirilmediği için aşağıdakilerin tamamı **dokunulmadan** kalmıştır:

- Server Action authorization (`lib/auth/action-authz.ts`) — değişmedi
- Admin authorization — değişmedi
- PII-safe rezervasyon akışı — değişmedi
- Server-side DB erişimi / repository mimarisi — değişmedi
- `server-only` sınırları — değişmedi; client'a server-only kod taşınmadı
- API route'lar, fiyat hesaplama, rezervasyon mantığı, migration'lar — dokunulmadı
- `package.json` / dependency — dokunulmadı
- Commit / push — **yapılmadı**

Not: Deney sırasında incelenen aday kod da yalnızca **presentational** bir client component
sınırı oluşturuyordu; hiçbir varyantta server-only modül client'a taşınmadı.

---

## 8. TEST BASELINE

Kaynak kodda değişiklik olmadığı için **3.138 / 3.138 PASS** baseline'ı yapısal olarak korunur;
yeni failure sayısı **0**. (Testleri kırabilecek bir düzenleme yapılmadığından tam suite yeniden
çalıştırılmadı; `git status` faz öncesiyle birebir aynıdır.)

İlgili not: Hiçbir test `HeroSearchPanel`'in `react-datepicker` import biçimini kilitlemiyor.
Tek kaynak-kilidi testi `tests/unit/homepage-p0-i18n.test.tsx:44` olup yalnızca
`formatDictionaryString(dict.guestsOption` varlığını ve `{g} kişi` yokluğunu kontrol eder —
lazy-load'dan etkilenmez. Yani **testler bu değişikliğin önünde engel değil**; engel olan şey
ölçülmüş davranış farkıdır.

---

## 9. KARAR

⛔ **UYGULANMADI.**

Gerekçe: Kazanç üreten tek varyant (`ssr:false`), statik ön-render edilen ana sayfanın ilk-boyama
DOM'unu değiştiriyor (placeholder metni kayboluyor, client-side-render bailout oluşuyor) ve
chunk inene kadar tarih alanını etkisiz bırakıyor. Bu, görev tanımının şu maddelerine
doğrudan takılıyor:

> "Şunlar AYNI kalmalı: … Açılış/kapanış davranışı … Mobil davranış, Desktop davranış …"
> "Eğer lazy-load uygulamak mevcut davranışı bozabilecekse uygulama yapma; raporla ve dur."
> "Eğer … hydration problemi çıkıyorsa … OPTİMİZASYONU GERİ AL VE DUR."

---

## 10. ONAYINIZA SUNULAN SEÇENEKLER

**Seçenek 1 — Hiçbir şey yapma.** Ana sayfa 205 KB ham / 53 KB gzip fazladan taşımaya devam eder.
Davranış %100 korunur. (Mevcut durum.)

**Seçenek 2 — Rafine lazy-load (onay gerektirir).** §4.2'deki 4 bedelden 3'ü kapatılabilir:

- (1) `placeholder` sorunu: `dynamic()` çağrısı **locale başına modül seviyesinde** bir map
  içinde kurulur (`Record<Locale, ComponentType>`), fallback doğru `placeholderText` ile
  render edilir → statik HTML baseline ile **görsel olarak aynı** olur.
- (3) Etkisizlik penceresi: fallback `readOnly` olmaz; `onPointerEnter` / `onTouchStart` /
  `onFocus` üzerinde `preload()` tetiklenir, ayrıca `requestIdleCallback` ile arka planda
  önceden indirilir → pratikte ilk tıklama anına kadar chunk çoktan inmiş olur.
- (4) Focus kaybı: gerçek DatePicker `autoFocus` ile mount edilerek takvim otomatik açılır.

  **Kapatılamayan tek kalem (2):** `BAILOUT_TO_CLIENT_SIDE_RENDERING` işaretçisi ve teorik olarak
  hydration ile chunk inişi arasındaki (prefetch sayesinde çok dar ama sıfır olmayan) pencerede
  tarih alanına yapılan tıklamanın takvimi **senkron açmaması**. Bu, "davranış birebir aynı"
  garantisini **veremeyeceğim** tek noktadır. Kabul edilebilir bulursanız uygularım.

**Seçenek 3 — Kapsam dışı ama çok daha büyük kalem.** Ana sayfadaki en ağır tekil yük
`react-datepicker` değil, **Sentry: 483.004 B (%36,6)**. Bu fazda dokunulması yasaklandı
(kural 4). Ayrı bir fazda ele alınabilir.

---

## 11. DOĞRULANAMAYANLAR

- **Turbopack çıktısı.** Production Turbopack kullanıyor; ölçümler webpack ile yapıldı. Chunk
  bölünmesi ve dolayısıyla mutlak rakamlar Turbopack'te farklı olabilir. Oransal sonuç
  (datepicker'ın ~%13–16 pay tutması) büyük ihtimalle benzer kalır, ancak **doğrulanmadı**.
- **Gerçek ağ / cihaz metrikleri.** LCP, TBT, INP ölçülmedi — bu ortamda ölçülemez. Yalnızca
  transfer edilen JS baytı ölçüldü.
- **Brotli boyutları.** Yalnızca `gzip -9` ölçüldü; CDN'in Brotli çıktısı farklı olacaktır.
- **DB'ye bağlı sayfa içerikleri.** Build sırasında DB erişilemediği için ana sayfa cache
  fallback verisiyle üretildi; villa listesi dolu olsaydı HTML büyür, **JS chunk kümesi
  değişmezdi**.
