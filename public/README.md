# public/ — Static Asset Architecture

Bu klasör **deploy ile birlikte sürümlenen statik asset'leri** tutar.
Admin runtime'da yönetilen her şey (logo, favicon, hero, kategori cover,
villa fotoğrafı, OG image vs.) **Cloudflare R2**'dedir — buraya
kopyalanmamalı.

> Karar mekanizması: admin yönetimine açık mı? **Evet → Storage. Hayır → public/**

---

## Klasör haritası

```
public/
├── brand/                  ← marka kimliği + 3rd-party güven öğeleri
│   ├── trust/              ← visa.svg, mastercard.svg, troy.svg, tursab.svg
│   ├── partners/           ← affiliate/partner sabit logoları
│   └── logos/              ← marka logosunun ek varyantları
│                              (monogram, mono-white, alt-locale)
│
├── ui/                     ← UI seviyesinde statik dekoratif assetler
│   ├── patterns/           ← dot-grid.svg, lines.svg (tekrar eden pattern'ler)
│   ├── textures/           ← noise.png, paper.webp (background tekstürleri)
│   ├── gradients/          ← yalnız zorunluysa; CSS gradient yeterliyse
│                              dosya açma
│   └── shapes/             ← blob.svg, divider.svg, badge-shapes.svg
│
├── marketing/              ← homepage / landing dekoratif görseller
│   ├── homepage/           ← hero-overlay.svg, value-prop-illustration.webp
│   ├── regions/            ← bölge dekoratif kart bg'leri (DİKKAT:
│                              location-covers admin yönetir → Storage'a
│                              gider; buradakiler "site-level" dekoratif)
│   ├── campaigns/          ← yılbaşı/sezon kampanyaları için sürümlü
│                              banner'lar
│   └── cta/                ← cta-bg-1.webp, footer-glow.svg
│
├── og/                     ← static OG fallback
│   └── og-fallback.png     ← settings.default_og_image yokken kullanılan
│                              1200×630 fallback (Open Graph + Twitter Card)
│
└── icons/                  ← PWA/manifest ikon setleri
                              (apple-touch-icon.png, manifest.json,
                               android-chrome-*.png)
```

---

## Tip → konum tablosu

| Asset tipi | Konum | Yönetim |
|---|---|---|
| Visa / Mastercard / Troy / TÜRSAB logosu | `public/brand/trust/` | Dev — kontrat/güven gerektiriyor |
| Affiliate / iş ortağı logosu | `public/brand/partners/` | Dev |
| Logo varyantı (mono, alt, locale) | `public/brand/logos/` | Dev |
| Noise / dot-grid / pattern SVG | `public/ui/patterns/` | Dev |
| Tekstür PNG/WebP | `public/ui/textures/` | Dev |
| Dekoratif shape / blob / divider | `public/ui/shapes/` | Dev |
| Homepage section illustration | `public/marketing/homepage/` | Dev (sürümlü) |
| Region card dekoratif bg | `public/marketing/regions/` | Dev |
| Sezon kampanya banner'ı | `public/marketing/campaigns/` | Dev — git ile sürümlenir |
| CTA section background | `public/marketing/cta/` | Dev |
| OG fallback (1200×630 PNG) | `public/og/og-fallback.png` | Dev |
| PWA / favicon eklentileri | `public/icons/` | Dev |
| **Header/footer site logosu** | **`site-assets/logo/`** (Storage) | **Admin** |
| **Favicon (browser tab)** | **`site-assets/favicon/`** (Storage) | **Admin** |
| **Watermark** | **`site-assets/watermark/`** (Storage) | **Admin** |
| **Homepage hero image** | **`site-assets/hero/`** (Storage) | **Admin** |
| **Default OG (override)** | **`site-assets/seo/`** (Storage) | **Admin** |
| **Category / Location / Page cover** | **`site-assets/{x}-covers/`** (Storage) | **Admin** |
| **Villa fotoğrafları** | **`villa-images/`** (Storage) | **Admin** |

---

## Konvansiyonlar

- **Naming**: tek kelime + tire (`hero-overlay.svg`, `cta-bg-mountain.webp`).
  Camel/Snake-case kullanma. URL casing case-sensitive.
- **Format**: vektör için `.svg`, raster için `.webp` tercih (PNG yalnız
  alpha/lossless gerekiyorsa). Trust badge gibi 3rd-party logosu için
  `.svg` zorunlu (responsive).
- **Boyut**: `public/` üzerinden gelen assetler `<Image src="/...">` ile
  next/image optimization'a girer. `sizes` attribute her zaman verilmeli.
- **Versioning**: dosya değişirse adı sabit kalır → CDN cache deterministic.
  Yeni sürüm istenirse yeni dosya adı (`hero-overlay-v2.svg`).
- **Lisans**: 3rd-party (Visa/Mastercard/TÜRSAB) logoları için brand guideline
  uyumu gerekir. Lisans gerektiren her asset için kısa notu kaynak dosyaya
  yorum olarak ekle veya `LICENSE.md` aç.

---

## Yapma listesi

- ❌ `public/uploads/` oluşturma — runtime upload Storage'a gider, RLS yok burada
- ❌ `public/villa-images/` oluşturma — Storage bucket'ı `villa-images` zaten var
- ❌ `public/admin/` oluşturma — admin yönetimli her şey Storage'ta
- ❌ Aynı asseti hem `public/` hem Storage'a koyma — kaynak belirsizleşir
- ❌ Root level `assets/`, `images/`, `uploads/` klasörü açma — Next convention'ı
  yalnız `public/`
- ❌ Bu dizinleri R2 bucket path'leri için kopya kanal olarak kullanma

---

## Helper kullanımı

Public asset'ler direkt `<Image src="/brand/trust/visa.svg" ... />` ile
çağrılır. **`storage.helpers.ts` içindeki `getPublicUrl` / `resolveAssetUrl`
fonksiyonları YALNIZ R2 bucket path'leri içindir** — public asset
yolları onlara verilmez.

Doğru:
```tsx
<Image src="/brand/trust/visa.svg" alt="Visa" width={36} height={24} />
```

Yanlış:
```tsx
// Bu R2'ye gider; "brand/trust/visa.svg" diye bucket path'i
// olmadığı için 404 verir.
<Image src={getCategoryCoverPublicUrl("brand/trust/visa.svg") || ""} />
```
