/* ===============================================================
   🛡️ /maki-admin/settings/popup — tarih seçici katman kilidi
   ===============================================================
   Kök neden: `.card-premium:hover` transform'u "Gösterim" bölümünü
   hover'da stacking context yapıyor; AdminDateInput popover'ı (z-[60])
   o bölümde hapsolup sonraki "Önizleme" kartının konumlu katmanlarının
   ARKASINDA kalıyordu. Çözüm yalnız bu sayfada: bölüm `relative z-20`
   sarmalayıcıda. Global CSS ve paylaşılan AdminDateInput DEĞİŞMEDİ.
=============================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");
const PAGE = read("app/(admin)/maki-admin/settings/popup/page.tsx");

describe("popup ayarları — tarih seçici önizlemenin üstünde", () => {
  it("Gösterim bölümü, Önizleme'den ÖNCE kapanan relative z-20 sarmalayıcıda", () => {
    const wrapStart = PAGE.indexOf('<div className="relative z-20">');
    const gosterim = PAGE.indexOf('title="Gösterim"');
    const onizleme = PAGE.indexOf("{/* ÖNİZLEME */}");
    expect(wrapStart).toBeGreaterThan(-1);
    expect(wrapStart).toBeLessThan(gosterim);
    /* Sarmalayıcı, Gösterim bölümünü kapatıp Önizleme'den önce biter. */
    const between = PAGE.slice(gosterim, onizleme);
    expect(between).toMatch(/<\/SettingsSection>\s*<\/div>\s*$/);
    /* Tarih alanları sarmalayıcının içinde. */
    expect(between).toContain('ariaLabel="Başlangıç tarihi"');
    expect(between).toContain('ariaLabel="Bitiş tarihi"');
  });

  it("z-20 admin topbar (z-30) ve mobil menünün (z-40/50) altında kalır", () => {
    const layout = read("app/(admin)/maki-admin/layout.tsx");
    expect(layout).toMatch(/admin-topbar[^"]*sticky top-0 z-30/);
  });

  it("bitiş seçicisi iki sütunda alanın sağına hizalı (taşma yok); mobilde aynı", () => {
    expect(PAGE).toContain(
      'className="min-w-0 sm:[&_[role=dialog]]:left-auto sm:[&_[role=dialog]]:right-0"'
    );
  });

  it("paylaşılan AdminDateInput popover'ı değişmedi (diğer sayfalar etkilenmez)", () => {
    const input = read("app/components/admin/shared/AdminDateInput.tsx");
    expect(input).toContain('className="absolute left-0 z-[60] mt-2 w-[300px] max-w-[calc(100vw-1rem)]');
  });
});
