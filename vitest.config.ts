import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/* ===============================================================
   🛡️ FAZ 51A — VITEST CONFIG (ESM-safe, modern)
   ===============================================================
   • `vite-tsconfig-paths` ESM-only plugin'i kaldırıldı; Vitest
     config dosyası TS/CJS loader'la yüklenirken require() ESM
     module'ünü çekemiyordu. Yerine direct `resolve.alias` ile
     `@/*` mapping tanımlandı — tsconfig.json'daki path alias ile
     birebir aynı semantic.
   • `import.meta.url` üzerinden __dirname türetiliyor (ESM-native).
   • jsdom env + setup + coverage konfigürasyonu değişmedi.
=============================================================== */

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      /* tsconfig.json paths: { "@/*": ["./*"] } — projenin kökü.
         Tek alias yeterli; subpath'ler relative çözülür. */
      "@": resolve(__dirname, "./"),
      /* 🛡️ TOTP 2FA — ADDITIVE. `server-only` gerçek bir npm paketi
         DEĞİL; Next.js'in kendi webpack konfigürasyonu bu ismi özel
         tanır (client bundle'a sızarsa build hatası). Vite/vitest bu
         mekanizmayı bilmediğinden `import "server-only"` içeren
         dosyaları test ortamında ÇÖZEMEZ. Bu alias yalnız test
         ortamında no-op bir stub'a yönlendirir — Next.js'in gerçek
         build/runtime davranışını ETKİLEMEZ, yalnız login.service.ts
         gibi server-only dosyaların DOĞRUDAN test edilebilmesini sağlar
         (mevcut testlerin hiçbiri server-only dosya import etmiyordu —
         bu yalnız YENİ TOTP gate testleri için gerekli oldu). */
      "server-only": resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist"],
    /* Deterministic clock + TZ: parseLocalDate LOCAL midnight
       semantic'i için Europe/Istanbul seed. CI/dev drift'i
       elimine eder. */
    env: {
      TZ: "Europe/Istanbul",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/services/**/*.ts"],
      exclude: ["**/*.d.ts", "**/types/**"],
    },
  },
});
