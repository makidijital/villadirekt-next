/* ===============================================================
   🛡️ TEST STUB — "server-only" (Vitest resolve.alias hedefi)
   ===============================================================
   Gerçek üretim/dev/build ortamında `server-only` paketi Next.js'in
   kendi webpack konfigürasyonu tarafından özel olarak tanınır (client
   bundle'a sızarsa build hatası verir). Vitest bu Next-özel resolve
   mekanizmasını bilmediğinden `import "server-only"` içeren dosyaları
   TEST ETMEDEN önce çözemez ("Failed to resolve import" hatası).

   Bu dosya YALNIZ vitest.config.ts'in `resolve.alias`'ında
   `"server-only"` için hedef olarak kullanılır — test ortamında
   no-op bir modül sağlar. Next.js'in gerçek build/runtime davranışını
   ETKİLEMEZ (yalnız Vite/vitest resolve grafiğinde devreye girer).
   =============================================================== */
export {};
