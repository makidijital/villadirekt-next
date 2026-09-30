/* ===============================================================
   🛡️ IMAGE HELPERS — browser-side WebP conversion + resize
   ===============================================================
   Admin taxonomy cover upload flow'larında (kategori + bölge) tek
   source-of-truth. Storage'a HER ZAMAN `.webp` yazılır:
     - input: png / jpg / jpeg / webp / vs. (kullanıcı ne seçerse)
     - output: image/webp, max 1920px genişlik, quality 0.85
     - filename'siz File: caller path'i ayrı build eder (slug.webp)

   NEDEN BROWSER-SIDE:
     - Server-side conversion için sharp / Edge runtime gerekir;
       hosted R2 storage'a ek serverless function eklemek
       ekstra deploy maliyeti.
     - Browser conversion zero-infrastructure: Canvas API her modern
       tarayıcıda (Chrome 32+, Safari 14+, Firefox 65+) `toBlob` ile
       image/webp encoder destekliyor.
     - Memory: yükleme sonrası ObjectURL revoke ediliyor; ek leak yok.

   ALPHA TRANSPARENCY:
     Canvas default backgroundColor transparent. WebP alpha kanal
     destekliyor → PNG transparency korunur. JPEG-source görseller
     zaten alpha'sız; davranış aynı.

   ORIENTATION:
     Modern browser'lar `drawImage` çağrısında EXIF orientation'ı
     OTOMATIK uyguluyor (Chrome 81+, Safari 13.4+, Firefox 77+).
     Eski browser'larda dikine çekilmiş telefon fotoğrafları yan
     görünebilir — kabul edilebilir trade-off (rare, admin sayfası).

   FALLBACK:
     Canvas/Blob çağrısı herhangi bir nedenle fail ederse
     (yetkilendirme, OOM, vs.) orijinal `File` döner. Caller upload'a
     devam eder; storage'a orijinal format yazılır. Production
     genelde başarılı; bu sadece defensive guard.
   =============================================================== */

export type ConvertImageOptions = {
  /** Maksimum genişlik (px). Çok büyük görsel resize edilir. */
  maxWidth?: number;
  /** WebP encoder quality. 0.85 ≈ premium denge (görsel kayıp
   *  algılanabilir değil; dosya boyutu PNG/JPG'ye göre %30-50 küçük). */
  quality?: number;
};

const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_QUALITY = 0.85;

/**
 * Browser-side: input File → WebP File.
 * - max genişliği `maxWidth`'i aşarsa proportional resize.
 * - quality varsayılan 0.85.
 * - Çıktı filename `{originalBase}.webp` (caller path'i ayrı build
 *   ederse de bu name override edilebilir).
 * - Conversion fail olursa orijinal File döner (defensive fallback).
 */
export async function convertImageToWebP(
  input: File,
  opts: ConvertImageOptions = {}
): Promise<File> {
  const maxWidth = opts.maxWidth ?? DEFAULT_MAX_WIDTH;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  /* Server-side defansif: convertImageToWebP yalnız browser'da çağrılır
     ama yanlışlıkla server bundle'da çalıştırılırsa fallback. */
  if (typeof window === "undefined" || typeof document === "undefined") {
    return input;
  }

  const objectUrl = URL.createObjectURL(input);
  try {
    const img = await loadHTMLImage(objectUrl);

    /* Resize hesaplama: width > maxWidth ise küçült, aksi orijinal. */
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return input; // degenerate image → orijinal döndür

    let targetW = srcW;
    let targetH = srcH;
    if (srcW > maxWidth) {
      const ratio = maxWidth / srcW;
      targetW = maxWidth;
      targetH = Math.round(srcH * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return input;

    /* Alpha kanal: clearRect transparent başlangıç, drawImage üzerine.
       PNG transparency korunur; JPEG-source görsellerde alpha yok zaten. */
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await canvasToBlob(canvas, "image/webp", quality);
    if (!blob) return input;

    /* File name'i orijinal base'inden türet; gerçek path'i (slug.webp)
       caller ayrı build ediyor — burada sadece File object metadata'sı. */
    const base = (input.name || "image").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return input; // herhangi bir hata → orijinal
  } finally {
    URL.revokeObjectURL(objectUrl); // memory cleanup
  }
}

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}
